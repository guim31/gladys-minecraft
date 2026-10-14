// -----------------------------------------------------------------------------
// The Java Edition Server List Ping, byte by byte, on real sockets: the
// packets we send (checked against mcstatus' expected bytes), the answers of
// a real vanilla 1.21.11 server (replayed from test/fixtures/minecraft/real),
// and what goes wrong (closed port, silence, another service, no pong).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS } from '../src/minecraft/errors.js';
import { buildStatusRequest, pingJava, readStatusJson, takePacket } from '../src/minecraft/java.js';
import { decodeVarInt, encodeVarInt } from '../src/minecraft/varint.js';
import { hexFixture, realStatus } from './helpers/fixtures.js';
import { freePort, startJavaServer, startOtherServer } from './helpers/fakeSockets.js';

test('VarInt: the examples of the protocol documentation', () => {
  const cases = [
    [0, '00'],
    [1, '01'],
    [127, '7f'],
    [128, '8001'],
    [255, 'ff01'],
    [25565, 'ddc701'],
    [2097151, 'ffff7f'],
    [2147483647, 'ffffffff07'],
    [-1, 'ffffffff0f'],
    [-2147483648, '8080808008'],
  ];
  for (const [value, hex] of cases) {
    assert.equal(encodeVarInt(value).toString('hex'), hex, `encode ${value}`);
    assert.deepEqual(decodeVarInt(Buffer.from(hex, 'hex')), { value, size: hex.length / 2 });
  }
  assert.equal(decodeVarInt(Buffer.from('80', 'hex')), null, 'incomplete');
  assert.throws(() => decodeVarInt(Buffer.from('ffffffffff01', 'hex')), RangeError);
});

test('the handshake is the one mcstatus sends', () => {
  // tests/protocol/test_java_client.py: protocol 44, localhost, 25565.
  const bytes = buildStatusRequest('localhost', 25565, 44);
  assert.equal(bytes.toString('hex'), '0f002c096c6f63616c686f737463dd01' + '0100');
  // Ours announces 47, like mcstatus by default.
  assert.equal(buildStatusRequest('localhost', 25565)[2], 47);
});

test('the status packets recorded from real servers decode', () => {
  assert.deepEqual(
    readStatusJson(takePacket(hexFixture('mcstatus/java-1.8-pre1.status')).payload),
    {
      description: 'A Minecraft Server',
      players: { max: 20, online: 0 },
      version: { name: '1.8-pre1', protocol: 44 },
    },
  );
  const three = realStatus('java-1.21.11-three-players');
  assert.equal(three.version.name, '1.21.11');
  assert.equal(three.version.protocol, 774);
  assert.deepEqual(three.players.sample.map((player) => player.name).sort(), [
    'Alex',
    'Notch_42',
    'Steve',
  ]);
  assert.equal(realStatus('java-1.21.11-thirteen-players').players.sample.length, 12);
  assert.equal(realStatus('java-1.21.11-hidden-players').players.sample, undefined);
});

test('a truncated packet waits for more bytes; a broken one is refused', () => {
  const whole = hexFixture('real/java-1.21.11-three-players.status');
  assert.equal(takePacket(whole.subarray(0, 40)), null);
  assert.equal(takePacket(whole).rest.length, 0);
  assert.throws(() => takePacket(Buffer.from('00', 'hex')), { kind: ERROR_KINDS.PROTOCOL });
  assert.throws(() => readStatusJson(Buffer.from('03017b7b', 'hex')), {
    kind: ERROR_KINDS.PROTOCOL,
  });
});

test('pingJava against a server replaying the real 1.21.11 answer', async (t) => {
  const server = await startJavaServer({
    status: hexFixture('real/java-1.21.11-three-players.status'),
  });
  t.after(server.close);
  const answer = await pingJava({
    host: '127.0.0.1',
    port: server.port,
    handshakeHost: 'mc.example.com',
  });
  assert.equal(answer.status.players.online, 3);
  assert.ok(answer.latencyMs >= 0 && answer.latencyMs < 1000);
  // The handshake carried the typed name and the port.
  const sent = Buffer.concat(server.received);
  assert.ok(sent.includes(Buffer.from('mc.example.com')));
});

test('an answer arriving in small pieces is put back together', async (t) => {
  const server = await startJavaServer({
    status: hexFixture('real/java-1.21.11-thirteen-players.status'),
    chunkSize: 7,
  });
  t.after(server.close);
  const answer = await pingJava({ host: '127.0.0.1', port: server.port });
  assert.equal(answer.status.players.online, 13);
});

test('a server closing without a pong still gives its status', async (t) => {
  for (const ping of ['close', 'ignore']) {
    const server = await startJavaServer({
      status: hexFixture('real/java-1.21.11-empty.status'),
      ping,
    });
    t.after(server.close);
    const answer = await pingJava({ host: '127.0.0.1', port: server.port, timeoutMs: 300 });
    assert.equal(answer.status.version.name, '1.21.11', ping);
  }
});

test('nothing listening, silence, another service: the error kinds', async (t) => {
  await assert.rejects(pingJava({ host: '127.0.0.1', port: await freePort() }), {
    kind: ERROR_KINDS.UNREACHABLE,
  });

  const silent = await startJavaServer({ status: Buffer.alloc(0) });
  t.after(silent.close);
  await assert.rejects(pingJava({ host: '127.0.0.1', port: silent.port, timeoutMs: 200 }), {
    kind: ERROR_KINDS.UNREACHABLE,
    message: /timed out/,
  });

  const web = await startOtherServer('HTTP/1.1 400 Bad Request\r\n\r\n');
  t.after(web.close);
  await assert.rejects(pingJava({ host: '127.0.0.1', port: web.port }), {
    kind: ERROR_KINDS.PROTOCOL,
  });
});
