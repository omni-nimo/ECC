# Community Skills Add-on

Five popular third-party skills for Claude Code, installed with one command.

```bash
npm run skills:community            # install all five into ~/.claude/skills
npm run skills:community -- --dry-run   # show the plan first
```

Restart Claude Code afterwards.

| Skill | Source | How to use |
| --- | --- | --- |
| find-skills | vercel-labs/skills | Ask "is there a skill for X?" |
| grill-me | mattpocock/skills | `/grill-me <idea>` before writing code |
| agent-browser | vercel-labs/agent-browser | Ask Claude to open the app in a browser and test it |
| frontend-design | anthropics/skills | Automatic on UI work |
| handoff | mattpocock/skills | `/handoff <what is next>`, then start a fresh chat |

## What the script does differently from plain `npx skills add`

- Pins `skills@1.7.2` and `agent-browser@0.39.1`, the versions that were reviewed.
- Sets `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`, so the skills CLI does not
  send install and search pings to skills.sh. Pass `--allow-telemetry` to keep them.
- Installs for Claude Code only (`--agent claude-code`).
- Skips a skill that is already in `~/.claude/skills`, `~/.claude/commands` or
  any plugin, so it never appears twice (for example with Matt Pocock's plugin).
- Warns when a skill overlaps with an ECC one: `frontend-design` with
  `frontend-design-direction`, `agent-browser` with `browser-qa`, and `handoff`
  with `/save-session`. Keep one of each pair.

## Review notes (October 2026)

- No malware or hidden code found. The five skills are plain Markdown
  instructions; only agent-browser installs a program.
- The skills CLI sends anonymous usage pings to skills.sh (skill names, agent
  name, CLI version, and the text of `find` searches). No account or file data.
  The script turns this off.
- agent-browser's installer downloads its own binary from its GitHub releases
  and Chrome from Google. It only talks to cloud browser services if you
  configure one.
- find-skills tells Claude to install new skills with `-y` (no confirmation).
  A skill is a set of instructions Claude follows, so ask Claude to show you
  any new skill before it installs one.
- agent-browser can drive sites where you are signed in. Watch what it does on
  real accounts.

Options: `--only a,b`, `--skip a,b`, `--project`, `--force`, `--json`.
