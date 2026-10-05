# The harness

How this repo turns "an idea" into "merged, verified code" with AI agents doing the typing and humans doing the deciding.
`CLAUDE.md` is the short version agents read; this is the long version for people.

## The shape

```
  idea ─► 0 grill ─► 1 spec ─► 2 REVIEW ─► 3 tech+tasks ─► 4 swarm ─► 5 REVIEW ─► 6 verify ─► PR
          lead+you    lead      Codex↺lead    lead           N×sessions  Codex↺lead    lead
                                (other vendor)               in worktrees (other vendor)
```

Three ideas carry the whole thing:

1. **Interrogate before you specify.** `grilling` (Matt Pocock's skill, vendored into `.claude/skills/` so the rest of his plugin's stage-named skills can't be picked by mistake) forces every branch of the idea to be decided *before* a spec exists. The output is a list of decisions, not prose. Cheapest bugs to fix are the ones that never became a requirement.
2. **A vendor never reviews itself.** The lead model (Claude) writes the spec and directs the code; **Codex** reviews both (`bin/harness/second-opinion.sh`). The same model has the same blind spots at write time and review time — a different model has different ones. The reviewer runs in its own herdr pane (`NNN review-spec codex`) next to the lanes, so the second opinion is as visible as the first. Every finding gets a written verdict (`accepted / rejected: why / deferred: ticket`) in `reviews/TRIAGE.md`. Silence is not a verdict. Everyday setting is Codex on `low` effort — cheap, fast, catches the obvious.
3. **A fleet, not a tree.** Claude subagents cannot spawn subagents and are invisible from outside their session — so the swarm does not use them. `bin/harness/lanes.py` turns `tasks.md` into lanes; `bin/harness/swarm.sh` gives every lane its own git worktree, its own **herdr pane**, and a **full `claude` session** with a written brief. The lead is just another session in another pane: it launches siblings, `herdr agent wait`s for them, reads their panes, merges towards the spec, runs the gates, keeps the ledger. `/harness:lead` runs that loop over the whole backlog and stops only for a human step or a red gate. Slices stay sequential (AWOS puts the riskiest unknown first for a reason); lanes inside a slice are parallel and own disjoint directories. The same rule covers **consultations**: where an AWOS command would spawn a specialist subagent (`/awos:tech`, `/awos:tasks`, `/awos:implement`, brownfield explorations), `bin/harness/consult.sh <agent> <slug>` runs that specialist as an interactive `claude --agent` session in its own pane (auto permission mode, like a lane) and the session writes its answer to `consults/` — so you can watch it, type into it, kill it, and the lead quotes it instead of paraphrasing it.

Under it all is **AWOS** (`.awos/`, `/awos:*`): product-definition → roadmap → spec → tech → tasks → implement → verify. The harness adds stages 0, 2, 4(parallel), 5 on top and changes nothing underneath.

## Safety rails

| Rail | Where | What it stops |
|---|---|---|
| `guard.sh` (PreToolUse hook) | `.claude/hooks/` | `rm -rf` on roots, force-push, `reset --hard`, commits on `main`, reading `.env`/tfstate, `terraform apply` |
| `format.sh` (PostToolUse hook) | `.claude/hooks/` | gates failing on formatting — every written file is formatted on the spot |
| `permissions.deny` | `.claude/settings.json` | belt-and-braces for the same things |
| worktree + session isolation | `swarm.sh` | lanes never share a working tree or a context window; a bad lane is a `git worktree remove` and a closed pane |
| same hooks everywhere | `.claude/` is in every worktree | a lane session gets `guard.sh` and the allow/deny list exactly like the lead; lanes start in `auto` permission mode (`HARNESS_LANE_PERMS`), so routine prompts are answered by the classifier and the guard still blocks the dangerous ones |
| domain ownership | `harness.json → lanes.<agent>.owns` | an agent that needs a file outside its directories must stop and report |
| human steps | `[User]` / `Verify — device` | never assigned to an agent — the lead asks |
| ledger | `tasks.md` `_(Done …)_` notes | the next agent inherits the surprises, not just the ticks |

## Tickets: intent vs contract

The tracker (`harness.json → tracker`, e.g. Linear team `TKT`) is where work *enters*; `context/spec/` is where it is *defined*. The user files short tickets on purpose — a bug spotted during a device verify, an idea mid-feature — and the harness keeps them short: it never rewrites a description, only comments and moves the state.

| Moment | Command | What happens in Linear |
|---|---|---|
| "запиши баг / идею" | `/harness:ticket bug\|idea <line>` | issue created in the user's words + a `Context:` block (spec, slice, branch, repro) the user would otherwise lose |
| a bug is next | `/harness:fix TKT-n` | *In Progress* → failing test → fix in one lane pane → Codex review → PR → *In Review*; spec amended + `## Changelog` line if the spec was wrong or silent |
| a feature is next | `/harness:feature TKT-n` | grill decisions commented → *In Progress*; spec path commented; slice titles commented; PR URL commented → *In Review*; merge auto-closes |
| autonomous | `/harness:lead` | planned work first, then the backlog by priority; bugs it takes, features it **stops** on — a spec needs the user in the grill |

Why not put the detail in the ticket? Because the detail changes during the grill and the review, and a ticket that contradicts the spec is worse than a ticket that says nothing. One source of truth for "what"; the ticket links to it.

## Files

```
CLAUDE.md                          ← agents read this first
HARNESS.md                         ← you are here
.claude/settings.json              ← awos plugin, permissions, hooks
.claude/skills/grilling/           ← vendored grill skill (MIT, Matt Pocock)
.claude/hooks/guard.sh, format.sh
.claude/commands/harness/          ← /harness:grill  feature  lead  review-spec  swarm  review-code  ticket  fix
.claude/commands/awos/             ← the AWOS stages, written by `npx @provectusinc/awos` (install.sh runs it)
.claude/agents/                    ← your domain agents (/awos:hire) + reviewer (fallback), developer (generic)
harness.json                       ← ticket prefix, tracker, lanes → owned dirs + gate, reviewer defaults
bin/harness/second-opinion.sh      ← cross-vendor review; HARNESS_REVIEWER=codex|claude|<cmd>
bin/harness/consult.sh             ← specialist consultation as an interactive session in a pane, auto mode (replaces every Agent(...) call in AWOS commands)
bin/harness/_pane.sh               ← shared: opens every lane/review/consult pane NEXT TO THE LEAD'S PANE ($HERDR_PANE_ID), never focus-stealing, wherever the human is looking
bin/harness/lanes.py               ← tasks.md → parallel lanes (deterministic, dumb on purpose)
bin/harness/swarm.sh               ← launch | status | wait | merge | clean — worktrees + herdr panes + real sessions
context/spec/NNN-*/lanes/          ← per-run briefs, pane ids, logs (gitignored)
context/inbox/<slug>.md            ← grill output, input to /awos:spec
context/spec/NNN-*/reviews/        ← raw reviews + TRIAGE.md
context/spec/NNN-*/consults/       ← specialist answers + the prompts they got (committed; the lead quotes them)
```

## Setup on a fresh machine

```sh
npm i -g @anthropic-ai/claude-code @openai/codex   # the lead + the reviewer
brew install herdr just uv                         # the fleet terminal + gates
herdr integration install claude && herdr integration install codex   # panes report working/blocked/done
claude                                             # the awos plugin (code-quality audit) installs from settings.json on first start
/mcp                                               # then authenticate the tracker MCP (e.g. Linear, OAuth)
codex --version && codex login                     # otherwise reviews fall back to Claude and say so
```
Without herdr everything still runs: `HARNESS_NO_HERDR=1` makes lanes headless (`claude -p` + logs).

## 10-minute demo script

1. **Open `CLAUDE.md`.** "Every agent starts here. The pipeline is a table; each row is a gate."
2. **Grill.** `/harness:grill "<a small feature>"` — answer 5–6 questions; show `context/inbox/<slug>.md`. Point at *Open risks*: "these become slice 1."
3. **Spec.** `/awos:spec context/inbox/pin-place.md` — skim the functional spec; note there is no implementation language in it (the template forbids it).
4. **Second opinion.** `/harness:review-spec NNN` — a Codex pane opens beside the lead; show Codex's `F1…Fn`, then `reviews/TRIAGE.md`: "every finding has a verdict a stranger can check. This one I rejected, here's why; this blocker I accepted."
5. **Lanes.** `bin/harness/lanes.py NNN --md` — "sequential slices, parallel lanes, human steps separated. Deterministic; I can predict what it does."
6. **The fleet.** In herdr, in the lead pane: `/harness:lead NNN`. Watch it split panes — `NNN <agent-a>`, `NNN <agent-b>` — each a real `claude` session in its own worktree, sidebar turning *working → done*. Click into one and show the brief it received (spec + its lane's tasks + rules + the exact report shape). Back in the lead pane: `wait` returns, lane reports parsed, merge, gates, ledger notes in `tasks.md`. Then it stops on the HUMAN step and says what it needs from you. "Sessions, not subagents: I can see every one, type into any of them, and kill one without touching the rest."

7. **Second opinion on code.** `/harness:review-code NNN` — same triage discipline on the diff.
8. **Capture, mid-demo.** Pretend you spotted a bug on the phone: `/harness:ticket bug "route view crashes when the account is deleted elsewhere"`. Show the Linear issue: your two lines, plus the `Context:` block it filled in. "Short tickets, because the spec is the contract — the harness just makes sure the ticket knows where the contract is."
9. **The rails.** Ask an agent to `git push --force` — `guard.sh` blocks it with a reason. "The harness assumes the agent will eventually try."
10. **Close.** "Everyday, it's grill + Codex-on-low. The fleet is for features with three domains, and `/harness:lead` is for a backlog I trust the specs of. None of this replaces reading the diff — it means I read a diff that already survived a second model and a green gate."

## Panes: who opens, who closes

| Pane | Opened by | Closed by |
|---|---|---|
| `NNN <lane>` | `swarm.sh launch` | `swarm.sh clean NNN` (after merge) — or `swarm.sh panes NNN` to close only panes |
| `NNN review-* codex` | `second-opinion.sh` | itself, 3 s after the review file lands (`HARNESS_KEEP_REVIEW_PANE=1` to keep) |
| `NNN consult <agent> <slug>` | `consult.sh` | itself, 3 s after the answer lands (`HARNESS_KEEP_PANE=1` to keep) |
| any | — | click into it, `Ctrl+B` then `x`; or `herdr pane close <id>` (ids: `herdr pane list`) |

A lane session's `claude` stays interactive after its final report so you can read it or type into it; the pane says so and closes itself 20 s after `claude` exits (`/exit` in the session, or Ctrl+C to keep the shell).

## Deliberately not here (yet)

- **Sandcastle / Docker sandboxes** — worktrees + hooks are enough for a dev box; Sandcastle is the next step when lanes run headless in CI (`@ai-hero/sandcastle`, `merge-to-head` mode maps 1:1 onto a lane).
- **OpenSpec** — same category as AWOS; the harness assumes AWOS's `context/` layout and `/awos:*` stages.
