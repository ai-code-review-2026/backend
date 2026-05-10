# GitHub Integration Tools

Scripts for GitHub PR review automation and integration.

## Scripts

### github_pr_review.py
Submits PR diff to backend API, polls for analysis completion, formats review as markdown.

Used by GitHub Actions workflows for automated PR reviews.

**Usage:**
```bash
python tools/github/github_pr_review.py \
  --pr-number 123 \
  --repo owner/repo \
  --backend-url https://api.example.com \
  --token <bearer-token> \
  --user-id <user-id>
```

**Outputs:**
- `review-output.json` - JSON analysis results
- `review-output.md` - Markdown formatted review

**GitHub Actions Integration:**
See `.github/workflows/ai-pr-review.yml` for workflow example.
