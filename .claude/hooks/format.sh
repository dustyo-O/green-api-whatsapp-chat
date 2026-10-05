#!/usr/bin/env bash
# PostToolUse: format the file that was just written, so gates never fail on formatting.
# Generic: picks the formatter by extension and looks for it from the file's directory upwards. Silent on miss.
set -uo pipefail
input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
dir=$(dirname "$file")
up() { local d="$dir"; while [ "$d" != "/" ] && [ "${d#$root}" != "$d" ]; do [ -e "$d/$1" ] && { echo "$d"; return; }; d=$(dirname "$d"); done; [ -e "$root/$1" ] && echo "$root"; }
case "$file" in
  *.py)  d=$(up pyproject.toml); [ -n "$d" ] && (cd "$d" && { command -v uv >/dev/null && uv run ruff format "$file" && uv run ruff check --fix -q "$file"; } || { command -v ruff >/dev/null && ruff format "$file"; }) >/dev/null 2>&1 ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md) d=$(up node_modules/.bin/prettier); [ -n "$d" ] && (cd "$d" && node_modules/.bin/prettier --log-level silent -w "$file") >/dev/null 2>&1 ;;
  *.tf)  command -v terraform >/dev/null && terraform fmt "$file" >/dev/null 2>&1 ;;
  *.go)  command -v gofmt >/dev/null && gofmt -w "$file" >/dev/null 2>&1 ;;
  *.rs)  command -v rustfmt >/dev/null && rustfmt "$file" >/dev/null 2>&1 ;;
esac
exit 0
