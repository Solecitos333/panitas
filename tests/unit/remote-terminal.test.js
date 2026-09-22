import test from 'node:test';
import assert from 'node:assert/strict';
import { commandPhase, createRemoteUpdateAgent, remotePresence } from '../../src/lib/remote-terminal.js';
import { renderRemoteTerminals } from '../../src/modules/remote-terminals.js';
import { allowedNavigation } from '../../src/domain/roles.js';

test('remote presence is freshness, never a claim that the device is powered off', () => {
  assert.equal(remotePresence({ lastSeenAt: { toMillis: () => 1000000 } }, 1000001), true);
  assert.equal(remotePresence({ lastSeenAt: 1000000 }, 1200000), false);
  assert.equal(remotePresence({}, 1000000), false);
});
test('remote installation is confirmed only by installed version, not download or installer success', () => {
  const cmd = { action: 'update', targetVersionCode: 44, expiresAt: 999999 };
  assert.equal(commandPhase(cmd, { installedVersionCode: 43, state: 'installed' }, 100), 'awaiting_restart');
  assert.equal(commandPhase(cmd, { installedVersionCode: 44, state: 'idle' }, 100), 'completed');
  assert.equal(commandPhase(cmd, { installedVersionCode: 43, state: 'ready' }, 1000000), 'expired');
});
test('remote command waits for operation, executes once and native install is not forced while busy', () => {
  let busy = true, checks = 0, installs = 0, status = { installedVersionCode: 43, state: 'idle' };
  const agent = createRemoteUpdateAgent({ getStatus: () => status, isBusy: () => busy, check: () => ++checks, install: () => ++installs, now: () => 100 });
  const cmd = { id: 'one', action: 'update', targetVersionCode: 44, expiresAt: 999999 };
  agent.receive(cmd);
  assert.equal(agent.tick().commandPhase, 'waiting_for_idle'); assert.equal(checks, 0);
  busy = false; assert.equal(agent.tick().commandPhase, 'checking'); assert.equal(checks, 1);
  agent.receive(cmd); agent.tick(); assert.equal(checks, 1);
  busy = true; status.state = 'ready'; agent.tick(); assert.equal(installs, 0);
  busy = false; agent.tick(); agent.tick(); assert.equal(installs, 1);
  status = { installedVersionCode: 44, state: 'idle' };
  assert.equal(agent.tick().commandPhase, 'completed'); assert.equal(checks, 1);
});
test('expired/unsupported commands cannot trigger updates and retry is explicit', () => {
  let checks = 0;
  const agent = createRemoteUpdateAgent({ getStatus: () => ({ installedVersionCode: 43, state: 'idle' }), isBusy: () => false, check: () => { checks++; return false; }, install: () => {}, now: () => 100 });
  agent.receive({ id: 'expired', action: 'update', targetVersionCode: 44, expiresAt: 99 });
  assert.equal(agent.tick().commandPhase, 'expired'); assert.equal(checks, 0);
  agent.receive({ id: 'shell', action: 'shell', expiresAt: 999 }); agent.tick(); assert.equal(checks, 0);
  agent.receive({ id: 'new', action: 'update', targetVersionCode: 44, expiresAt: 999 });
  assert.equal(agent.tick().commandPhase, 'error'); agent.tick(); assert.equal(checks, 1);
  agent.receive({ id: 'retry', action: 'update', targetVersionCode: 44, expiresAt: 999 }); agent.tick(); assert.equal(checks, 2);
});
test('remote panel escapes telemetry, correlates acknowledgments and is owner-only in navigation', () => {
  const html = renderRemoteTerminals({ remoteTerminals: [{ id: 'elo', label: '<script>bad</script>', installedVersionCode: 43, commandId: 'old', commandPhase: 'completed', command: { id: 'new', action: 'update', targetVersionCode: 44, expiresAt: Date.now() + 99999 } }] });
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('Pendiente de recepción'));
  assert.ok(allowedNavigation({ active: true, roles: ['owner'] }).includes('remote'));
  for (const role of ['manager', 'cashier', 'waiter', 'kitchen']) assert.ok(!allowedNavigation({ active: true, roles: [role] }).includes('remote'));
  assert.ok(renderRemoteTerminals({}).includes('Todavía no hay terminales registradas'));
});
