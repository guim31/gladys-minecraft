// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake Minecraft servers on a
// fake network and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless `timers: true` (with node:test mock
// timers): the tests read the servers with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeServer, createNetwork } from './fakeNetwork.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

// Documentation addresses (RFC 5737): never a real network.
export const HOST_1 = '192.0.2.10';
export const HOST_2 = '192.0.2.20';
export const HOST_3 = '192.0.2.30';

/** A manual clock for the hub. */
export function createClock(start = Date.UTC(2026, 9, 14, 17, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const ONE_SERVER = {
  server_1_address: HOST_1,
  server_1_name: 'Family server',
  language: 'en',
};

/**
 * @param {object} [options]
 * @param {Record<string, FakeServer>} [options.servers] by "host:port"
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  clock = createClock(),
  servers,
  config = ONE_SERVER,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(servers ?? { [`${HOST_1}:25565`]: new FakeServer() });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, { network, timers, timings, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub, clock };
}

/** External id of the device of a configuration slot. */
export const deviceId = (gladys, slot = 1) => gladys.externalIds('server', String(slot)).device;
export const featureId = (gladys, key, slot = 1) =>
  gladys.externalIds('server', String(slot)).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The scene events fired with this key. */
export const events = (world, key) =>
  world.fake.sceneEvents.filter((event) => event.key === key).map((event) => event.data);

export { FakeServer };
