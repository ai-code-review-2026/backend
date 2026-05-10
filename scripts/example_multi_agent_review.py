"""
Example usage of multi-agent code review system.

This script demonstrates how to use the agent dispatcher
to analyze code changes.
"""

import asyncio
from app.agents.agent_dispatcher import dispatch_review


async def main():
    """Run example multi-agent review."""
    
    # Example diff with various issues
    diff_content = """
diff --git a/app/api/users.py b/app/api/users.py
index abc123..def456 100644
--- a/app/api/users.py
+++ b/app/api/users.py
@@ -10,6 +10,15 @@ from app.database import get_db
 def get_user(user_id: str, db: Session = Depends(get_db)):
     # Get user from database
-    return db.query(User).filter_by(id=user_id).first()
+    query = f"SELECT * FROM users WHERE id = '{user_id}'"
+    result = db.execute(query)
+    return result.first()
+
+@router.post("/users")
+def create_user(username: str, password: str, db: Session = Depends(get_db)):
+    # Create new user
+    user = User(username=username, password=password)
+    db.add(user)
+    db.commit()
+    return user

diff --git a/Dockerfile b/Dockerfile
index abc123..def456 100644
--- a/Dockerfile
+++ b/Dockerfile
@@ -1,3 +1,5 @@
 FROM python:latest
 
-RUN pip install -r requirements.txt
+COPY . /app
+WORKDIR /app
+RUN pip install -r requirements.txt
"""
    
    changed_files = [
        "app/api/users.py",
        "Dockerfile",
    ]
    
    print("=" * 80)
    print("Multi-Agent Code Review System - Example")
    print("=" * 80)
    print()
    print(f"Analyzing {len(changed_files)} changed files...")
    print()
    
    # Run multi-agent review
    findings = await dispatch_review(
        diff_content=diff_content,
        changed_files=changed_files,
        project_type="python",
    )
    
    print(f"Found {len(findings)} issues:")
    print()
    
    # Group findings by severity
    by_severity = {}
    for finding in findings:
        severity = finding.severity
        if severity not in by_severity:
            by_severity[severity] = []
        by_severity[severity].append(finding)
    
    # Print findings by severity
    for severity in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        if severity not in by_severity:
            continue
        
        issues = by_severity[severity]
        print(f"\n{severity} ({len(issues)} issues)")
        print("-" * 80)
        
        for finding in issues:
            print(f"\n  [{finding.agent_id}] {finding.file_path}:{finding.line}")
            print(f"  Category: {finding.category}")
            print(f"  Message: {finding.message}")
            if finding.suggestion:
                print(f"  Suggestion: {finding.suggestion}")
            if finding.rule_id:
                print(f"  Rule: {finding.rule_id}")
            print(f"  Confidence: {finding.confidence:.2f}")
    
    print()
    print("=" * 80)
    print("Review complete!")
    print("=" * 80)
    
    # Summary by agent
    print("\nFindings by agent:")
    by_agent = {}
    for finding in findings:
        agent = finding.agent_id
        if agent not in by_agent:
            by_agent[agent] = 0
        by_agent[agent] += 1
    
    for agent, count in sorted(by_agent.items()):
        print(f"  {agent}: {count} issues")


if __name__ == "__main__":
    # Note: This requires the LLM gateway to be properly configured
    # and an LLM provider (Ollama, OpenAI, Anthropic) to be available.
    
    print("\nNote: This example requires LLM_ENABLED=true and a configured LLM provider.")
    print("If you haven't set up an LLM provider, the agents will return empty results.")
    print()
    
    asyncio.run(main())
