#!/usr/bin/env bash
# Swarm launcher: one REAL `claude` session per lane, each in its own git worktree, each in its own herdr pane.
# The lead (also a claude session, in its own pane) calls this, then waits, reads, merges.
#
#   bin/harness/swarm.sh launch <NNN> [--slice N|FN] [--dry-run] # worktrees + briefs + panes (FN: a fix slice, out of order)
#   bin/harness/swarm.sh status <NNN>                            # agent_status per lane
#   bin/harness/swarm.sh resume <NNN> <lane>                     # restart a lane whose session died (kept worktree)
#   bin/harness/swarm.sh wait   <NNN> [--timeout 45m]            # block until every lane is done/blocked, dump logs
#   bin/harness/swarm.sh merge  <NNN>                            # merge lane branches in plan order (no-ff), stop on conflict
#   bin/harness/swarm.sh clean  <NNN>                            # close lane panes + remove worktrees (branches stay)
#   bin/harness/swarm.sh panes  <NNN>                            # just close every pane labelled "<NNN> …"
#   bin/harness/swarm.sh selftest <NNN>                          # report matcher vs the real brief
#
# Env: HARNESS_LANE_PERMS  auto (default) | acceptEdits | bypassPermissions   — the guard hook applies in every mode.
#      auto = the classifier answers routine prompts (the user was switching every lane to it by hand); a lane
#      that still blocks is waiting on something the classifier would not sign off — answer it in the pane.
#      HARNESS_NO_HERDR=1  run lanes headless with `claude -p` + nohup instead of herdr panes
set -euo pipefail
cmd="${1:?launch|resume|status|wait|merge|clean|panes}"; num="${2:?spec number}"; shift 2
root="$(git rev-parse --show-toplevel)"; cd "$root"
cfg() { python3 -c 'import json,sys,pathlib
p=pathlib.Path("harness.json"); c=json.loads(p.read_text()) if p.exists() else {}
for k in sys.argv[1].split("."): c=c.get(k,{}) if isinstance(c,dict) else {}
print(c if isinstance(c,str) else sys.argv[2] if len(sys.argv)>2 else "")' "$@"; }
prefix="$(cfg ticket_prefix TKT)"
# Lane commit message template (harness.json → commit_format). Placeholders {ticket} {slice} {lane};
# `<…>` parts are left for the lane to fill. Multi-line is fine (e.g. a Conventional Commits footer).
commit_format="$(cfg commit_format '{ticket} s{slice}/{lane}: <what>')"
spec_dir=$(ls -d context/spec/"$num"-*/ | head -1); spec_dir="${spec_dir%/}"
state="$spec_dir/lanes"; mkdir -p "$state"
wt_root="$(dirname "$root")/wt-$(basename "$root")"
. "$(dirname "${BASH_SOURCE[0]}")/_pane.sh"   # harness_have_herdr, harness_open_pane
pane_status() { herdr pane get "$1" 2>/dev/null | python3 -c 'import json,sys,re
t=sys.stdin.read(); m=re.search(r"agent_status\"?\s*[:=]\s*\"?(\w+)",t); print(m.group(1) if m else "unknown")'; }
# The lane's final report line. Not anchored at ^ (the terminal renders it "⏺ LANE …" or indented in a code
# fence) but anchored at $: the brief's own template line reads `LANE <lane>: DONE|PARTIAL|BLOCKED` and Claude
# Code echoes the brief at the top of the transcript, so a prefix match would take the prompt for the report.
report_re() { printf 'LANE %s: (DONE|PARTIAL|BLOCKED)[[:space:]]*$' "$1"; }   # $1 = lane
has_report() { grep -qE "$(report_re "$2")" "$1" 2>/dev/null; }             # $1 = log, $2 = lane

case "$cmd" in
# ------------------------------------------------------------------ launch
launch)
  slice_arg=""; dry=0
  while [ $# -gt 0 ]; do case "$1" in --slice) slice_arg="$2"; shift 2;; --dry-run) dry=1; shift;; *) shift;; esac; done
  # A /harness:fix slice (F<n>) is launched directly: it sits after slices whose [User] device checks can stay
  # open for weeks, and "first open slice" would otherwise never reach it. Numbered slices stay sequential.
  case "$slice_arg" in
    F*) plan=$(python3 bin/harness/lanes.py "$num" --slice "$slice_arg") ;;
    *)  plan=$(python3 bin/harness/lanes.py "$num") ;;
  esac
  slice_n=$(printf '%s' "$plan" | python3 -c 'import json,sys; s=json.load(sys.stdin)["slices"]; print(s[0]["slice"] if s else "")')
  [ -z "$slice_n" ] && { echo "nothing open in $spec_dir${slice_arg:+ for slice $slice_arg}"; exit 0; }
  [ -n "$slice_arg" ] && [ "$slice_arg" != "$slice_n" ] && { echo "first open slice is $slice_n, not $slice_arg (slices are sequential)"; exit 1; }
  lanes=$(printf '%s' "$plan" | python3 -c 'import json,sys; s=json.load(sys.stdin)["slices"][0]
for l in s["lanes"]:
    print(l["lane"], l["agent"], "|".join(l["owns"]), "\x1f".join(l["tasks"]), l.get("gate",""), sep="\t")')
  human=$(printf '%s' "$plan" | python3 -c 'import json,sys; s=json.load(sys.stdin)["slices"][0]; print("\n".join("- "+h for h in s["human"]))')
  leadsteps=$(printf '%s' "$plan" | python3 -c 'import json,sys; s=json.load(sys.stdin)["slices"][0]; print("\n".join("- "+h for h in s.get("lead",[])))')
  # Ticket for lane commit messages: the one named in the slice title (a /harness:fix slice carries its own
  # <prefix>-n), else the first in tasks.md (the spec's ticket), else the spec number.
  ticket=$(printf '%s' "$plan" | python3 -c 'import json,re,sys; m=re.search(sys.argv[1]+r"-\d+", json.load(sys.stdin)["slices"][0]["title"]); print(m.group(0) if m else "")' "$prefix")
  [ -n "$ticket" ] || ticket=$(grep -oE "$prefix-[0-9]+" "$spec_dir/tasks.md" | head -1 || echo "$num")
  base_branch=$(git rev-parse --abbrev-ref HEAD)
  [ "$base_branch" = "main" ] && { echo "lead is on main — create feat/$ticket-… first"; exit 1; }
  # Keep any lanes already launched for this slice: a slice is often relaunched for a follow-up
  # task (a lane that came back BLOCKED, a task added mid-slice). Truncating here orphaned the
  # first launch's panes and worktrees, because `clean` only knows what this file lists.
  prev="$state/slice-$slice_n.tsv"; [ -f "$prev" ] || : > "$prev"
  printf '%s\n' "$lanes" | while IFS=$'\t' read -r lane agent owns tasks gate_cmd; do
    [ -z "$lane" ] && continue
    branch="lane/$num-s$slice_n-$lane"; wt="$wt_root/$num-s$slice_n-$lane"
    brief="$state/s$slice_n-$lane.md"
    # Computed OUTSIDE the brief's string: a `case` inside "$(...)" is mis-parsed by macOS bash 3.2 and the
    # backticks in the recipe names were being executed — `swarm.sh launch` ran `just ci-backend` on the lead.
    if [ -n "$gate_cmd" ]; then gate="\`$gate_cmd\`"; else gate='the project gate for your files (see harness.json → lanes.<agent>.gate; none configured — ask the lead)'; fi
    commit_msg=$(python3 -c 'import sys; f,t,s,l=sys.argv[1:]; print(f.replace("{ticket}",t).replace("{slice}",s).replace("{lane}",l))' "$commit_format" "$ticket" "$slice_n" "$lane")
    {
      echo "# Lane brief — spec $num, slice $slice_n, lane \`$lane\`"
      echo; echo "You are running as the **\`$agent\`** agent: read \`.claude/agents/$agent.md\` first and follow it. Skills it lists are in \`.claude/skills/\`."
      echo "You are alone in git worktree \`$wt\` on branch \`$branch\` (base: \`$base_branch\`). Other lanes run in parallel in other worktrees — you will never see their files, do not wait for them."
      echo; echo "## Your tasks, in order (do these and nothing else)"
      printf '%s' "$tasks" | tr '\037' '\n' | sed 's/^/- [ ] /'
      echo; echo "## Rules"
      echo "- You own: \`$(echo "$owns" | tr '|' ' ')\`. If a task needs a file outside that, STOP and report \`BLOCKED: needs <path>\` — do not edit it."
      echo "- Gate before you finish: $gate. Not green → not done. Never delete or skip a test to make it green."
      echo "- Commit small. Message format — fill in the \`<…>\` parts, keep the rest verbatim:"
      echo '  ```'; printf '%s\n' "$commit_msg" | sed 's/^/  /'; echo '  ```'
      echo "  Leave \`git status\` clean."
      echo "- Human steps are not yours; if a task says Verify — device or [User], skip it and say so."
      echo "- Your LAST message must be exactly this shape, the lead parses it:"
      echo '```'; echo "LANE $lane: DONE|PARTIAL|BLOCKED"; echo "- <task 1>: done — <two-line ledger note: what actually happened, any surprise>"; echo "- <task 2>: blocked — <why>"; echo '```'
      echo; echo "## Standing rules from tasks.md"; sed -n '/Standing rules/,/^---/p' "$spec_dir/tasks.md" | head -40
      echo; echo "---"; echo "# functional-spec.md"; cat "$spec_dir/functional-spec.md"
      [ -f "$spec_dir/technical-considerations.md" ] && { echo; echo "---"; echo "# technical-considerations.md"; cat "$spec_dir/technical-considerations.md"; }
    } > "$brief"
    printf '%s\t%s\t%s\t%s\t%s\n' "$lane" "$agent" "$branch" "$wt" "-" >> "$state/slice-$slice_n.tsv"
    echo "lane $lane  agent=$agent  branch=$branch  wt=$wt  brief=$brief"
  done
  [ -n "$leadsteps" ] && { echo; echo "LEAD steps in this slice (yours, after the lanes report):"; echo "$leadsteps"; }
  [ -n "$human" ] && { echo; echo "HUMAN steps in this slice (not assigned):"; echo "$human"; }
  [ "$dry" = 1 ] && { echo; echo "(dry-run: no worktrees, no sessions)"; exit 0; }

  perms="${HARNESS_LANE_PERMS:-auto}"
  tmp="$state/slice-$slice_n.tsv.new"; : > "$tmp"
  while IFS=$'\t' read -r lane agent branch wt prev_pane; do
    if [ -d "$wt" ]; then
      # Already launched for this slice: keep its row (pane id included) so `clean` and `resume`
      # can still find it — dropping it here is what emptied the file on the second relaunch.
      printf '%s\t%s\t%s\t%s\t%s\n' "$lane" "$agent" "$branch" "$wt" "${prev_pane:--}" >> "$tmp"
      echo "lane $lane already running for slice $slice_n (worktree $wt) — skipping; `resume` restarts it" >&2
      continue
    fi
    git worktree add -B "$branch" "$wt" "$base_branch" >/dev/null
    brief="$state/s$slice_n-$lane.md"
    launch="cd '$wt' && claude --permission-mode $perms \"\$(cat '$root/$brief')\"; echo; echo 'LANE SESSION ENDED — this pane closes in 20s (Ctrl+C to keep it)'; sleep 20"
    pane="-"
    if harness_have_herdr; then
      pane=$(harness_open_pane "$num $lane" right)
      [ -n "$pane" ] || { echo "could not open a pane; falling back to headless for $lane" >&2; pane="-"; }
    fi
    if [ "$pane" != "-" ]; then
      herdr pane run "$pane" "$launch"
    else
      mkdir -p "$state/logs"; ( cd "$wt" && nohup claude -p --permission-mode "$perms" "$(cat "$root/$brief")" > "$root/$state/logs/s$slice_n-$lane.log" 2>&1 & )
      pane="headless"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$lane" "$agent" "$branch" "$wt" "$pane" >> "$tmp"
    echo "launched $lane → $pane"
  done < "$state/slice-$slice_n.tsv"
  mv "$tmp" "$state/slice-$slice_n.tsv"
  echo; echo "next: bin/harness/swarm.sh wait $num" ;;
# ------------------------------------------------------------------ status
status)
  for f in "$state"/slice-*.tsv; do [ -f "$f" ] || continue; echo "== $(basename "$f" .tsv)"
    while IFS=$'\t' read -r lane agent branch wt pane; do
      st="n/a"; case "$pane" in headless) st=$( has_report "$state/logs/$(basename "$f" .tsv | sed 's/slice-/s/')-$lane.log" "$lane" && echo done || echo working );; -) st="not launched";; *) st=$(pane_status "$pane");; esac
      n=$(git -C "$wt" log --oneline "$(git merge-base "$branch" HEAD 2>/dev/null || echo HEAD)..$branch" 2>/dev/null | wc -l | tr -d ' ')
      printf '%-24s %-22s pane=%-10s status=%-8s commits=%s\n' "$lane" "$agent" "$pane" "$st" "$n"
    done < "$f"; done ;;
