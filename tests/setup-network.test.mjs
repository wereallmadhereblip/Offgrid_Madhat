import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

function runSetup(t, script, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'offgrid-network-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'events');
  writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_LOG"\nif [ "$1" = tee ]; then cat > "$TEST_UNIT"; fi\n', { mode: 0o755 });
  writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\n[ "$1" = is-active ] && exit ${options.active ? 0 : 1}\nexit 0\n`, { mode: 0o755 });
  const env = {
    ...process.env, PATH: `${bin}:/usr/bin:/bin`, OFFGRID_HOME: join(dir, 'app'),
    TEST_LOG: log, TEST_UNIT: join(dir, 'unit'), OFFGRID_APPS: '', OFFGRID_ADMIN_PASSWORD: '',
  };
  delete env.OFFGRID_BIND;
  if (options.bind) env.OFFGRID_BIND = options.bind;
  const result = spawnSync('/bin/bash', ['-c', `file=$1; shift; source "$file"; ${script}`, 'test', resolve('setup.sh')], { env, encoding: 'utf8' });
  return { result, dir, log };
}

test('dashboard defaults to network access while other services stay local', t => {
  const { result } = runSetup(t, 'DRY_RUN=true; install_dashboard; install_service openwebui OpenWebUI test "HOST=$BIND"; cat "$STATE_DIR/summary"');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Environment="OFFGRID_HOST=0\.0\.0\.0"/);
  assert.match(result.stdout, /Environment="HOST=127\.0\.0\.1"/);
  assert.match(result.stdout, /http:\/\/<this-computer-IP>:4173/);
  assert.match(result.stdout, /trusted network/);
});

test('OFFGRID_BIND overrides dashboard and app listeners', t => {
  const { result } = runSetup(t, 'DRY_RUN=true; install_dashboard; install_service openwebui OpenWebUI test "HOST=$BIND"; cat "$STATE_DIR/summary"', { bind: '127.0.0.1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Environment="OFFGRID_HOST=127\.0\.0\.1"/);
  assert.match(result.stdout, /Environment="HOST=127\.0\.0\.1"/);
  assert.doesNotMatch(result.stdout, /Network access:/);
});

test('reinstalling an active dashboard restarts it to apply the new listener', t => {
  const { result, dir, log } = runSetup(t, 'SUDO=sudo; has_systemd() { return 0; }; install_service dashboard Dashboard /bin/true "OFFGRID_HOST=$DASHBOARD_BIND"', { active: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, 'unit'), 'utf8'), /Environment="OFFGRID_HOST=0\.0\.0\.0"/);
  assert.match(readFileSync(log, 'utf8'), /systemctl restart offgrid-dashboard\.service/);
});

test('manual startup instructions retain the network bind when systemd is unavailable', t => {
  const { result } = runSetup(t, 'has_systemd() { return 1; }; install_service dashboard Dashboard /bin/true "OFFGRID_HOST=$DASHBOARD_BIND" "OFFGRID_PORT=4173"; cat "$STATE_DIR/manual"');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /env OFFGRID_HOST=0\.0\.0\.0 OFFGRID_PORT=4173 \/bin\/true/);
});

test('failure summary prints a valid comma-separated retry command', t => {
  const { result } = runSetup(t, 'FAILED=(dashboard openwebui kolibri jellyfin cyberchef); print_summary');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /bash setup\.sh --apps dashboard,openwebui,kolibri,jellyfin,cyberchef/);
});

test('network-bound dashboard responds on a non-loopback address', { timeout: 10000 }, async t => {
  const address = Object.values(networkInterfaces()).flat().find(item => item && item.family === 'IPv4' && !item.internal)?.address;
  if (!address) {
    t.skip('no non-loopback IPv4 address is available');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'offgrid-server-test-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolveClose, reject) => probe.close(error => error ? reject(error) : resolveClose()));
  const child = spawn(process.execPath, [resolve('server.mjs')], {
    env: { ...process.env, OFFGRID_HOST: '0.0.0.0', OFFGRID_PORT: String(port), OFFGRID_DATA_DIR: dir, OFFGRID_ADMIN_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const ready = new Promise((resolveReady, reject) => {
    child.stdout.on('data', data => {
      if (data.toString().includes('Offgrid Madhat running')) resolveReady();
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Dashboard exited before responding (${code})`)));
  });
  await ready;
  const response = await fetch(`http://${address}:${port}/api/services`);
  assert.equal(response.status, 200);
});
