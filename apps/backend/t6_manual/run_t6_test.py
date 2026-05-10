import json, time, urllib.request, random

with urllib.request.urlopen("http://localhost:8000/healthz", timeout=5) as r:
    print("health:", r.read().decode())

nonce = random.randint(0, 0xFFFFFFFF)
diff_text = f"""diff --git a/t6_manual/demo.py b/t6_manual/demo.py
index 1111111..2222222 100644
--- a/t6_manual/demo.py
+++ b/t6_manual/demo.py
@@ -0,0 +1,9 @@
+# run {nonce}
+import os
+import subprocess
+
+def run(cmd: str):
+    return eval(cmd)
+
+def run2(cmd: str):
+    return subprocess.run(cmd, shell=True)
"""

payload = {
    "source": "manual",
    "repo": "owner/t6-manual",
    "pr_number": 656,
    "commit_sha": f"{random.randint(0, 0xFFFFFFFF):08x}",
    "diff_text": diff_text,
    "metadata": {"actor": "manual-test"},
}

req = urllib.request.Request(
    "http://localhost:8000/v1/analyze",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=20) as r:
        created = json.loads(r.read().decode())
    analysis_id = created["analysis_id"]
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    if e.code == 409 and body.get("error", {}).get("code") == "DUPLICATE_ANALYSIS":
        analysis_id = body["error"]["details"]["existing_id"]
        print(f"Duplicate detected, reusing existing analysis: {analysis_id}")
    else:
        print(f"HTTP {e.code}: {json.dumps(body)}")
        raise
print("analysis_id:", analysis_id)

for i in range(1, 31):
    with urllib.request.urlopen(f"http://localhost:8000/v1/analyses/{analysis_id}", timeout=20) as r:
        data = json.loads(r.read().decode())
    print(f"[{i}] status={data['status']}")
    if data["status"] in ("COMPLETED", "FAILED"):
        print("static_stats:", json.dumps(data.get("static_stats", {}), indent=2))
        print("static_findings_count:", len(data.get("static_findings", [])))
        for f in data.get("static_findings", [])[:10]:
            print("-", f.get("source"), f.get("rule_id"), f.get("severity"), f.get("file_path"), f.get("line_start"))
        break
    time.sleep(2)