# ------------------------------------------------------------------ resume
# A lane session can die with its worktree intact (a dropped API connection, a killed pane). The work
# on disk is worth more than a clean restart, so resume runs a fresh session in the SAME worktree with
# the same brief — append a "RESUME" section to the brief first if the lane should know what it left.
resume)
  lane="${1:?lane name, e.g. react-frontend}"
  # Newest slice first, and only a lane whose worktree still exists: the same lane name appears in
  # every slice's file, and the older entries point at worktrees `clean` has already removed.
  row=""; slice_n=""
  for f in $(ls "$state"/slice-*.tsv 2>/dev/null | sort -t- -k2 -rn); do
    cand=$(grep -h "^$lane	" "$f" 2>/dev/null | tail -1) || true
    [ -z "$cand" ] && continue
    cand_wt=$(printf '%s' "$cand" | cut -f4)
    [ -d "$cand_wt" ] || continue
    row="$cand"; slice_n=$(basename "$f" | sed 's/slice-\([0-9]*\)\.tsv/\1/'); break
  done
  [ -z "$row" ] && { echo "no resumable lane '$lane' for spec $num (no launched lane with a worktree still on disk) — relaunch the slice instead" >&2; exit 1; }
  IFS=$'\t' read -r _ agent branch wt pane <<< "$row"
  brief="$state/s$slice_n-$lane.md"
  [ -f "$brief" ] || { echo "no brief at $brief" >&2; exit 1; }
  perms="${HARNESS_LANE_PERMS:-auto}"
  launch="cd '$wt' && claude --permission-mode $perms \"\$(cat '$root/$brief')\"; echo; echo 'LANE SESSION ENDED — this pane closes in 20s (Ctrl+C to keep it)'; sleep 20"
  # Always a FRESH pane: the recorded one usually still holds the finished session's REPL, and
  # `pane run` would type the shell command into that prompt instead of a shell. Close it first.
  case "$pane" in -|headless|"") ;; *) herdr pane close "$pane" >/dev/null 2>&1 || true; sleep 1;; esac
  pane=$(harness_open_pane "$num $lane" right)
  [ -n "$pane" ] || { echo "could not open a pane for $lane" >&2; exit 1; }
  herdr pane run "$pane" "$launch"
  # Write the new pane id back, or `wait` and `clean` keep watching the pane we just closed.
  awk -F'\t' -v lane="$lane" -v pane="$pane" 'BEGIN{OFS="\t"} $1==lane{$5=pane} {print}' \
    "$state/slice-$slice_n.tsv" > "$state/slice-$slice_n.tsv.new" \
    && mv "$state/slice-$slice_n.tsv.new" "$state/slice-$slice_n.tsv"
  echo "resumed $lane in $wt (pane $pane) — git status there is untouched, the session judges its own leftovers"
  echo "next: bin/harness/swarm.sh wait $num" ;;

