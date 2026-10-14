// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the real vanilla 1.21.11 recordings, a Bedrock server): one to
// three servers, Java and Bedrock, with and without RCON, in every
// feature-name language, online and offline.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FakeServer, HOST_1, HOST_2, HOST_3, createAll, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const threeServers = {
  server_1_address: HOST_1,
  server_1_name: 'Kids',
  server_1_rcon: true,
  server_1_rcon_password: 'rcon-secret',
  server_2_address: `${HOST_2}:25566`,
  server_3_address: HOST_3,
  server_3_edition: 'bedrock',
};

const scenarios = [
  { label: 'one server', config: undefined, count: 1 },
  { label: 'three servers', config: { ...threeServers, language: 'en' }, count: 3 },
  { label: 'French names', config: { ...threeServers, language: 'fr' }, count: 3 },
  { label: 'German names', config: { ...threeServers, language: 'de' }, count: 3 },
  { label: 'Spanish names', config: { ...threeServers, language: 'es' }, count: 3 },
  {
    label: 'offline servers',
    config: { ...threeServers, language: 'en' },
    count: 3,
    offline: true,
  },
];

const servers = () => ({
  [`${HOST_1}:25565`]: new FakeServer({
    fixture: 'java-1.21.11-three-players',
    players: ['Steve', 'Alex', 'Notch_42'],
    rconPassword: 'rcon-secret',
  }),
  [`${HOST_2}:25566`]: new FakeServer({
    fixture: 'java-1.21.11-hidden-players',
    players: ['Steve', 'Alex'],
    hidePlayers: true,
  }),
  [`${HOST_3}:19132`]: new FakeServer({ edition: 'bedrock', players: ['a'] }),
});

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const network = servers();
    const { app, hub, fake } = await createWorld({
      config: scenario.config,
      servers: network,
    });
    try {
      await createAll({ fake });
      if (scenario.offline) {
        for (const server of Object.values(network)) {
          server.online = false;
        }
        await hub.pollAll();
        await hub.pollAll();
      }
      const devices = fake.discoveredDevices;
      assert.equal(devices.length, scenario.count);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds; a text is never empty.
          const value = fake.lastState(feature.external_id);
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: no text published`);
            assert.ok(value.trim().length > 0, `${at}: empty text`);
          } else {
            assert.equal(typeof value, 'number', `${at}: no state published`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            if (feature.type === 'integer' || feature.type === 'binary') {
              assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
            }
          }
        }
      }
      // Every state went to a feature that exists.
      const known = new Set(devices.flatMap((device) => device.features.map((f) => f.external_id)));
      for (const state of fake.states) {
        assert.ok(known.has(state.device_feature_external_id), state.device_feature_external_id);
      }
    } finally {
      await app.stop();
    }
  });
}
