import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'offgrid mac test '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, 'project');
  const bin = join(dir, 'bin');
  const home = join(dir, 'home');
  mkdirSync(project);
  mkdirSync(bin);
  mkdirSync(home);
  for (const name of ['setup.sh', 'macos-apps.sh']) copyFileSync(resolve(name), join(project, name));
  writeFileSync(join(project, 'install.sh'), '#!/bin/sh\necho dashboard >> "$TEST_LOG"\n', { mode: 0o755 });
  const mock = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  mock('uname', 'echo Darwin');
  mock('sw_vers', 'echo 13.0');
  mock('node', 'if [ "$1" = -p ]; then echo 22; else echo v22.0.0; fi');
  mock('brew', `echo "brew $*" >> "$TEST_LOG"
    if [ "$1" = --prefix ]; then echo "$TEST_PREFIX"; fi
    ${options.brewFailure ? 'if [ "$1 $2 $3" = "install --cask kiwix" ]; then exit 1; fi' : ''}
    exit 0`);
  mock('launchctl', `echo "launchctl $*" >> "$TEST_LOG"
    ${options.launchFailure ? 'if [ "$1" = bootstrap ]; then exit 1; fi' : ''}
    [ "$1" != print ]`);
  const log = join(dir, 'events');
  const run = (...args) => spawnSync('/bin/bash', [join(project, 'macos-apps.sh'), ...args], {
    cwd: project,
    env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin`, TEST_LOG: log, TEST_PREFIX: dir,
      OFFGRID_HOME: join(dir, 'app data'), OFFGRID_APPS: '', OFFGRID_ADMIN_PASSWORD: '', OLLAMA_MODEL: '', KIWIX_ZIM_URL: '' },
    encoding: 'utf8',
  });
  const events = () => existsSync(log) ? readFileSync(log, 'utf8') : '';
  return { dir, home, run, events };
}

test('default dry run plans every Linux app without installing anything', t => {
  const f = fixture(t);
  const result = f.run('--dry-run');
  assert.equal(result.status, 0, result.stderr);
  for (const app of ['dashboard', 'ollama', 'openwebui', 'kolibri', 'kiwix', 'jellyfin', 'cyberchef', 'meshtastic']) {
    assert.match(result.stdout, new RegExp(app, 'i'));
  }
  assert.match(result.stdout, /\[dry-run\] brew install --cask kiwix/);
  assert.match(result.stdout, /\[dry-run\] brew install --cask jellyfin/);
  assert.match(result.stdout, /\[dry-run\] launchd org\.offgrid-madhat\.openwebui:/);
  assert.match(result.stdout, /\[dry-run\] launchd org\.offgrid-madhat\.kolibri:/);
  assert.match(result.stdout, /does not provide the dashboard's Kiwix web service/);
  assert.equal(f.events(), '');
  assert.equal(existsSync(join(f.home, 'Library')), false);
});

test('selected apps install and launch without touching unselected apps', t => {
  const f = fixture(t);
  const result = f.run('--apps', 'dashboard,ollama,jellyfin', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.events(), /dashboard\n/);
  assert.match(f.events(), /brew install ollama/);
  assert.match(f.events(), /brew install --cask jellyfin/);
  assert.doesNotMatch(f.events(), /kiwix|python@3\.12/);
  const plist = join(f.home, 'Library', 'LaunchAgents', 'org.offgrid-madhat.dashboard.plist');
  const parsed = spawnSync('/usr/bin/python3', ['-c',
    'import json, plistlib, sys; print(json.dumps(plistlib.load(open(sys.argv[1], "rb"))))', plist], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const agent = JSON.parse(parsed.stdout);
  assert.ok(agent.ProgramArguments.includes('OFFGRID_HOST=127.0.0.1'));
  assert.ok(agent.ProgramArguments.includes(join(f.dir, 'project', 'server.mjs')));
  assert.equal(agent.WorkingDirectory, join(f.dir, 'project'));
  assert.match(f.events(), /launchctl bootstrap gui\//);
});

test('failed app is reported and later selected apps still run', t => {
  const f = fixture(t, { brewFailure: true });
  const result = f.run('--apps', 'kiwix,jellyfin', '--yes');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Failed apps: kiwix/);
  assert.match(result.stdout, /--apps kiwix/);
  assert.match(f.events(), /brew install --cask jellyfin/);
});

test('invalid app is rejected without installing', t => {
  const f = fixture(t);
  const result = f.run('--apps', 'dashboard,unknown', '--yes');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown app 'unknown'/);
  assert.equal(f.events(), '');
});

test('launchd errors are reported as app failures and do not stop later apps', t => {
  const f = fixture(t, { launchFailure: true });
  const result = f.run('--apps', 'dashboard,kiwix', '--yes');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Failed apps: dashboard/);
  assert.match(f.events(), /brew install --cask kiwix/);
});