# ------------------------------------------------------------------ wait
wait)
  timeout="45m"; [ "${1:-}" = "--timeout" ] && timeout="$2"
  # herdr wants milliseconds; accept 45m / 90s / 2h / plain ms
  case "$timeout" in *h) ms=$(( ${timeout%h} * 3600000 ));; *m) ms=$(( ${timeout%m} * 60000 ));; *s) ms=$(( ${timeout%s} * 1000 ));; *) ms=$timeout;; esac
  deadline=$(( $(date +%s) + ms / 1000 ))
  f=$(ls "$state"/slice-*.tsv | tail -1); mkdir -p "$state/logs"
  while IFS=$'\t' read -r lane agent branch wt pane; do
    log="$state/logs/$(basename "$f" .tsv | sed 's/slice-/s/')-$lane.log"
    case "$pane" in
      headless) echo "waiting (headless) $lane…"
         while ! has_report "$log" "$lane"; do [ "$(date +%s)" -ge "$deadline" ] && { echo "  $lane: timeout"; break; }; sleep 15; done ;;
      -) continue ;;
      *) echo "waiting $lane ($pane)…"
         while :; do
           left=$(( (deadline - $(date +%s)) * 1000 )); [ "$left" -le 0 ] && { echo "  $lane: timeout — check the pane"; break; }
           # idle = the session finished its turn (the report is its last message); blocked = a prompt needs a human
           herdr agent wait "$pane" --until done --until idle --until blocked --timeout "$left" >/dev/null 2>&1 || true
           herdr pane read "$pane" --source recent --lines 300 > "$log" 2>/dev/null || true
           has_report "$log" "$lane" && break
           st=$(pane_status "$pane")
           case "$st" in
             working) sleep 5 ;;                                   # transient idle between turns — keep waiting
             blocked) echo "  $lane: BLOCKED — the pane is waiting on a human"; break ;;
             *) echo "  $lane: $st without a LANE report — check the pane"; break ;;
           esac
         done ;;
    esac
  done < "$f"
  echo; echo "== lane reports"; for l in "$state"/logs/*.log; do echo "--- $(basename "$l")"; sed -E -n "/$(report_re '[[:alnum:]_-]+')/,\$p" "$l" | head -40; done ;;
# ------------------------------------------------------------------ merge
merge)
  f=$(ls "$state"/slice-*.tsv | tail -1)
  while IFS=$'\t' read -r lane agent branch wt pane; do
    [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ] && { echo "$lane: worktree dirty — agent did not finish cleanly; skipping"; continue; }
    echo "merging $branch"; git merge --no-ff -m "Merge branch '$branch'" "$branch" || { echo "CONFLICT in $lane — resolve towards the spec, then rerun merge"; exit 1; }
  done < "$f"; echo "merged. run the gates on this tree before ticking tasks." ;;
# ------------------------------------------------------------------ clean
clean)
  for f in "$state"/slice-*.tsv; do [ -f "$f" ] || continue; while IFS=$'\t' read -r lane agent branch wt pane; do
    case "$pane" in -|headless) ;; *) herdr pane close "$pane" >/dev/null 2>&1 && echo "closed pane $pane ($lane)" || true ;; esac
    [ -d "$wt" ] && git worktree remove --force "$wt" && echo "removed $wt"; done < "$f"; done; git worktree prune ;;
# ------------------------------------------------------------------ panes
panes)   # close every harness pane (label starts with the spec number) without touching worktrees
  herdr api snapshot 2>/dev/null | python3 -c 'import json,sys
def walk(o):
    if isinstance(o,dict):
        if "pane_id" in o and str(o.get("label",o.get("title",""))).startswith(sys.argv[1]+" "): print(o["pane_id"])
        for v in o.values(): walk(v)
    elif isinstance(o,list):
        for v in o: walk(v)
walk(json.load(sys.stdin))' "$num" | while read -r p; do herdr pane close "$p" && echo "closed $p"; done ;;
# ------------------------------------------------------------------ selftest
selftest)   # bin/harness/swarm.sh selftest <NNN> — the report matcher against a real brief (review F1, 2026-09-20)
  fail=0; t=$(mktemp)
  brief=$(ls "$state"/s*-*.md 2>/dev/null | grep -v prompt | head -1)
  if [ -n "$brief" ]; then
    lane=$(basename "$brief" .md | sed 's/^s[^-]*-//')
    has_report "$brief" "$lane" && { echo "FAIL: the brief's template line counts as a report ($brief)"; fail=1; } || echo "ok: brief template is not a report"
  else echo "skip: no brief under $state (run launch --dry-run first)"; fi
  printf '  ⏺ LANE python-backend: DONE\n  - task: done — note\n' > "$t"; has_report "$t" python-backend && echo "ok: rendered DONE report matches" || { echo "FAIL: rendered report not matched"; fail=1; }
  printf 'LANE python-backend: DONE|PARTIAL|BLOCKED\n' > "$t"; has_report "$t" python-backend && { echo "FAIL: template line matched"; fail=1; } || echo "ok: template line rejected"
  printf '⏺ LANE python-backend: BLOCKED\n' > "$t"; has_report "$t" react-native-mobile && { echo "FAIL: another lane's report matched"; fail=1; } || echo "ok: other lane's report rejected"
  rm -f "$t"; exit $fail ;;
*) echo "unknown: $cmd"; exit 2 ;;
esac
