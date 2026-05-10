#!/usr/bin/env python3
import json
import urllib.request
import urllib.error
BASE_URL = "http://localhost:8000"
PAGE_SIZE = 100
TARGET_STATUSES = {"QUEUED"}  # Mets {"QUEUED","RUNNING","RECEIVED"} si besoin
def get_json(url: str) -> dict:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))
def post_json(url: str, payload: dict) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
def main() -> None:
    page = 1
    to_stop = []
    while True:
        url = f"{BASE_URL}/v1/analyses?page={page}&size={PAGE_SIZE}"
        data = get_json(url)
        items = data.get("items", [])
        if not items:
            break
        for item in items:
            status = item.get("status")
            if status in TARGET_STATUSES:
                to_stop.append(item.get("analysis_id"))
        pages = data.get("pages", page)
        if page >= pages:
            break
        page += 1
    if not to_stop:
        print("Aucune analyse à stopper.")
        return
    print(f"{len(to_stop)} analyse(s) à stopper...")
    payload = {
        "status": "FAILED",
        "stage": "FAILED",
        "progress": 100,
        "error_code": "MANUAL_BULK_STOP",
        "error_message": "Stopped manually in bulk"
    }
    ok = 0
    ko = 0
    for analysis_id in to_stop:
        url = f"{BASE_URL}/v1/analyses/{analysis_id}/status"
        code, body = post_json(url, payload)
        if 200 <= code < 300:
            ok += 1
            print(f"[OK] {analysis_id}")
        else:
            ko += 1
            print(f"[KO] {analysis_id} -> HTTP {code} | {body[:180]}")
    print(f"Terminé: OK={ok}, KO={ko}")
if __name__ == "__main__":
    main()