#!/usr/bin/env bash
# Consult a specialist agent as a REAL, INTERACTIVE `claude` session in its own herdr pane — never via the Agent
# tool, never silently. Used wherever an AWOS command says "invoke the specialist via Agent(...)" (/awos:tech,
# /awos:tasks, /awos:implement, brownfield explorations): the lead writes a prompt, this script runs the agent as
# a sibling session you can watch, type into and kill (exactly like a swarm lane), and the answer lands in a file
# the lead quotes verbatim.
#
#   bin/harness/consult.sh <agent> <slug> [--spec NNN] [--no-wait] [--dry-run] < prompt.md
#   bin/harness/consult.sh wait <answer-file>...            # block until every --no-wait answer has landed
#
#   <agent>   a name from .claude/agents/*.md (the session runs with `claude --agent <agent>`, so its
#             frontmatter — skills, model, tools — applies) or `general` for a plain session
#   <slug>    short label for the pane and the file name, e.g. api-sections
#   --spec    answers go to context/spec/NNN-*/consults/ (default: context/inbox/consults/)
#   --no-wait launch and return the answer path at once; run several, then `consult.sh wait ...`
#
# The session runs in the same permission mode as lanes (HARNESS_CONSULT_PERMS, default `auto`): reads and safe
# commands are approved by the classifier, anything else prompts IN THE PANE, where a human can answer. It is
# explicitly allowed to write exactly one file — its answer — and told to write nothing else.
#
# Env: HARNESS_CONSULT_PERMS (auto|acceptEdits|manual, default auto), HARNESS_CONSULT_MODEL (--model),
#      HARNESS_CONSULT_TIMEOUT (s, default 1800), HARNESS_KEEP_PANE=1 (leave the pane open after the answer),
#      HARNESS_NO_HERDR=1 (no herdr on this machine: falls back to headless `claude -p`, the ONLY silent path).
# Cleanup is automatic: every launch forks a detached watcher that appends the footer and CLOSES THE PANE when the
# answer lands (HARNESS_KEEP_PANE=1 to keep it), whether or not the lead ever calls `wait`. A pane is left open only
# when no answer arrived within the timeout — then there is something to look at (marker: <answer>.timeout).
# Output: the answer file path on stdout. The prompt is kept next to it (*.prompt.md) so the exchange is reviewable.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"; cd "$root"

# ---------- wait mode ----------
if [ "${1:-}" = "wait" ]; then
  shift; timeout="${HARNESS_CONSULT_TIMEOUT:-1800}"; waited=0; rc=0
  for f in "$@"; do
    base="${f%.md}"
    while [ ! -s "$f" ] && [ ! -f "$base.timeout" ] && [ "$waited" -lt "$timeout" ]; do sleep 5; waited=$((waited+5)); done
    if [ -s "$f" ]; then
      grace=0; while [ -f "$base.pane" ] && [ "$grace" -lt 30 ]; do sleep 1; grace=$((grace+1)); done   # watcher: footer + pane close
      echo "consult: landed $f (pane closed)" >&2
    else echo "consult: NO ANSWER: $f — pane $(cat "$base.pane" 2>/dev/null || echo '?') left open for you to look at" >&2; rc=124; fi
  done
  exit $rc
fi

agent="${1:?agent name (from .claude/agents/) or 'general'}"; slug="${2:?slug}"; shift 2
spec=""; nowait=0; dry=0
while [ $# -gt 0 ]; do case "$1" in
  --spec) spec="$2"; shift 2;; --no-wait) nowait=1; shift;; --dry-run) dry=1; shift;;
  --write) shift;;   # accepted for compatibility; the answer file is always writable, nothing else is granted
  *) echo "consult: unknown flag $1" >&2; exit 2;; esac; done
if [ "$agent" != general ] && [ ! -f ".claude/agents/$agent.md" ]; then echo "consult: no .claude/agents/$agent.md" >&2; exit 1; fi

if [ -n "$spec" ]; then
  dir=$(ls -d context/spec/"$spec"-*/ 2>/dev/null | head -1) || true
  [ -z "$dir" ] && { echo "consult: no spec dir for $spec" >&2; exit 1; }
  dir="${dir%/}/consults"; label_prefix="$spec"
else dir="context/inbox/consults"; label_prefix="inbox"; fi
mkdir -p "$dir"
stamp=$(date +%Y%m%d-%H%M%S); base="$dir/$agent-$slug-$stamp"; prompt_file="$base.prompt.md"; out="$base.md"
sentinel="CONSULT $agent $slug: DONE"

