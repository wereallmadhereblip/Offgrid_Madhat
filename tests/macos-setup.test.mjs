import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('macos-setup.sh');

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'offgrid-macos-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const mock = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  mock('uname', `if [ "$1" = -s ]; then echo "${options.os || 'Darwin'}"; else echo arm64; fi`);
  mock('sw_vers', `echo "${options.macVersion || '13.0'}"`);
  mock('git', `if [ "$1" = --version ]; then echo 'git version 2.40'; else
    echo clone >> "$TEST_LOG"
    mkdir -p "$3"
    printf '%s\\n' '#!/bin/sh' 'echo build >> "$TEST_LOG"' > "$3/install.sh"
  fi`);
  mock('node', `if [ "$1" = -p ]; then echo "${options.nodeMajor || '22'}"; else echo v22.1.0; fi`);
  mock('npm', `echo "${options.npmVersion || '10.0.0'}"`);
  mock('curl', `echo curl >> "$TEST_LOG"
    while [ "$#" -gt 0 ]; do
      if [ "$1" = -o ]; then shift; output=$1; fi
      shift
    done
    case "$output" in
      *SHASUMS256.txt) echo 'abcd  node-v22.1.0.pkg' > "$output" ;;
      *) echo package > "$output" ;;
    esac`);
  mock('shasum', `echo checksum >> "$TEST_LOG"; exit ${options.checksumFails ? 1 : 0}`);
  mock('sudo', 'echo sudo >> "$TEST_LOG"; exit 1');
  const log = join(dir, 'log');
  const run = (...args) => spawnSync('/bin/sh', [script, ...args], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TEST_LOG: log, TMPDIR: dir },
    encoding: 'utf8',
  });
  const events = () => {
    try { return readFileSync(log, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  };
  return { dir, run, events };
}

test('clones and builds with existing compatible tools', t => {
  const f = fixture(t);
  const result = f.run('dashboard');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /git version 2\.40/);
  assert.match(result.stdout, /Node\.js: v22\.1\.0/);
  assert.match(result.stdout, /npm: 10\.0\.0/);
  assert.equal(f.events(), 'clone\nbuild\n');
});

test('rejects unsupported macOS and existing destinations before changes', t => {
  const old = fixture(t, { macVersion: '12.7' });
  assert.notEqual(old.run().status, 0);
  assert.equal(old.events(), '');
  const existing = fixture(t);
  mkdirSync(join(existing.dir, 'dashboard'));
  const result = existing.run('dashboard');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Destination already exists/);
  assert.equal(existing.events(), '');
});

test('does not install an unverified Node.js package', t => {
  const f = fixture(t, { nodeMajor: '18', checksumFails: true });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum did not match/);
  assert.equal(f.events(), 'curl\ncurl\nchecksum\n');
});

test('reports installer failure without cloning', t => {
  const f = fixture(t, { npmVersion: '6.0.0' });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Node\.js installation failed/);
  assert.equal(f.events(), 'curl\ncurl\nchecksum\nsudo\n');
});
