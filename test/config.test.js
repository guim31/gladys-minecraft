// -----------------------------------------------------------------------------
// Addresses as players type them, the SRV record of Java Edition, and the
// normalization of the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { formatAddress, parseAddress, resolveJavaTarget } from '../src/minecraft/address.js';

test('addresses: IP, name, port, IPv6, pasted prefixes; refused', () => {
  const cases = [
    ['192.0.2.10', { host: '192.0.2.10', port: null }],
    ['192.0.2.10:25570', { host: '192.0.2.10', port: 25570 }],
    [' MC.Example.com ', { host: 'mc.example.com', port: null }],
    ['mc.example.com:19132', { host: 'mc.example.com', port: 19132 }],
    ['[2001:db8::1]:25565', { host: '2001:db8::1', port: 25565 }],
    ['2001:db8::1', { host: '2001:db8::1', port: null }],
    ['minecraft://mc.example.com/', { host: 'mc.example.com', port: null }],
    ['nas.local', { host: 'nas.local', port: null }],
  ];
  for (const [typed, expected] of cases) {
    assert.deepEqual(parseAddress(typed), expected, typed);
  }
  for (const bad of [
    '',
    '   ',
    'a b',
    'host:0',
    'host:70000',
    'user:pw@host',
    'host/path',
    '-bad',
    12,
  ]) {
    assert.equal(parseAddress(bad), null, String(bad));
  }
  assert.equal(formatAddress({ host: '2001:db8::1', port: 25565 }), '[2001:db8::1]:25565');
  assert.equal(formatAddress({ host: 'mc.example.com', port: null }), 'mc.example.com');
});

test('Java: the SRV record of a name typed without port, like the game', async () => {
  const lookups = [];
  const resolveSrv = async (name) => {
    lookups.push(name);
    return [
      { name: 'backup.example.com', port: 25570, priority: 20, weight: 0 },
      { name: 'node1.example.com.', port: 25566, priority: 10, weight: 5 },
    ];
  };
  assert.deepEqual(await resolveJavaTarget({ host: 'example.com', port: null }, { resolveSrv }), {
    host: 'node1.example.com',
    port: 25566,
    srv: true,
  });
  assert.deepEqual(lookups, ['_minecraft._tcp.example.com']);
  // A port typed, an IP: no lookup.
  assert.deepEqual(await resolveJavaTarget({ host: 'example.com', port: 25565 }, { resolveSrv }), {
    host: 'example.com',
    port: 25565,
    srv: false,
  });
  await resolveJavaTarget({ host: '192.0.2.10', port: null }, { resolveSrv });
  assert.equal(lookups.length, 1);
  // No SRV record: the name on 25565.
  const none = async () => {
    throw Object.assign(new Error('querySrv ENODATA'), { code: 'ENODATA' });
  };
  assert.deepEqual(
    await resolveJavaTarget({ host: 'nas.local', port: null }, { resolveSrv: none }),
    {
      host: 'nas.local',
      port: 25565,
      srv: false,
    },
  );
});

test('the configuration: servers by slot, RCON for Java only, defaults', () => {
  const config = normalizeConfig({
    server_1_address: '192.0.2.10',
    server_1_rcon: true,
    server_1_rcon_password: ' with spaces ',
    server_2_address: 'not an address',
    server_3_address: '192.0.2.30',
    server_3_edition: 'bedrock',
    server_3_rcon: true,
    server_3_rcon_password: 'ignored',
    server_3_name: '  Tablet  ',
    poll_interval: 15,
    language: 'de',
  });
  assert.deepEqual(config.servers, [
    {
      slot: 1,
      address: { host: '192.0.2.10', port: null },
      edition: 'java',
      name: null,
      rcon: { port: 25575, password: ' with spaces ' },
    },
    {
      slot: 3,
      address: { host: '192.0.2.30', port: null },
      edition: 'bedrock',
      name: 'Tablet',
      rcon: null,
    },
  ]);
  assert.deepEqual(config.invalidSlots, [2]);
  assert.equal(config.pollIntervalMs, 15_000);
  assert.equal(config.language, 'de');

  const defaults = normalizeConfig(undefined);
  assert.deepEqual(defaults.servers, []);
  assert.equal(defaults.pollIntervalMs, Number(DEFAULT_CONFIG.poll_interval) * 1000);
  assert.equal(defaults.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 30_000);
  assert.equal(
    normalizeConfig({ server_1_address: 'h', server_1_rcon: 'true', server_1_rcon_port: 99999 })
      .servers[0].rcon.port,
    25575,
  );
});
