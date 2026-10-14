// -----------------------------------------------------------------------------
// The `minecraft` dashboard widget: content within the core vocabulary and
// budget (checked with the SDK's validator), one server or all of them,
// online, offline, Bedrock, in the language Gladys asks for.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { FakeServer, HOST_1, HOST_2, HOST_3, createWorld, deviceId } from './helpers/world.js';

const THREE = {
  server_1_address: HOST_1,
  server_1_name: 'Kids',
  server_2_address: HOST_2,
  server_2_name: 'Creative',
  server_3_address: HOST_3,
  server_3_edition: 'bedrock',
  server_3_name: 'Tablet',
  language: 'en',
};

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  assert.ok(tree.components.length <= 8);
  return tree;
}

const ofType = (tree, type) => tree.components.filter((component) => component.type === type);

test('one server: players and latency tiles, state and who is playing', async (t) => {
  const w = await world(t, {
    servers: { [`${HOST_1}:25565`]: new FakeServer({ players: ['Steve', 'Alex'] }) },
  });
  const tree = await content(w);
  assert.deepEqual(
    ofType(tree, 'value').map(({ label, value, unit, color }) => [label, value, unit, color]),
    [
      ['Players', '2/10', undefined, 'success'],
      ['Latency', 3, 'ms', undefined],
    ],
  );
  const [status] = ofType(tree, 'status');
  assert.deepEqual(
    status.items.map(({ label, value }) => [label, value]),
    [
      ['Family server', 'Online · 1.21.11'],
      ['Players', 'Alex, Steve'],
    ],
  );
  const french = await content(w, {}, 'fr');
  assert.equal(ofType(french, 'status')[0].items[0].value, 'En ligne · 1.21.11');
});

test('three servers, one offline, one Bedrock; or the one of the settings', async (t) => {
  const kids = new FakeServer({ players: ['Steve'] });
  const creative = new FakeServer();
  creative.online = false;
  const w = await world(t, {
    config: THREE,
    servers: {
      [`${HOST_1}:25565`]: kids,
      [`${HOST_2}:25565`]: creative,
      [`${HOST_3}:19132`]: new FakeServer({ edition: 'bedrock', players: ['a', 'b'] }),
    },
  });
  await w.hub.pollAll(); // the second failure: Creative is offline
  const tree = await content(w);
  assert.deepEqual(
    ofType(tree, 'value').map(({ label, value, color }) => [label, value, color]),
    [
      ['Kids', '1/10', 'success'],
      ['Creative', 'Offline', 'danger'],
      ['Tablet', '2/10', 'success'],
    ],
  );
  assert.deepEqual(
    ofType(tree, 'status')[0].items.map(({ label, value }) => [label, value]),
    [
      ['Kids', 'Online · 1.21.11'],
      ['Players · Kids', 'Steve'],
      ['Creative', 'Offline'],
      ['Tablet', 'Online · 1.26.52'],
    ],
  );

  const one = await content(w, { device: deviceId(w.gladys, 2) }, 'de');
  assert.deepEqual(ofType(one, 'value')[0].value, 'Offline');
  assert.equal(ofType(one, 'status')[0].items[0].label, 'Creative');
});

test('hidden names, nobody, unknown server, nothing configured', async (t) => {
  const hidden = new FakeServer({ players: ['Steve', 'Alex'], hidePlayers: true });
  const w = await world(t, { servers: { [`${HOST_1}:25565`]: hidden } });
  let tree = await content(w);
  assert.equal(ofType(tree, 'status')[0].items[1].value, 'names hidden');
  hidden.players = [];
  await w.hub.pollAll();
  tree = await content(w, {}, 'es');
  assert.equal(ofType(tree, 'status')[0].items[1].value, 'Nadie');

  tree = await content(w, { device: 'ext:test-integration:server:9' });
  assert.match(ofType(tree, 'text')[0].text, /no longer in the configuration/);

  const empty = await world(t, { config: { language: 'en' } });
  tree = await content(empty, {}, 'fr');
  assert.match(ofType(tree, 'text')[0].text, /^Saisissez l'adresse/);
});

test('the widget is refreshed when its content changes, not at every reading', async (t) => {
  const server = new FakeServer({ players: ['Steve'] });
  const w = await world(t, { servers: { [`${HOST_1}:25565`]: server } });
  const before = w.fake.widgetRefreshes.length;
  await w.hub.pollAll();
  assert.equal(w.fake.widgetRefreshes.length, before);
  server.players = ['Steve', 'Alex'];
  await w.hub.pollAll();
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});
