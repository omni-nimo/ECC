/**
 * Tests for scripts/install-community-skills.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-community-skills.js');
const { SKILLS, buildPlan, findInstalled } = require('../../scripts/install-community-skills');

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-community-skills-'));
}

function writeSkill(dir, name) {
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
}

function opts(extra = {}) {
  return { only: [], skip: [], project: false, force: false, ...extra };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('install-community-skills');

test('plans all five skills, pinned, global, claude-code only', () => {
  const home = makeHome();
  const plan = buildPlan(opts(), home);
  assert.deepStrictEqual(plan.map(p => p.name), SKILLS.map(s => s.name));
  for (const item of plan) {
    assert.strictEqual(item.action, 'install');
    const add = item.commands[0];
    assert.ok(add.includes('skills@1.7.2'));
    assert.ok(add.includes('--global'));
    assert.deepStrictEqual(add.slice(add.indexOf('--agent'), add.indexOf('--agent') + 2), ['--agent', 'claude-code']);
  }
  const browser = plan.find(p => p.name === 'agent-browser');
  assert.ok(browser.commands.some(c => c.join(' ') === 'npm install --global agent-browser@0.39.1'));
  fs.rmSync(home, { recursive: true, force: true });
});

test('grill-me installs its grilling dependency', () => {
  const plan = buildPlan(opts({ only: ['grill-me'] }), makeHome());
  const add = plan[0].commands[0].join(' ');
  assert.ok(add.includes('--skill grill-me') && add.includes('--skill grilling'));
});

test('skips a skill already provided by a plugin', () => {
  const home = makeHome();
  writeSkill(path.join(home, 'plugins', 'cache', 'mattpocock', 'skills'), 'handoff');
  const item = buildPlan(opts({ only: ['handoff'] }), home)[0];
  assert.strictEqual(item.action, 'skip');
  assert.ok(findInstalled('handoff', home));
  assert.strictEqual(buildPlan(opts({ only: ['handoff'], force: true }), home)[0].action, 'install');
  fs.rmSync(home, { recursive: true, force: true });
});

test('reports overlap with ECC skills', () => {
  const home = makeHome();
  writeSkill(path.join(home, 'skills'), 'frontend-design-direction');
  const item = buildPlan(opts({ only: ['frontend-design'] }), home)[0];
  assert.strictEqual(item.overlaps.length, 1);
  assert.strictEqual(item.overlaps[0].other, 'frontend-design-direction');
  fs.rmSync(home, { recursive: true, force: true });
});

test('dry run changes nothing and turns telemetry off by default', () => {
  const home = makeHome();
  const out = execFileSync('node', [SCRIPT, '--dry-run', '--skip', 'agent-browser'], {
    env: { ...process.env, CLAUDE_HOME: home },
    encoding: 'utf8',
  });
  assert.ok(out.includes('usage pings: OFF'));
  assert.ok(out.includes('Dry run: nothing was installed.'));
  assert.ok(!out.includes('+ agent-browser'));
  assert.deepStrictEqual(fs.readdirSync(home), []);
  fs.rmSync(home, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
