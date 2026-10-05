#!/usr/bin/env python3
"""Turn a spec's tasks.md into parallel lanes.

    bin/harness/lanes.py 027            # JSON plan for the first slice with open work
    bin/harness/lanes.py 027 --all      # every slice
    bin/harness/lanes.py 027 --md       # human table
    bin/harness/lanes.py 027 --slice F1 # just that slice, if it has open work (for /harness:fix)

Rules (kept deliberately dumb so a human can predict them):
- Slices (`- [ ] **Slice N: …**`, `Slice N — …`, or `Slice FN: …` for a /harness:fix lane) run sequentially:
  risky unknowns first is the whole point of AWOS slicing. A fix slice (`FN`) is the exception: it is
  appended after slices whose device checks may stay open for weeks, so `--slice FN` picks it directly.
- Inside a slice, sub-tasks are grouped into lanes by an explicit `**[Lane: name]**` tag, else by the
  `**[Agent: name]**` tag. `harness.json` → `lanes.<agent>.owns` says which directories an agent owns (and
  `.gate` which command must be green); different agents own different directories, so lanes don't collide.
- `**[User]**` sub-tasks and "Verify — device" sub-tasks are never assigned to a lane; they are listed
  under `human` so the lead asks instead of pretending.
- `**[Lead]**` sub-tasks (merge, review, PR) and sub-tasks with no agent tag are the orchestrator's own, done serially
  after the lanes; they are listed under `lead` and never spawned as a session.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

def load_config(root: Path) -> dict:
    """harness.json at the project root: lanes → owned dirs + gate, ticket prefix, tracker, review defaults."""
    p = root / "harness.json"
    return json.loads(p.read_text()) if p.exists() else {}

SLICE = re.compile(r"^- \[( |x)\] \*\*Slice (F?\d+)\s*[:—–-]\s*(.+?)\*\*")   # "Slice 3:", "Slice 3 —", "Slice F87:" (fix lane)
SUB = re.compile(r"^  - \[( |x)\] (.+)$")
LANE = re.compile(r"\*\*\[Lane:\s*([\w-]+)\]\*\*")
AGENT = re.compile(r"\*\*\[Agent:\s*([\w-]+)\]\*\*")
USER = re.compile(r"\*\*\[User\]\*\*|Verify — device", re.I)
LEAD = re.compile(r"\*\*\[Lead\]\*\*")

def parse(text: str):
    slices, cur = [], None
    for line in text.splitlines():
        m = SLICE.match(line)
        if m:
            cur = {"n": m.group(2), "title": m.group(3).strip(), "done": m.group(1) == "x", "subs": []}
            slices.append(cur); continue
        m = SUB.match(line)
        if m and cur is not None:
            body = m.group(2)
            title = re.sub(r"\s*_\(.*\)_\s*$", "", body).strip()      # strip the "(Done …)" ledger note
            cur["subs"].append({"done": m.group(1) == "x", "text": title,
                                "lane": (LANE.search(body) or [None, None])[1],
                                "agent": (AGENT.search(body) or [None, None])[1],
                                "human": bool(USER.search(body)),
                                "lead": bool(LEAD.search(body)) or not (LANE.search(body) or AGENT.search(body))})
    return slices

def plan(slices, all_slices=False, lanes_cfg=None):
    lanes_cfg = lanes_cfg or {}
    out = []
    for s in slices:
        open_subs = [x for x in s["subs"] if not x["done"]]
        if not open_subs: continue
        lanes: dict[str, dict] = {}; human = []; lead = []
        for i, x in enumerate(open_subs, 1):
            if x["human"]: human.append(x["text"]); continue
            if x["lead"]: lead.append(x["text"]); continue
            key = x["lane"] or x["agent"]
            spec = lanes_cfg.get(x["agent"] or "", {})
            lane = lanes.setdefault(key, {"lane": key, "agent": x["agent"] or "lead",
                                          "owns": spec.get("owns", ["(any — no lane config for this agent; add it to harness.json)"]),
                                          "gate": spec.get("gate", ""), "tasks": []})
            lane["tasks"].append(x["text"])
        out.append({"slice": s["n"], "title": s["title"], "lanes": list(lanes.values()), "human": human, "lead": lead})
        if not all_slices: break
    return out

def main():
    args = sys.argv[1:]
    if not args: print(__doc__); sys.exit(2)
    num = args[0]; all_slices = "--all" in args; md = "--md" in args
    only = args[args.index("--slice") + 1] if "--slice" in args else None
    root = Path(__file__).resolve().parents[2]
    dirs = sorted((root / "context/spec").glob(f"{num}-*"))
    if not dirs: sys.exit(f"no spec dir for {num}")
    tasks = dirs[0] / "tasks.md"
    slices = parse(tasks.read_text())
    if only is not None: slices = [s for s in slices if s["n"] == only]
    p = plan(slices, all_slices, load_config(root).get("lanes", {}))
    if not md: print(json.dumps({"spec": dirs[0].name, "slices": p}, indent=2, ensure_ascii=False)); return
    print(f"# Lane plan — {dirs[0].name}\n")
    if not p: print("Nothing open. All slices done."); return
    for s in p:
        print(f"## Slice {s['slice']}: {s['title']}\n")
        for l in s["lanes"]:
            gate = f", gate `{l['gate']}`" if l.get("gate") else ""
            print(f"- **{l['lane']}** (agent `{l['agent']}`, owns `{'`, `'.join(l['owns'])}`{gate}) — {len(l['tasks'])} task(s)")
            for t in l["tasks"]: print(f"    - {t[:140]}")
        if s["lead"]:
            print(f"- **lead** — {len(s['lead'])} step(s) the orchestrator does itself after the lanes:")
            for t in s["lead"]: print(f"    - {t[:140]}")
        if s["human"]:
            print(f"- **human** — {len(s['human'])} step(s) the lead must ask for:")
            for t in s["human"]: print(f"    - {t[:140]}")
        print()

if __name__ == "__main__": main()
