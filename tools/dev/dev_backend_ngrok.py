from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_DASHBOARD_ENV_FILE = REPO_ROOT / "apps" / "dashboard" / ".env.local"
DEFAULT_BACKEND_DIR = REPO_ROOT / "apps" / "backend"
RUNTIME_DIR = REPO_ROOT / ".runtime"
PID_FILE = RUNTIME_DIR / "ngrok.pid"
LOG_FILE = RUNTIME_DIR / "ngrok.log"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start ngrok for the local backend, update env files, then run uvicorn."
    )
    parser.add_argument("--port", type=int, default=8000, help="Local backend port to expose")
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Env file to update with the public ngrok URL",
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
        "--ngrok-bin",
        default=os.environ.get("NGROK_BIN", "ngrok"),
        help="Ngrok executable name or absolute path",
    )
    parser.add_argument(
        "--ngrok-api-url",
        default=os.environ.get("NGROK_API_URL", "http://127.0.0.1:4040/api/tunnels"),
        help="Ngrok local API endpoint",
    )
    parser.add_argument(
        "--skip-dashboard-env",
        action="store_true",
        help="Deprecated: dashboard env is no longer rewritten by default",
    )
    parser.add_argument(
        "--sync-backend-targets",
        action="store_true",
        help="Also rewrite BACKEND_API_URL and NEXT_PUBLIC_BACKEND_URL to the ngrok URL",
    )
    return parser.parse_args()


def require_binary(binary_name: str) -> str:
    resolved = shutil.which(binary_name)
    if not resolved:
        raise RuntimeError(f"Required executable not found on PATH: {binary_name}")
    return resolved


def stop_previous_ngrok() -> None:
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


def start_ngrok(ngrok_bin: str, port: int) -> subprocess.Popen[bytes]:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    log_handle = open(LOG_FILE, "ab")
    process = subprocess.Popen(
        [ngrok_bin, "http", str(port), "--log=stdout"],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        cwd=str(REPO_ROOT),
    )
    PID_FILE.write_text(str(process.pid), encoding="utf-8")
    return process


def fetch_ngrok_tunnels(api_url: str) -> dict:
    with urlopen(api_url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def select_public_url(tunnels_payload: dict, port: int) -> str | None:
    tunnels = tunnels_payload.get("tunnels", [])
    preferred: str | None = None

    for tunnel in tunnels:
        public_url = tunnel.get("public_url")
        if not public_url or not public_url.startswith("https://"):
            continue

        config = tunnel.get("config") or {}
        addr = str(config.get("addr", ""))
        if addr.endswith(f":{port}") or f"localhost:{port}" in addr or addr == str(port):
            return public_url
        preferred = preferred or public_url

    return preferred


def wait_for_public_url(api_url: str, port: int, timeout_seconds: int = 20) -> str:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None

    while time.time() < deadline:
        try:
            payload = fetch_ngrok_tunnels(api_url)
            public_url = select_public_url(payload, port)
            if public_url:
                return public_url
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
        time.sleep(1)

    detail = f" Last error: {last_error}" if last_error else ""
    raise RuntimeError(f"Unable to read public ngrok URL from {api_url}.{detail}")


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
        "NGROK_PUBLIC_URL": public_url,
    }
    if sync_backend_targets:
        root_values["BACKEND_API_URL"] = public_url
        root_values["NEXT_PUBLIC_BACKEND_URL"] = public_url

    upsert_env_values(env_file, root_values)

    if skip_dashboard_env or not dashboard_env_file.exists():
        return

    if sync_backend_targets:
        upsert_env_values(
            dashboard_env_file,
            {
                "BACKEND_API_URL": public_url,
                "NEXT_PUBLIC_BACKEND_URL": public_url,
            },
        )


def start_backend(backend_dir: Path, port: int) -> int:
    command = [
        "poetry",
        "run",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--port",
        str(port),
    ]
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


def cleanup_processes(processes: Iterable[subprocess.Popen[bytes] | subprocess.Popen[object]]) -> None:
    for process in processes:
        if process.poll() is not None:
            continue
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

    PID_FILE.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()

    ngrok_bin = require_binary(args.ngrok_bin)
    backend_dir = Path(args.backend_dir).resolve()
    env_file = Path(args.env_file).resolve()
    dashboard_env_file = Path(args.dashboard_env_file).resolve()

    if not backend_dir.exists():
        raise RuntimeError(f"Backend directory not found: {backend_dir}")

    stop_previous_ngrok()
    ngrok_process = start_ngrok(ngrok_bin, args.port)

    try:
        public_url = wait_for_public_url(args.ngrok_api_url, args.port)
        update_env_files(
            env_file,
            dashboard_env_file,
            public_url,
            args.skip_dashboard_env,
            args.sync_backend_targets,
        )
        print(f"[ngrok] public URL: {public_url}")
        print(f"[env] updated: {env_file}")

        if args.sync_backend_targets:
            print("[warning] dashboard/backend targets were rewritten to use the public ngrok URL")
        else:
            print("[info] local backend targets were preserved for the dashboard and local server-side calls")

        if not args.skip_dashboard_env and dashboard_env_file.exists() and args.sync_backend_targets:
            print(f"[env] updated: {dashboard_env_file}")
            print("[note] restart the dashboard if it is already running to reload .env.local")

        return start_backend(backend_dir, args.port)
    finally:
        cleanup_processes([ngrok_process])


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)