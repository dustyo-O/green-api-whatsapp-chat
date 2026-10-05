#!/usr/bin/env bash
# Shared pane helper for the harness scripts (sourced, not executed).
#
#   harness_open_pane <label> [direction]   → prints the new pane id; empty on failure
#
# Opens the pane NEXT TO THE LEAD'S OWN PANE ($HERDR_PANE_ID, exported by herdr into every pane's shell) and never
# steals focus — so lanes, reviewers and consults land in the lead's workspace even while the human is looking at
# another project. Without $HERDR_PANE_ID it falls back to herdr's notion of the current pane. The new id is read
# from the JSON that `herdr pane split` prints; the snapshot-diff is a last resort for older herdr builds.
harness_have_herdr() { [ -z "${HARNESS_NO_HERDR:-}" ] && command -v herdr >/dev/null 2>&1; }
harness_pane_ids() { herdr api snapshot 2>/dev/null | python3 -c 'import json,sys
def walk(o):
    if isinstance(o,dict):
        if "pane_id" in o: yield o["pane_id"]
        for v in o.values(): yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
print("\n".join(sorted(set(walk(json.load(sys.stdin))))))'; }
harness_open_pane() {
  local label="$1" direction="${2:-down}" anchor=() out pane before after
  if [ -n "${HERDR_PANE_ID:-}" ]; then anchor=(--pane "$HERDR_PANE_ID"); else anchor=(--current); fi
  before=$(harness_pane_ids)
  out=$(herdr pane split "${anchor[@]}" --direction "$direction" --no-focus 2>/dev/null) \
    || out=$(herdr pane split "${anchor[@]}" --direction "$([ "$direction" = down ] && echo right || echo down)" --no-focus 2>/dev/null) || out=""
  pane=$(printf '%s' "$out" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["result"]["pane"]["pane_id"])
except Exception: print("")' 2>/dev/null)
  if [ -z "$pane" ]; then sleep 0.5; after=$(harness_pane_ids); pane=$(comm -13 <(echo "$before") <(echo "$after") | head -1); fi
  [ -n "$pane" ] && herdr pane rename "$pane" "$label" >/dev/null 2>&1 || true
  printf '%s' "$pane"
}
