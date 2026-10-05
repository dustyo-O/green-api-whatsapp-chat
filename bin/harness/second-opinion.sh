#!/usr/bin/env bash
# Cross-vendor review. The model that wrote the artefact never reviews it.
#
#   bin/harness/second-opinion.sh spec 027            # review functional + technical spec
#   bin/harness/second-opinion.sh code 027 [base-ref] # review the diff of spec 027 vs base (default: main)
#   bin/harness/second-opinion.sh --dry-run spec 027  # print the prompt, call nothing
#
# Env:
#   HARNESS_REVIEWER      codex (default) | claude | <any shell cmd reading prompt on stdin, writing review to stdout>
#   HARNESS_REVIEW_MODEL  passed to codex as -m (default: unset → codex default)
#   HARNESS_REVIEW_EFFORT low (default) | medium | high   — "астра на low" is the everyday setting
#   HARNESS_NO_HERDR=1    run the reviewer inline instead of in a visible herdr pane
#   HARNESS_REVIEW_TIMEOUT seconds to wait for the pane to write the review (default 1800)
#   HARNESS_KEEP_REVIEW_PANE=1  leave the reviewer pane open after the review lands (default: close it)
#   HARNESS_REVIEW_DIFF_BYTES   cap on the code diff sent to the reviewer (default 400000); context/, images, lockfiles excluded
#
# Output: context/spec/<NNN>-*/reviews/<kind>-<reviewer>-<timestamp>.md  (path printed on stdout)
set -euo pipefail

dry=0; [ "${1:-}" = "--dry-run" ] && { dry=1; shift; }
kind="${1:?spec|code}"; num="${2:?spec number, e.g. 027}"; base="${3:-main}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
dir=$(ls -d context/spec/"$num"-*/ 2>/dev/null | head -1) || true
[ -z "$dir" ] && { echo "no spec dir for $num" >&2; exit 1; }
dir="${dir%/}"; mkdir -p "$dir/reviews"

cfg() { python3 -c 'import json,sys,pathlib
p=pathlib.Path("harness.json"); c=json.loads(p.read_text()) if p.exists() else {}
for k in sys.argv[1].split("."): c=c.get(k,{}) if isinstance(c,dict) else {}
print(c if isinstance(c,str) else sys.argv[2] if len(sys.argv)>2 else "")' "$@"; }
reviewer="${HARNESS_REVIEWER:-$(cfg review.reviewer codex)}"
effort="${HARNESS_REVIEW_EFFORT:-$(cfg review.effort low)}"
stamp=$(date +%Y%m%d-%H%M)
tag="$reviewer"; case "$reviewer" in codex|claude) ;; *) tag="custom";; esac
out="$dir/reviews/$kind-$tag-$stamp.md"

