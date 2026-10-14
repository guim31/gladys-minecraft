// -----------------------------------------------------------------------------
// The RCON client: its packets against the bytes of a real vanilla 1.21.11
// server, then against a fake server on a real socket (login, wrong password,
// answers in 4096-byte pieces, one connection kept open, reconnection).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { ERROR_KINDS } from '../src/minecraft/errors.js';
import { RconClient, encodeRconPacket, takeRconPackets } from '../src/minecraft/rcon.js';
import { parseRconList } from '../src/minecraft/model.js';
import { hexFixture } from './helpers/fixtures.js';
import { freePort, startRconServer } from './helpers/fakeSockets.js';

test('a packet: length, id, type, body, two zero bytes (little-endian)', () => {
  assert.equal(
    encodeRconPacket(2, 2, 'list').toString('hex'),
    '0e000000' + '02000000' + '02000000' + '6c697374' + '0000',
  );
});

test('the answers of a real vanilla server decode', () => {
  const { packets, rest } = takeRconPackets(hexFixture('real/java-1.21.11-three-players.rcon'));
  assert.equal(rest.length, 0);
  assert.deepEqual(packets[0], { id: 1, type: 2, body: '' }, 'login accepted');
  assert.equal(packets[1].id, 2);
  assert.equal(packets[1].type, 0);
  assert.deepEqual(parseRconList(packets[1].body), {
    online: 3,
    max: 10,
    players: ['Alex', 'Notch_42', 'Steve'],
    complete: true,
  });
  const wrong = takeRconPackets(hexFixture('real/rcon-wrong-password')).packets;
  assert.deepEqual(wrong, [{ id: -1, type: 2, body: '' }]);
  const thirteen = takeRconPackets(hexFixture('real/java-1.21.11-thirteen-players.rcon')).packets;
  assert.equal(parseRconList(thirteen[1].body).players.length, 13);
});

const vanillaList = (players) => (command) =>
  command === 'list'
    ? `There are ${players.length} of a max of 20 players online: ${players.join(', ')}`
    : '';

test('login, commands on one connection kept open', async (t) => {
  const server = await startRconServer({ password: 'rcon-secret', answer: vanillaList(['Steve']) });
  t.after(server.close);
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'rcon-secret' });
  t.after(() => client.close());
  assert.match(await client.command('list'), /1 of a max of 20 players online: Steve$/);
  assert.equal(await client.command('say Dinner is ready'), '');
  assert.match(await client.command('list'), /Steve/);
  assert.equal(server.stats.connections, 1);
  assert.equal(server.stats.logins, 1);
  assert.deepEqual(server.stats.commands, ['list', 'say Dinner is ready', 'list']);
});

test('commands sent together are answered in order', async (t) => {
  const server = await startRconServer({ password: 'p', answer: (command) => `echo ${command}` });
  t.after(server.close);
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'p' });
  t.after(() => client.close());
  const answers = await Promise.all(['a', 'b', 'c'].map((command) => client.command(command)));
  assert.deepEqual(answers, ['echo a', 'echo b', 'echo c']);
});

test('an answer over 4096 bytes comes in pieces, put back together', async (t) => {
  const players = Array.from({ length: 400 }, (_, i) => `Player_${String(i).padStart(4, '0')}`);
  const server = await startRconServer({ password: 'p', answer: vanillaList(players) });
  t.after(server.close);
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'p' });
  t.after(() => client.close());
  const list = parseRconList(await client.command('list'));
  assert.equal(list.players.length, 400);
  assert.equal(list.complete, true);
});

test('a wrong password, nothing listening: the error kinds, never the password', async (t) => {
  const server = await startRconServer({ password: 'rcon-secret' });
  t.after(server.close);
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'not-this-one' });
  t.after(() => client.close());
  await assert.rejects(client.command('list'), (err) => {
    assert.equal(err.kind, ERROR_KINDS.RCON_AUTH);
    assert.ok(!err.message.includes('not-this-one'));
    return true;
  });
  assert.deepEqual(server.stats.commands, [], 'no command after a refused login');

  const closed = new RconClient({ host: '127.0.0.1', port: await freePort(), password: 'p' });
  await assert.rejects(closed.command('list'), { kind: ERROR_KINDS.RCON_UNREACHABLE });
});

test('a dropped connection is opened again by the next command', async (t) => {
  const server = await startRconServer({ password: 'p', answer: vanillaList([]) });
  t.after(server.close);
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'p' });
  t.after(() => client.close());
  await client.command('list');
  for (const socket of server.sockets) {
    socket.destroy(); // the server restarted
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(await client.command('list'), /There are 0/);
  assert.equal(server.stats.connections, 2);
});

test('a server that never answers times out', async (t) => {
  // Accepts the connection, never answers the login.
  const sockets = new Set();
  const mute = createServer((socket) => sockets.add(socket));
  await new Promise((resolve) => mute.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    sockets.forEach((socket) => socket.destroy());
    mute.close();
  });
  const client = new RconClient({
    host: '127.0.0.1',
    port: mute.address().port,
    password: 'p',
    timeoutMs: 100,
  });
  t.after(() => client.close());
  await assert.rejects(client.command('list'), {
    kind: ERROR_KINDS.RCON_UNREACHABLE,
    message: /no answer/,
  });
});

test('a command too long for the server is refused before sending', async () => {
  const client = new RconClient({ host: '127.0.0.1', port: 1, password: 'p' });
  await assert.rejects(client.command(`say ${'x'.repeat(2000)}`), { kind: ERROR_KINDS.PROTOCOL });
  client.close();
});
