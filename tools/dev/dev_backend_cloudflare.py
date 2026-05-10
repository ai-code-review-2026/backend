from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_DASHBOARD_ENV_FILE = REPO_ROOT / "apps" / "dashboard" / ".env.local"
DEFAULT_BACKEND_DIR = REPO_ROOT / "apps" / "backend"
RUNTIME_DIR = REPO_ROOT / ".runtime"
PID_FILE = RUNTIME_DIR / "cloudflared.pid"
LOG_FILE = RUNTIME_DIR / "cloudflared.log"
QUICK_TUNNEL_PATTERN = re.compile(r"https://[a-z0-9.-]+\.trycloudflare\.com", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start a Cloudflare Quick Tunnel for the local backend, update env files, then run uvicorn."
    )
    parser.add_argument("--port", type=int, default=8000, help="Local backend port to expose")
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Env file to update with the public Quick Tunnel URL",
    )
    parser.add_argument(
        "--dashboard-env-file",
        default=str(DEFAULT_DASHBOARD_ENV_FILE),
        help="Dashboard env file to update with backend URLs",
    )
    parser.add_argument(
        "--backend-dir",
        default=str(DEFAULT_BACKEND_DIR),
        help="Backend working directory",
    )
    parser.add_argument(
        "--cloudflared-bin",
        default=os.environ.get("CLOUDFLARED_BIN", "cloudflared"),
        help="cloudflared executable name or absolute path",
    )
    parser.add_argument(
        "--skip-dashboard-env",
        action="store_true",
        help="Do not rewrite apps/dashboard/.env.local even when syncing backend targets",
    )
    parser.add_argument(
        "--sync-backend-targets",
        action="store_true",
        help="Also rewrite BACKEND_API_URL and NEXT_PUBLIC_BACKEND_URL to the Quick Tunnel URL",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Run uvicorn without --reload",
    )
    return parser.parse_args()


def require_binary(binary_name: str) -> str:
    resolved = shutil.which(binary_name)
    if not resolved:
        raise RuntimeError(f"Required executable not found on PATH: {binary_name}")
    return resolved


def stop_previous_cloudflared() -> None:
    if not PID_FILE.exists():
        return

    pid_text = PID_FILE.read_text(encoding="utf-8").strip()
    PID_FILE.unlink(missing_ok=True)
    if not pid_text:
        return

    try:
        pid = int(pid_text)
    except ValueError:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return


class TunnelOutputMonitor:
    def __init__(self, stream, log_path: Path) -> None:
        self._stream = stream
        self._log_handle = open(log_path, "ab")
        self._public_url: str | None = None
        self._ready = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    @property
    def public_url(self) -> str | None:
        return self._public_url

    def start(self) -> None:
        self._thread.start()

    def wait_for_public_url(self, timeout_seconds: int) -> str:
        if not self._ready.wait(timeout_seconds):
            raise RuntimeError(
                f"Unable to read Cloudflare Quick Tunnel URL within {timeout_seconds} seconds. See {LOG_FILE}."
            )
        if not self._public_url:
            raise RuntimeError("Cloudflare Quick Tunnel started but no public URL was detected.")
        return self._public_url

    def close(self) -> None:
        self._thread.join(timeout=1)
        self._log_handle.close()

    def _run(self) -> None:
        if self._stream is None:
            return

        for raw_line in iter(self._stream.readline, b""):
            self._log_handle.write(raw_line)
            self._log_handle.flush()

            decoded = raw_line.decode("utf-8", errors="replace")
            match = QUICK_TUNNEL_PATTERN.search(decoded)
            if match and not self._public_url:
                self._public_url = match.group(0)
                self._ready.set()


