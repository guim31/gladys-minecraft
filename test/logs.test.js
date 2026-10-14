// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing — players coming and going included
// —, a failure that repeats is logged once, and its end once. Never an RCON
// password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeServer, HOST_1, createWorld } from './helpers/world.js';

const PASSWORD = 'very-secret-rcon-password';

/** Capture the lines of the SDK logger at a level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, { password = PASSWORD, rcon = true } = {}) {
  const server = new FakeServer({ players: ['Steve'], rconPassword: PASSWORD });
  const w = await createWorld({
    servers: { [`${HOST_1}:25565`]: server },
    config: {
      server_1_address: HOST_1,
      server_1_name: 'Family server',
      server_1_rcon: rcon,
      server_1_rcon_password: password,
      language: 'en',
    },
  });
  t.after(() => w.app.stop());
  for (const device of w.fake.discoveredDevices) {
    await w.fake.deviceCreated(device);
  }
  return { ...w, server };
}

test('a normal reading cycle writes nothing at info, players coming and going included', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => /Family server\): connected \(Java 1\.21\.11\)/.test(text)),
    logs.texts().join('\n'),
  );
  logs.clear();
  for (const players of [['Steve', 'Alex'], ['Alex'], [], ['Notch_42']]) {
    w.server.players = players;
    w.clock.advance(30_000);
    await w.hub.pollAll();
  }
  assert.deepEqual(logs.texts(), []);
});

test('a server that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');

  logs.clear();
  w.server.online = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after 5 min/);
});

test('a refused RCON password is logged once, never the password', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { password: 'wrong-password-typed' });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.pollAll();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /RCON .* password refused/);
  const all = logs.texts().join('\n');
  assert.ok(!all.includes('wrong-password-typed') && !all.includes(PASSWORD), 'never a password');

  // Fixed in the configuration: one line.
  logs.clear();
  await w.fake.configUpdated({
    server_1_address: HOST_1,
    server_1_name: 'Family server',
    server_1_rcon: true,
    server_1_rcon_password: PASSWORD,
    language: 'en',
  });
  assert.ok(!logs.texts().join('\n').includes(PASSWORD));
});

test('a chat message is one info line, without its text', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('send_chat_message', { message: 'Dinner is ready' });
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /chat message sent \(15 characters\)/);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 429');
  };
  for (const players of [['Alex'], ['Notch_42'], ['Steve']]) {
    w.server.players = players;
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States of .* refused: HTTP 429/);
});

test('LOG_LEVEL=debug shows the joins and each failure; never the password', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  w.server.players = ['Steve', 'Alex'];
  await w.hub.pollAll();
  w.server.online = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*Alex joined/);
  assert.match(text, /\[DEBUG\].*\(again\)/);
  assert.ok(!text.includes(PASSWORD), 'never the password');
});
