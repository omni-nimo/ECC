#!/usr/bin/env node
/**
 * install-community-skills.js
 *
 * Installs five popular community skills into Claude Code (user level,
 * ~/.claude/skills) with safer defaults than a copy-pasted `npx skills add`:
 *
 *   - skills CLI and agent-browser are pinned to versions that were reviewed
 *   - skills.sh usage pings are turned off (DISABLE_TELEMETRY / DO_NOT_TRACK)
 *   - skills already installed (directly or through a plugin) are skipped,
 *     so nothing shows up twice
 *   - overlaps with ECC's own skills are printed so you can pick one
 *
 * Usage:
 *   node scripts/install-community-skills.js [--dry-run] [--only a,b]
 *        [--skip a,b] [--project] [--force] [--allow-telemetry] [--json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILLS_CLI = 'skills@1.7.2';
const AGENT_BROWSER = 'agent-browser@0.39.1';

const SKILLS = [
  {
    name: 'find-skills',
    repo: 'vercel-labs/skills',
    skillArgs: ['find-skills'],
    note: 'May install more skills on its own. Ask Claude to show you the skill before it installs anything.',
  },
  {
    name: 'grill-me',
    repo: 'mattpocock/skills',
    skillArgs: ['grill-me', 'grilling'],
    note: 'Use: /grill-me <your idea>',
  },
  {
    name: 'agent-browser',
    repo: 'vercel-labs/agent-browser',
    skillArgs: ['agent-browser'],
    globalPackage: AGENT_BROWSER,
    overlapsWith: ['browser-qa'],
    note: 'Installs a CLI and downloads Chrome. Uses many tokens; use it for testing, not every task.',
  },
  {
    name: 'frontend-design',
    repo: 'anthropics/skills',
    skillArgs: ['frontend-design'],
    overlapsWith: ['frontend-design-direction'],
    note: 'Triggers automatically on UI work.',
  },
  {
    name: 'handoff',
    repo: 'mattpocock/skills',
    skillArgs: ['handoff'],
    overlapsWith: ['save-session'],
    note: 'Use: /handoff <what is next>, then point a fresh chat at the file.',
  },
];

function showHelp(exitCode = 0) {
  console.log(`
Usage: node scripts/install-community-skills.js [options]

Installs: ${SKILLS.map(s => s.name).join(', ')}

Options:
  --dry-run           Print what would run, change nothing
  --only <a,b>        Install only these skills
  --skip <a,b>        Skip these skills
  --project           Install into the current project instead of ~/.claude
  --force             Reinstall even if a skill is already present
  --allow-telemetry   Let the skills CLI send usage pings to skills.sh
  --json              Print the plan as JSON
  -h, --help          Show this help
`);
  process.exit(exitCode);
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    only: [],
    skip: [],
    project: false,
    force: false,
    allowTelemetry: false,
    json: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') showHelp(0);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--project') parsed.project = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--allow-telemetry') parsed.allowTelemetry = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--only') parsed.only = splitList(args[++i]);
    else if (arg === '--skip') parsed.skip = splitList(args[++i]);
    else {
      console.error(`Unknown option: ${arg}`);
      showHelp(1);
    }
  }
  const known = new Set(SKILLS.map(s => s.name));
  for (const name of [...parsed.only, ...parsed.skip]) {
    if (!known.has(name)) {
      console.error(`Unknown skill: ${name}. Known: ${[...known].join(', ')}`);
      process.exit(1);
    }
  }
  return parsed;
}

/** Find a SKILL.md or command named `name` under ~/.claude (skills, commands, plugins). */
function findInstalled(name, claudeHome) {
  const direct = [
    path.join(claudeHome, 'skills', name, 'SKILL.md'),
    path.join(claudeHome, 'commands', `${name}.md`),
  ];
  for (const p of direct) {
    if (fs.existsSync(p)) return p;
  }
  return searchPlugins(path.join(claudeHome, 'plugins'), name, 0);
}

function searchPlugins(dir, name, depth) {
  if (depth > 7) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.name === name && fs.existsSync(path.join(full, 'SKILL.md'))) {
      return path.join(full, 'SKILL.md');
    }
    const found = searchPlugins(full, name, depth + 1);
    if (found) return found;
  }
  return null;
}

function buildPlan(options, claudeHome) {
  const selected = SKILLS.filter(
    s => (options.only.length === 0 || options.only.includes(s.name)) && !options.skip.includes(s.name)
  );
  return selected.map(skill => {
    const existing = options.project ? null : findInstalled(skill.name, claudeHome);
    const overlaps = (skill.overlapsWith || [])
      .map(other => ({ other, at: findInstalled(other, claudeHome) }))
      .filter(o => o.at);
    const commands = [];
    const addArgs = [SKILLS_CLI, 'add', skill.repo, '--agent', 'claude-code', '--yes'];
    for (const s of skill.skillArgs) addArgs.push('--skill', s);
    if (!options.project) addArgs.push('--global');
    commands.push(['npx', '--yes', ...addArgs]);
    if (skill.globalPackage) {
      commands.push(['npm', 'install', '--global', skill.globalPackage]);
      commands.push(['agent-browser', 'install']);
    }
    return {
      name: skill.name,
      repo: skill.repo,
      action: existing && !options.force ? 'skip' : 'install',
      existing,
      overlaps,
      note: skill.note,
      commands,
    };
  });
}

function run(cmd, env) {
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function main() {
  const options = parseArgs(process.argv);
  const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
  const plan = buildPlan(options, claudeHome);

  const env = { ...process.env };
  if (!options.allowTelemetry) {
    env.DISABLE_TELEMETRY = '1';
    env.DO_NOT_TRACK = '1';
  }

  if (options.json) {
    console.log(JSON.stringify({ telemetry: options.allowTelemetry, plan }, null, 2));
    if (options.dryRun) return;
  }

  console.log(`\nCommunity skills -> ${options.project ? 'this project' : claudeHome}`);
  console.log(`skills.sh usage pings: ${options.allowTelemetry ? 'ON' : 'OFF'}\n`);

  const failed = [];
  for (const item of plan) {
    if (item.action === 'skip') {
      console.log(`- ${item.name}: already present at ${item.existing}, skipping (use --force to reinstall)`);
      continue;
    }
    console.log(`+ ${item.name} (${item.repo})`);
    for (const o of item.overlaps) {
      console.log(`  ! overlaps with ECC "${o.other}" (${o.at}); keep one to avoid Claude picking the wrong one`);
    }
    for (const cmd of item.commands) {
      console.log(`  $ ${cmd.join(' ')}`);
      if (!options.dryRun && !run(cmd, env)) {
        failed.push(item.name);
        break;
      }
    }
    console.log(`  ${item.note}`);
  }

  if (options.dryRun) {
    console.log('\nDry run: nothing was installed.');
    return;
  }
  if (failed.length) {
    console.error(`\nFailed: ${failed.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nDone. Restart Claude Code so it picks up the new skills.');
}

if (require.main === module) {
  main();
}

module.exports = { SKILLS, buildPlan, findInstalled, parseArgs };
