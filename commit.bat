@echo off
cd /d "C:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform"
echo === GIT STATUS ===
git --no-pager status
echo.
echo === ADDING ALL CHANGES ===
git add -A
echo.
echo === COMMITTING ===
git commit -m "fix: safe emailAddresses access in auth and API routes" ^
 -m "- Fix optional chaining for emailAddresses in lib/auth.ts" ^
 -m "- Fix email extraction in analyses API routes" ^
 -m "- Fix email extraction in auth sync route" ^
 -m "- Prevents 404 errors when Clerk user has undefined emailAddresses" ^
 -m "" ^
 -m "These changes prevent TypeErrors when accessing emailAddresses" ^
 -m "without null/undefined checks, which was causing the dashboard" ^
 -m "to render 404 page instead of loading." ^
 -m "" ^
 -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
echo.
echo === COMMIT SHA ===
git rev-parse HEAD
echo.
echo === GIT LOG ===
git --no-pager log -1
