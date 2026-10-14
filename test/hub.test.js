// -----------------------------------------------------------------------------
// The hub against fake servers answering with the real recordings: devices,
// states (only to the added devices, only the changes), the join, leave and
// offline triggers, RCON, the chat action and the "Test the connection"
// report.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS } from '../src/hub.js';
import {
  FakeServer,
  HOST_1,
  HOST_2,
  createAll,
  createWorld,
  deviceId,
  events,
  featureId,
} from './helpers/world.js';

const JAVA = `${HOST_1}:25565`;

async function world(t, { server: given, fake, servers, ...options } = {}) {
  const server = given ?? new FakeServer(fake);
  const w = await createWorld({ servers: { [JAVA]: server, ...servers }, ...options });
  t.after(() => w.app.stop());
  return { ...w, server };
}

const rconConfig = (password = 'rcon-secret') => ({
  server_1_address: HOST_1,
  server_1_name: 'Family server',
  server_1_rcon: true,
  server_1_rcon_password: password,
  language: 'en',
});

test('one device per server, features named in the configured language', async (t) => {
  const w = await world(t, {
    config: {
      server_1_address: HOST_1,
      server_2_address: `${HOST_2}:19132`,
      server_2_edition: 'bedrock',
      language: 'fr',
    },
    servers: { [`${HOST_2}:19132`]: new FakeServer({ edition: 'bedrock' }) },
  });
  const [java, bedrock] = w.fake.discoveredDevices;
  assert.equal(java.name, `Minecraft ${HOST_1}`);
  assert.equal(java.should_poll, false);
  assert.deepEqual(
    java.features.map((feature) => feature.name),
    ['En ligne', 'Joueurs connectés', 'Places', 'Joueurs', 'Version', 'Message du jour', 'Latence'],
  );
  // Bedrock never tells who plays: no players text.
  assert.equal(bedrock.name, `Minecraft ${HOST_2}:19132`);
  assert.ok(!bedrock.features.some((feature) => feature.external_id.endsWith(':players')));
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('states go to the added devices only, then only the changes', async (t) => {
  const w = await world(t, { fake: { players: ['Steve'] } });
  assert.equal(w.fake.states.length, 0, 'nothing for a device not added');
  await createAll(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'online')), 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players_online')), 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players_max')), 10);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), 'Steve');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'version')), '1.21.11');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'motd')), 'Gladys test server');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'latency')), 3);

  const before = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before, 'nothing changed, nothing sent');

  w.server.players = ['Steve', 'Alex'];
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.states.slice(before).map((state) => state.device_feature_external_id.split(':').pop()),
    ['players_online', 'players'],
  );
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), 'Alex, Steve');
});

test('a player joining and leaving fires the triggers, with the time played', async (t) => {
  const w = await world(t, { fake: { players: ['Steve'] } });
  assert.deepEqual(w.fake.sceneEvents, [], 'the first reading is a starting point');

  w.server.players = ['Steve', 'Alex'];
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.PLAYER_JOINED), [
    {
      device: deviceId(w.gladys),
      server: 'Family server',
      player: 'Alex',
      players_online: 2,
    },
  ]);

  w.clock.advance(42 * 60_000);
  w.server.players = ['Steve'];
  await w.hub.pollAll();
  w.server.players = [];
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_LEFT).map(({ player, minutes_played, players_online }) => [
      player,
      minutes_played,
      players_online,
    ]),
    [
      ['Alex', 42, 1],
      // Steve was already there at start: how long is unknown.
      ['Steve', null, 0],
    ],
  );
});

test('a partial or hidden player list fires no trigger', async (t) => {
  const thirteen = Array.from({ length: 13 }, (_, i) => `Player${String(i + 1).padStart(2, '0')}`);
  const w = await world(t, { fake: { players: thirteen.slice(0, 12) } });
  await createAll(w);

  // 13 players: the vanilla sample holds 12 of them only.
  w.server.players = thirteen;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.match(w.fake.lastState(featureId(w.gladys, 'players')), /and 1 more$/);

  // Back to 12: the list is complete again, a new starting point.
  w.server.players = thirteen.slice(1);
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);

  w.server.hidePlayers = true;
  w.server.players = ['Steve', 'Alex'];
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, 'players')),
    '2 player(s), names hidden by the server',
  );
});

