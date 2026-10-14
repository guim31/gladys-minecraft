// -----------------------------------------------------------------------------
// Bedrock Edition: the RakNet Unconnected Ping we send, the advertisements of
// the fixtures (Home Assistant, the default Dedicated Server, a `;` in the
// MOTD, an empty version) and a ping on a real UDP socket.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAKNET_MAGIC,
  buildUnconnectedPing,
  parseAdvertisement,
  parseUnconnectedPong,
  pingBedrock,
} from '../src/minecraft/bedrock.js';
import { ERROR_KINDS, fromSocketError } from '../src/minecraft/errors.js';
import { readBedrockStatus } from '../src/minecraft/model.js';
import { textFixture } from './helpers/fixtures.js';
import { startBedrockServer } from './helpers/fakeSockets.js';

const advertisement = (name) => textFixture(name).trim();

test('the Unconnected Ping is the one mcstatus sends', () => {
  // mcstatus/_protocol/bedrock_client.py: id 01, time 0, magic, client GUID.
  assert.equal(
    buildUnconnectedPing(0n, Buffer.from('0000000000000000', 'hex')).toString('hex'),
    '01' + '0000000000000000' + RAKNET_MAGIC.toString('hex') + '0000000000000000',
  );
});

test('the advertisements of the fixtures', () => {
  assert.deepEqual(parseAdvertisement(advertisement('ha/bedrock-dummy')), {
    edition: 'MCPE',
    motd: 'Dummy MOTD',
    protocol: 123,
    version: 'Dummy Version',
    online: 3,
    max: 10,
    levelName: 'Dummy Map Name',
    gameMode: 'Dummy Game Mode',
  });
  const bds = parseAdvertisement(advertisement('synthetic/bedrock-dedicated-default'));
  assert.equal(bds.version, '1.26.52');
  assert.equal(bds.levelName, 'Bedrock level');
  assert.equal(
    parseAdvertisement(advertisement('synthetic/bedrock-motd-with-semicolon')).motd,
    '§aKids; no griefing!',
  );
  const empty = readBedrockStatus(
    parseAdvertisement(advertisement('synthetic/bedrock-empty-version')),
    1,
  );
  assert.equal(empty.version, '');
  assert.equal(empty.motd, 'Rainbow');
  assert.equal(empty.online, 1);
  assert.equal(empty.max, 69);
  assert.throws(() => parseAdvertisement('hello'), { kind: ERROR_KINDS.PROTOCOL });
  assert.throws(() => parseUnconnectedPong(Buffer.from('1c00', 'hex')), {
    kind: ERROR_KINDS.PROTOCOL,
  });
});

test('pingBedrock on a UDP socket, a lost datagram sent again', async (t) => {
  const server = await startBedrockServer({
    advertisement: advertisement('synthetic/bedrock-dedicated-default'),
    drop: 1,
  });
  t.after(server.close);
  const answer = await pingBedrock({ host: '127.0.0.1', port: server.port, timeoutMs: 3000 });
  assert.equal(answer.status.version, '1.26.52');
  assert.equal(answer.status.max, 10);
  assert.equal(server.pings, 2, 'the first ping was lost, the second answered');
});

test('a Bedrock port where nothing answers', async (t) => {
  const server = await startBedrockServer({ advertisement: 'x', drop: 100 });
  t.after(server.close);
  await assert.rejects(pingBedrock({ host: '127.0.0.1', port: server.port, timeoutMs: 300 }), {
    kind: ERROR_KINDS.UNREACHABLE,
  });
});

test('socket errors become error kinds', () => {
  const kind = (code) => fromSocketError(Object.assign(new Error(code), { code }), 'x').kind;
  assert.equal(kind('ENOTFOUND'), ERROR_KINDS.DNS);
  assert.equal(kind('EAI_AGAIN'), ERROR_KINDS.DNS);
  assert.equal(kind('ECONNREFUSED'), ERROR_KINDS.UNREACHABLE);
  assert.equal(kind('EHOSTUNREACH'), ERROR_KINDS.UNREACHABLE);
});