# ---------- build the prompt ----------
mkdir -p "$dir/lanes"; prompt_file="$dir/lanes/review-$kind-$stamp.prompt.md"
{
  cat <<'HDR'
You are an independent reviewer from a different vendor than the author. You have no loyalty to the draft.
Be concrete and short. Every finding MUST use this exact shape so the lead can triage it mechanically:

### F<n>: <one-line title>
- severity: blocker | major | minor | nit
- where: <file:section or file:line>
- problem: <what is wrong, in one or two sentences>
- evidence: <quote or reasoning>
- fix: <the smallest change that resolves it>

End with a section `## Verdict` containing exactly one of: `SHIP`, `SHIP WITH FIXES`, `DO NOT SHIP`, and one sentence why.
Do not restate the document. Do not praise. If you find nothing, say so and give SHIP.
HDR
  # Project context for the reviewer: harness.json → review.context (list of files), else AWOS defaults if present.
  for f in $(python3 -c 'import json,pathlib
p=pathlib.Path("harness.json"); c=json.loads(p.read_text()) if p.exists() else {}
print(" ".join(c.get("review",{}).get("context",["context/product/product-definition.md","context/product/architecture.md"])))'); do
    [ -f "$f" ] && { echo; echo "## $f"; echo; cat "$f"; }
  done
  if [ "$kind" = "spec" ]; then
    cat <<'SPEC'

## Your task
Review the functional spec (and the technical considerations if present) below for:
1. Ambiguity: any requirement a QA engineer could read two ways.
2. Missing states: empty, error, offline, concurrent-device, partial-failure, undo.
3. Contradictions with the product definition / architecture above, or with itself.
4. Scope creep or scope holes vs the roadmap item.
5. Testability: can each acceptance criterion be turned into a test?
6. Technical considerations: risky unknowns not put first; contracts changed silently; migrations without rollback thought.
SPEC
    echo; echo "## functional-spec.md"; echo; cat "$dir/functional-spec.md"
    if [ -f "$dir/technical-considerations.md" ]; then echo; echo "## technical-considerations.md"; echo; cat "$dir/technical-considerations.md"; fi
  else
    cat <<'CODE'

## Your task
Review the diff below against the spec. Focus, in order:
1. Spec compliance: behaviour the spec requires that the diff does not implement, or implements differently.
2. Correctness: bugs, races, unhandled failure paths, transaction boundaries, idempotency.
3. Data safety: anything that can delete or corrupt a live user's data if a signal is misread.
4. Tests: what the tests do NOT cover that the spec requires.
5. Only then: style, naming, structure.
Ignore formatting — a formatter gate already runs.
CODE
    echo; echo "## functional-spec.md"; echo; cat "$dir/functional-spec.md"
    [ -f "$dir/technical-considerations.md" ] && { echo; echo "## technical-considerations.md"; echo; cat "$dir/technical-considerations.md"; }
    echo; echo "## Diff vs $base"; echo; echo '```diff'
    # Code only: the spec files are quoted above and context/ is not code; images and lockfiles are noise.
    # Written to a file first — `git diff | head -c` under pipefail dies with SIGPIPE (141) on a big diff.
    diff_file="$dir/lanes/review-code-$stamp.diff"; limit="${HARNESS_REVIEW_DIFF_BYTES:-400000}"
    git diff "$base"...HEAD -- . ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)uv.lock' \
      ':(exclude)pnpm-lock.yaml' ':(exclude)context/**' ':(exclude)*.png' ':(exclude)*.jpg' ':(exclude)*.svg' > "$diff_file"
    head -c "$limit" "$diff_file"
    if [ "$(wc -c < "$diff_file")" -gt "$limit" ]; then echo; echo "[diff truncated at $limit bytes of $(wc -c < "$diff_file") — HARNESS_REVIEW_DIFF_BYTES raises the cap]"; fi
    echo '```'
  fi
} > "$prompt_file"

if [ "$dry" = 1 ]; then cat "$prompt_file"; exit 0; fi

# ---------- run the reviewer ----------
. "$(dirname "${BASH_SOURCE[0]}")/_pane.sh"   # harness_have_herdr, harness_open_pane
# Run a review command either in a visible herdr pane (then wait for the output file) or inline.
in_pane_or_inline() {   # $1 = label, $2 = shell command that writes $out
  local label="$1" command="$2" timeout="${HARNESS_REVIEW_TIMEOUT:-1800}"
  if harness_have_herdr; then
    local pane
    pane=$(harness_open_pane "$label" down)
    if [ -n "$pane" ]; then
      herdr pane run "$pane" "cd '$root' && $command; echo; echo 'REVIEW WRITTEN → $out'"
      echo "second-opinion: reviewing in herdr pane $pane ($label); waiting up to ${timeout}s for $out" >&2
      local waited=0
      while [ ! -s "$out" ] && [ "$waited" -lt "$timeout" ]; do sleep 5; waited=$((waited+5)); done
      [ -s "$out" ] || { echo "second-opinion: no review after ${timeout}s — look at pane $pane" >&2; return 124; }
      if [ -z "${HARNESS_KEEP_REVIEW_PANE:-}" ]; then sleep 3; herdr pane close "$pane" >/dev/null 2>&1 || true; fi
      return 0
    fi
    echo "second-opinion: could not open a herdr pane, running inline" >&2
  fi
  sh -c "$command"
}
run_codex() {
  command -v codex >/dev/null || return 127
  local model=""; [ -n "${HARNESS_REVIEW_MODEL:-}" ] && model="-m '$HARNESS_REVIEW_MODEL'"
  in_pane_or_inline "$num review-$kind codex" \
    "codex exec --sandbox read-only --skip-git-repo-check -c 'model_reasoning_effort=\"$effort\"' $model -o '$out' - < '$prompt_file'"
}
run_claude() {
  command -v claude >/dev/null || return 127
  in_pane_or_inline "$num review-$kind claude" \
    "claude -p --model '${HARNESS_REVIEW_MODEL:-opus}' --permission-mode plan < '$prompt_file' > '$out'"
}

status=0
case "$reviewer" in
  codex)  run_codex  || status=$? ;;
  claude) run_claude || status=$? ;;
  *)      in_pane_or_inline "$num review-$kind custom" "$reviewer < '$prompt_file' > '$out'" || status=$? ;;
esac

if [ "$status" = 127 ]; then
  echo "second-opinion: '$reviewer' is not installed — FALLING BACK to claude (same vendor as the author; weaker signal)" >&2
  reviewer=claude; out="$dir/reviews/$kind-claude-fallback-$stamp.md"
  run_claude || { echo "no reviewer available" >&2; exit 1; }
elif [ "$status" != 0 ]; then
  echo "second-opinion: reviewer exited $status" >&2; exit "$status"
fi
{ echo; echo "---"; echo "_reviewer: $tag · effort: $effort · kind: $kind · base: $base · $(date -Iseconds)_"; } >> "$out"
echo "$out"