test('RCON gives the whole list: 13 players, joins and leaves seen', async (t) => {
  const thirteen = Array.from({ length: 13 }, (_, i) => `Player${String(i + 1).padStart(2, '0')}`);
  const w = await world(t, {
    config: rconConfig(),
    fake: { players: thirteen, rconPassword: 'rcon-secret' },
  });
  await createAll(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), thirteen.join(', '));

  w.server.players = [...thirteen.slice(1), 'Steve'];
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_JOINED).map((event) => event.player),
    ['Steve'],
  );
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_LEFT).map((event) => event.player),
    ['Player01'],
  );
  assert.equal(w.server.rconConnections, 1, 'one RCON connection, kept open');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a refused RCON password: said in the status, the sample is used instead', async (t) => {
  const w = await world(t, {
    config: rconConfig('wrong'),
    fake: { players: ['Steve'], rconPassword: 'rcon-secret' },
  });
  await createAll(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), 'Steve');
  assert.equal(w.fake.connectionStatus.connected, true, 'the server itself answers');
  assert.equal(w.fake.connectionStatus.message.en, 'Family server: RCON password refused');
  assert.equal(w.fake.connectionStatus.message.fr, 'Family server : mot de passe RCON refusé');
});

test('RCON on without a password is reported, nothing is tried', async (t) => {
  const w = await world(t, { config: rconConfig(''), fake: { rconPassword: 'rcon-secret' } });
  assert.equal(w.server.rconCommands.length, 0);
  assert.match(w.fake.connectionStatus.message.en, /RCON is on but its password is empty/);
});

test('a server that stops: offline after two failures, one trigger, then back', async (t) => {
  const w = await world(t, { fake: { players: ['Steve'] } });
  await createAll(w);

  w.server.online = false;
  await w.hub.pollAll();
  assert.equal(
    w.fake.lastState(featureId(w.gladys, 'online')),
    1,
    'one lost ping is not an outage',
  );
  assert.deepEqual(events(w, TRIGGERS.SERVER_OFFLINE), []);

  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_OFFLINE), [
    { device: deviceId(w.gladys), server: 'Family server', error: 'does not answer' },
  ]);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'online')), 0);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players_online')), 0);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), 'Server offline');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'version')), '1.21.11', 'kept');
  assert.deepEqual(events(w, TRIGGERS.PLAYER_LEFT), [], 'no "left" for each player');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys),
    transport: 'unreachable',
  });

  // It comes back with Steve: a new starting point, no "joined".
  w.server.online = true;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'online')), 1);
  assert.deepEqual(events(w, TRIGGERS.PLAYER_JOINED), []);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a Bedrock server: counts, version and MOTD, no names', async (t) => {
  const bedrock = new FakeServer({ edition: 'bedrock', players: ['a', 'b'] });
  const w = await world(t, {
    config: { server_1_address: HOST_1, server_1_edition: 'bedrock', language: 'en' },
    servers: { [`${HOST_1}:19132`]: bedrock },
  });
  await createAll(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players_online')), 2);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'version')), '1.26.52');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'motd')), 'Dedicated Server · Bedrock level');
  bedrock.players = ['a'];
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a Java address pointing at something else is a configuration problem, not an outage', async (t) => {
  const w = await world(t, {
    servers: { [JAVA]: new FakeServer({ edition: 'bedrock' }) },
  });
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_OFFLINE), []);
  assert.equal(
    w.fake.connectionStatus.message.en,
    'Family server: not a Minecraft server of this edition',
  );
});

