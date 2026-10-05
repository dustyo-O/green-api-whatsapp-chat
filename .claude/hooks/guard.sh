#!/usr/bin/env bash
# PreToolUse guard for Bash. Reads the tool call as JSON on stdin.
# Exit 2 = block the call and show the reason to the agent. Exit 0 = allow.
set -euo pipefail
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)
[ -z "$cmd" ] && exit 0

deny() { echo "guard.sh: blocked — $1" >&2; exit 2; }

# Destructive filesystem
echo "$cmd" | grep -Eq '(^|[;&|]\s*)rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(/|~|\$HOME|\.)(\s|$)' && deny "rm -rf on a root-like path"
echo "$cmd" | grep -Eq 'git\s+clean\s+-[a-zA-Z]*f' && deny "git clean -f wipes untracked work"

# Rewriting shared history
echo "$cmd" | grep -Eq 'git\s+push\s+.*(--force|-f\b)' && deny "force push"
echo "$cmd" | grep -Eq 'git\s+(reset\s+--hard|checkout\s+--\s+\.|restore\s+\.)' && deny "hard reset / mass restore — commit or stash first"

# Committing straight to main from the lead session
if echo "$cmd" | grep -Eq 'git\s+(commit|merge|rebase)'; then
  branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ "$branch" = "main" ] && [ -z "${HARNESS_ALLOW_MAIN:-}" ]; then
    deny "on branch main — work in a lane worktree or a feature branch (set HARNESS_ALLOW_MAIN=1 to override)"
  fi
fi

# Secrets & state
echo "$cmd" | grep -Eq '(cat|less|head|tail|grep)\s+.*(\.env(\.|\s|$)|\.tfstate)' && deny "reading secrets/state files"
echo "$cmd" | grep -Eq 'terraform\s+(apply|destroy)|tofu\s+(apply|destroy)' && deny "terraform apply/destroy is a human action (infra.yml manual dispatch)"

exit 0
