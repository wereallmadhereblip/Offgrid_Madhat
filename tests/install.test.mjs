import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t, system) {
  const dir = mkdtempSync(join(tmpdir(), 'offgrid-install-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const mock = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  mock('uname', `echo ${system}`);
  mock('node', 'echo 22');
  mock('npm', 'if [ "$1" = --version ]; then echo 10.0.0; else echo "$*" >> "$TEST_LOG"; fi');
  const log = join(dir, 'events');
  const run = script => spawnSync('/bin/sh', [resolve(script)], {
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TEST_LOG: log },
    encoding: 'utf8',
  });
  return { run, events: () => existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

test('dashboard installer rejects non-Linux platforms before installing dependencies', t => {
  const f = fixture(t, 'Darwin');
  const result = f.run('install.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Debian-based Linux only/);
  assert.equal(f.events(), '');
});

test('dashboard installer retains the Debian Linux build flow', { skip: !existsSync('/etc/os-release') }, t => {
  const release = readFileSync('/etc/os-release', 'utf8');
  if (!/^(?:ID|ID_LIKE)=.*(?:debian|kali)/m.test(release)) {
    t.skip('requires a Debian-based host');
    return;
  }
  const f = fixture(t, 'Linux');
  const result = f.run('install.sh');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.events(), 'ci --no-audit --no-fund\nrun build\n');
  assert.match(result.stdout, /Installation complete/);
});