test('the chat action sends one say command, cleaned to one line', async (t) => {
  const w = await world(t, { config: rconConfig(), fake: { rconPassword: 'rcon-secret' } });
  const ack = await w.fake.sceneAction('send_chat_message', {
    device: deviceId(w.gladys),
    message: '  Dinner is ready!\nCome down\u0007 ',
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { servers: 1 } } });
  assert.deepEqual(w.server.chat, ['Dinner is ready! Come down']);

  const all = await w.fake.sceneAction('send_chat_message', { message: 'À table !' });
  assert.deepEqual(all.data.outputs, { servers: 1 });
  assert.equal(w.server.chat.at(-1), 'À table !');
  assert.ok(w.server.rconCommands.every((command) => /^(list|say .+)$/.test(command)));
});

test('the chat action explains what is missing', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('send_chat_message', { message: 'Hello' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Enable RCON/);
  ack = await w.fake.sceneAction('send_chat_message', { message: ' \n ' });
  assert.match(ack.error, /empty/);
  ack = await w.fake.sceneAction('send_chat_message', { device: 'ext:other:x', message: 'Hi' });
  assert.match(ack.error, /no longer in the configuration/);

  const wrong = await world(t, {
    config: rconConfig('wrong'),
    fake: { rconPassword: 'rcon-secret' },
  });
  ack = await wrong.fake.sceneAction('send_chat_message', { message: 'Hi' });
  assert.equal(ack.error, 'Family server: RCON password refused');
});

test('"Test the connection" reports each server in every language', async (t) => {
  const w = await world(t, {
    config: { ...rconConfig(), server_2_address: HOST_2 },
    fake: { players: ['Steve'], rconPassword: 'rcon-secret' },
  });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    `Family server: Java 1.21.11, 1/10 players, 3 ms, RCON OK\nMinecraft ${HOST_2}: does not answer`,
  );
  assert.match(ack.data.message.fr, /^Family server : Java 1\.21\.11, 1\/10 joueurs/);
  assert.ok(ack.data.message.de && ack.data.message.es);
});

test('a new configuration: device kept per slot, RCON client replaced', async (t) => {
  const w = await world(t, { config: rconConfig(), fake: { rconPassword: 'rcon-secret' } });
  const first = w.hub.records.get(1).rcon;
  await w.fake.configUpdated({ ...rconConfig(), server_1_name: 'Kids' });
  assert.equal(w.hub.records.get(1).rcon, first, 'a new name keeps the connection');
  assert.equal(w.fake.discoveredDevices[0].name, 'Kids');
  await w.fake.configUpdated({ ...rconConfig('other'), server_1_name: 'Kids' });
  assert.notEqual(w.hub.records.get(1).rcon, first);
  assert.equal(first.closed, true, 'the old connection is closed');
  assert.equal(w.fake.discoveredDevices[0].external_id, deviceId(w.gladys));
});

test('no server configured: an empty discovery and a clear status', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: {
      en: 'Enter the address of your Minecraft server in the configuration.',
      fr: "Saisissez l'adresse de votre serveur Minecraft dans la configuration.",
      de: 'Gib die Adresse deines Minecraft-Servers in der Konfiguration ein.',
      es: 'Introduzca la dirección de su servidor Minecraft en la configuración.',
    },
  });
});

test('a device added later gets every state at once, and the widget a refresh', async (t) => {
  const w = await world(t, { fake: { players: ['Steve'] } });
  await w.hub.pollAll();
  const [device] = w.fake.discoveredDevices;
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.deviceCreated(device);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'players')), 'Steve');
  assert.equal(w.fake.states.length, 7);
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('every value is sent again after the heartbeat, never sooner', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 14, 17, 0, 0) });
  const w = await world(t, { fake: { players: ['Steve'] } });
  await createAll(w);
  const count = w.fake.states.length;
  t.mock.timers.tick(5 * 60 * 60_000);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, count);
  t.mock.timers.tick(60 * 60_000 + 1);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, count * 2, 'every feature once more after 6 h');
});

test('Gladys reconnecting gets the states again', async (t) => {
  const w = await world(t, { fake: { players: ['Steve'] } });
  await createAll(w);
  const count = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length, count * 2);
});