# ---------- build the prompt: identity header + the lead's prompt from stdin ----------
{
  if [ "$agent" != general ]; then
    echo "You are running as the **\`$agent\`** agent (\`claude --agent $agent\`): your instructions are \`.claude/agents/$agent.md\`; the skills it lists are in \`.claude/skills/\`. Read \`CLAUDE.md\` first."
  else
    echo "You are a consulted engineer in a sibling session of the lead. Read \`CLAUDE.md\` first."
  fi
  echo "This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to \`$out\` with the Write tool (that path is pre-approved), then end your turn with exactly this line:"
  echo; echo "    $sentinel"; echo
  echo "The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts."
  echo; echo "---"; echo
  cat
} > "$prompt_file"

perms="${HARNESS_CONSULT_PERMS:-auto}"
model=""; [ -n "${HARNESS_CONSULT_MODEL:-}" ] && model="--model '$HARNESS_CONSULT_MODEL'"
agent_flag=""; [ "$agent" != general ] && agent_flag="--agent '$agent'"
allow_json="{\"permissions\":{\"allow\":[\"Write($out)\"]}}"
label="$label_prefix consult $agent $slug"
interactive="cd '$root' && claude $agent_flag --permission-mode $perms $model --settings '$allow_json' \"\$(cat '$prompt_file')\"; echo; echo 'CONSULT SESSION ENDED — this pane closes in 20s (Ctrl+C to keep it)'; sleep 20"
headless="cd '$root' && claude -p $agent_flag --permission-mode $perms $model --settings '$allow_json' < '$prompt_file' > '$out.transcript.md'"
if [ "$dry" = 1 ]; then echo "# would run in pane '$label':"; echo "$interactive"; echo; cat "$prompt_file"; exit 0; fi

# ---------- run it: interactive session in a herdr pane; headless only when there is no herdr ----------
. "$(dirname "${BASH_SOURCE[0]}")/_pane.sh"   # harness_have_herdr, harness_open_pane
timeout="${HARNESS_CONSULT_TIMEOUT:-1800}"
footer="_consult: $agent · perms: $perms · model: ${HARNESS_CONSULT_MODEL:-default} · $(date -Iseconds)_"

# The watcher is what guarantees cleanup: forked and disowned at launch, it outlives this script and the lead's
# `wait`. When the answer lands it appends the footer and closes the pane (unless HARNESS_KEEP_PANE=1); when the
# timeout passes with no answer it leaves the pane open (there is something to look at) and writes a .timeout marker.
# The sidecar $base.pane exists while the watcher is alive — `wait` uses it to know cleanup has finished.
start_watcher() {   # $1 = pane id
  echo "$1" > "$base.pane"
  ( waited=0
    while [ ! -s "$out" ] && [ "$waited" -lt "$timeout" ]; do sleep 5; waited=$((waited+5)); done
    if [ -s "$out" ]; then
      { echo; echo "---"; echo "$footer"; } >> "$out"
      [ -z "${HARNESS_KEEP_PANE:-}" ] && { sleep 3; herdr pane close "$1" >/dev/null 2>&1 || true; }
    else
      echo "no answer after ${timeout}s; pane $1 left open" > "$base.timeout"
    fi
    rm -f "$base.pane"
  ) >/dev/null 2>&1 < /dev/null &
  disown 2>/dev/null || true
}
wait_here() {   # block until the answer landed AND the watcher finished (footer + pane closed)
  local waited=0
  while [ ! -s "$out" ] && [ "$waited" -lt "$timeout" ]; do sleep 5; waited=$((waited+5)); done
  [ -s "$out" ] || { echo "consult: no answer after ${timeout}s — look at pane $(cat "$base.pane" 2>/dev/null || echo '?')" >&2; return 124; }
  local grace=0; while [ -f "$base.pane" ] && [ "$grace" -lt 30 ]; do sleep 1; grace=$((grace+1)); done
  echo "$out"
}

if harness_have_herdr; then
  pane=$(harness_open_pane "$label" down)
  if [ -n "$pane" ]; then
    herdr pane run "$pane" "$interactive"
    start_watcher "$pane"
    echo "consult: $agent working interactively in herdr pane $pane ($label) → $out (pane closes itself when the answer lands)" >&2
    if [ "$nowait" = 1 ]; then echo "$out"; exit 0; fi
    wait_here; exit $?
  fi
  echo "consult: could not open a herdr pane" >&2; exit 1
fi
echo "consult: no herdr — running HEADLESS (claude -p, silent) → transcript in $out.transcript.md" >&2
if [ "$nowait" = 1 ]; then ( sh -c "$headless"; { echo; echo "---"; echo "$footer"; } >> "$out"; ) >/dev/null 2>&1 & echo "$out"; exit 0; fi
sh -c "$headless"; { echo; echo "---"; echo "$footer"; } >> "$out"; echo "$out"
