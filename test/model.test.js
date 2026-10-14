// -----------------------------------------------------------------------------
// What the integration reads in a status: the real 1.21.11 recordings, the
// fixtures of mcstatus and Home Assistant, the cases of the protocol
// documentation (anonymous player, a proxy's free-text sample), the MOTD
// formats and the RCON `list` answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainMotd } from '../src/minecraft/motd.js';
import { parseRconList, readJavaStatus } from '../src/minecraft/model.js';
import { jsonFixture, realStatus, textFixture } from './helpers/fixtures.js';

test('real 1.21.11: nobody, three players, thirteen (sample of 12), hidden', () => {
  const empty = readJavaStatus(realStatus('java-1.21.11-empty'), 2.4);
  assert.deepEqual(empty, {
    edition: 'java',
    online: 0,
    max: 10,
    players: [],
    playersComplete: true,
    playersHidden: false,
    playersSource: 'status',
    version: '1.21.11',
    protocol: 774,
    motd: 'Gladys test server',
    latencyMs: 2,
  });

  const three = readJavaStatus(realStatus('java-1.21.11-three-players'), 1);
  assert.deepEqual(three.players, ['Alex', 'Notch_42', 'Steve']);
  assert.equal(three.playersComplete, true);

  const thirteen = readJavaStatus(realStatus('java-1.21.11-thirteen-players'), 1);
  assert.equal(thirteen.online, 13);
  assert.equal(thirteen.players.length, 12);
  assert.equal(thirteen.playersComplete, false, '12 of 13: a partial list');

  const hidden = readJavaStatus(realStatus('java-1.21.11-hidden-players'), 1);
  assert.equal(hidden.online, 2);
  assert.deepEqual(hidden.players, []);
  assert.equal(hidden.playersHidden, true);
  assert.equal(hidden.playersComplete, false);
  assert.equal(hidden.motd, 'Gladys Family · Bienvenue à la maison');
});

test('Home Assistant and mcstatus fixtures', () => {
  const dummy = readJavaStatus(jsonFixture('ha/java-dummy'), 5);
  assert.deepEqual(dummy.players, ['Player 1', 'Player 2', 'Player 3']);
  assert.equal(dummy.playersComplete, true);
  assert.equal(dummy.version, 'Dummy Version');
  const component = readJavaStatus(jsonFixture('mcstatus/java-component-motd'), 0);
  assert.equal(component.motd, 'top12345678910some.random.string');
});

test('an anonymous player or a free-text sample is never a list of names', () => {
  const anonymous = readJavaStatus(jsonFixture('synthetic/java-anonymous-player'), 0);
  assert.deepEqual(anonymous.players, ['Steve']);
  assert.equal(anonymous.playersComplete, false);

  const proxy = readJavaStatus(jsonFixture('synthetic/java-proxy-sample'), 0);
  assert.deepEqual(proxy.players, []);
  assert.equal(proxy.playersComplete, false);
  assert.equal(proxy.version, 'Velocity 3.4.0');
  assert.equal(proxy.motd, 'Example Network · Survival · Creative');
});

test('missing or broken fields never throw', () => {
  const nothing = readJavaStatus({}, -3);
  assert.equal(nothing.online, 0);
  assert.equal(nothing.version, '');
  assert.equal(nothing.motd, '');
  assert.equal(nothing.latencyMs, 0);
  const odd = readJavaStatus({ players: { online: '3', max: -1, sample: [null, 5] } }, 0);
  assert.equal(odd.online, 0);
  assert.deepEqual(odd.players, []);
});

test('MOTD: codes, Bedrock colors, Spigot hex colors, two lines, length', () => {
  assert.equal(plainMotd('§aHello §lWorld§r\n§7second line'), 'Hello World · second line');
  assert.equal(plainMotd('§x§f§f§0§0§0§0Red§r and §gGold'), 'Red and Gold');
  assert.equal(plainMotd({ text: '§6A', extra: ['B', { translate: 'k', fallback: 'C' }] }), 'ABC');
  assert.equal(plainMotd(['a', { text: 'b' }]), 'ab');
  assert.equal(plainMotd('x'.repeat(300)).length, 200);
  assert.equal(plainMotd(null), '');
});

test('RCON list: vanilla, older and patched servers', () => {
  assert.deepEqual(parseRconList('There are 0 of a max of 10 players online: '), {
    online: 0,
    max: 10,
    players: [],
    complete: true,
  });
  assert.deepEqual(parseRconList(textFixture('synthetic/rcon-list-paper-old')), {
    online: 2,
    max: 20,
    players: ['Alex', 'Steve'],
    complete: true,
  });
  assert.deepEqual(parseRconList(textFixture('synthetic/rcon-list-essentials')), {
    online: 3,
    max: 20,
    players: ['Alex', 'Notch_42', 'Steve'],
    complete: true,
  });
  assert.equal(parseRconList(textFixture('synthetic/rcon-list-empty-paper')).complete, true);
  assert.equal(parseRconList('Unknown command').complete, false);
});