def start_cloudflared(cloudflared_bin: str, port: int) -> tuple[subprocess.Popen[bytes], TunnelOutputMonitor]:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen(
        [cloudflared_bin, "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(REPO_ROOT),
    )
    PID_FILE.write_text(str(process.pid), encoding="utf-8")

    monitor = TunnelOutputMonitor(process.stdout, LOG_FILE)
    monitor.start()
    return process, monitor


def upsert_env_values(env_path: Path, values: dict[str, str]) -> None:
    existing_lines: list[str] = []
    if env_path.exists():
        existing_lines = env_path.read_text(encoding="utf-8").splitlines()

    found_keys: set[str] = set()
    updated_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            updated_lines.append(line)
            continue

        key, _, _ = line.partition("=")
        key = key.strip()
        if key in values:
            updated_lines.append(f"{key}={values[key]}")
            found_keys.add(key)
        else:
            updated_lines.append(line)

    for key, value in values.items():
        if key not in found_keys:
            updated_lines.append(f"{key}={value}")

    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")


def update_env_files(
    env_file: Path,
    dashboard_env_file: Path,
    public_url: str,
    skip_dashboard_env: bool,
    sync_backend_targets: bool,
) -> None:
    root_values = {
        "BASE_URL": public_url,
        "CLOUDFLARE_QUICK_TUNNEL_URL": public_url,
    }
    if sync_backend_targets:
        root_values["BACKEND_API_URL"] = public_url
        root_values["NEXT_PUBLIC_BACKEND_URL"] = public_url

    upsert_env_values(env_file, root_values)

    if skip_dashboard_env or not dashboard_env_file.exists() or not sync_backend_targets:
        return

    upsert_env_values(
        dashboard_env_file,
        {
            "BACKEND_API_URL": public_url,
            "NEXT_PUBLIC_BACKEND_URL": public_url,
        },
    )


def start_backend(backend_dir: Path, port: int, *, reload_enabled: bool) -> int:
    command = [
        "poetry",
        "run",
        "uvicorn",
        "app.main:app",
        "--port",
        str(port),
    ]
    if reload_enabled:
        command.insert(-2, "--reload")

    process = subprocess.Popen(command, cwd=str(backend_dir))
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            return process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            return process.wait()


def cleanup_processes(
    processes: Iterable[subprocess.Popen[bytes] | subprocess.Popen[object]],
    monitor: TunnelOutputMonitor | None = None,
) -> None:
    for process in processes:
        if process.poll() is not None:
            continue
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

    if monitor is not None:
        monitor.close()

    PID_FILE.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()

    cloudflared_bin = require_binary(args.cloudflared_bin)
    backend_dir = Path(args.backend_dir).resolve()
    env_file = Path(args.env_file).resolve()
    dashboard_env_file = Path(args.dashboard_env_file).resolve()

    if not backend_dir.exists():
        raise RuntimeError(f"Backend directory not found: {backend_dir}")

    stop_previous_cloudflared()
    cloudflared_process, monitor = start_cloudflared(cloudflared_bin, args.port)

    try:
        deadline = time.time() + 30
        public_url: str | None = None
        while time.time() < deadline:
            if cloudflared_process.poll() is not None:
                raise RuntimeError(f"cloudflared exited early. See {LOG_FILE}.")
            try:
                public_url = monitor.wait_for_public_url(timeout_seconds=1)
                break
            except RuntimeError:
                pass

        if not public_url:
            raise RuntimeError(f"Unable to read Cloudflare Quick Tunnel URL. See {LOG_FILE}.")

        update_env_files(
            env_file,
            dashboard_env_file,
            public_url,
            args.skip_dashboard_env,
            args.sync_backend_targets,
        )

        print(f"[cloudflare] public URL: {public_url}")
        print(f"[env] updated: {env_file}")
        print("[note] copy this URL into Vercel BACKEND_API_URL and NEXT_PUBLIC_BACKEND_URL if the tunnel URL changed")

        if args.sync_backend_targets:
            print("[warning] local backend targets were rewritten to use the public Quick Tunnel URL")
        else:
            print("[info] local backend targets were preserved for the dashboard and local server-side calls")

        if not args.skip_dashboard_env and dashboard_env_file.exists() and args.sync_backend_targets:
            print(f"[env] updated: {dashboard_env_file}")
            print("[note] restart the dashboard if it is already running to reload .env.local")

        return start_backend(backend_dir, args.port, reload_enabled=not args.no_reload)
    finally:
        cleanup_processes([cloudflared_process], monitor=monitor)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
