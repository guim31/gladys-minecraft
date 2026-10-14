// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys 5.2 never polls a device
// published with should_poll: false (and never polls the devices created
// without should_poll, GladysAssistant/Gladys#3198): the servers must be read
// by the hub's own timer, with no onPoll at all. A first failure is checked
// again 15 s later, to tell a blip from an outage.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS } from '../src/hub.js';
import {
  FakeServer,
  HOST_1,
  ONE_SERVER,
  createAll,
  createClock,
  createWorld,
  events,
  featureId,
} from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

async function timed(t, config = { ...ONE_SERVER, poll_interval: '30' }) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const server = new FakeServer({ players: ['Steve'] });
  const w = await createWorld({
    clock,
    servers: { [`${HOST_1}:25565`]: server },
    config,
    timers: true,
  });
  t.after(() => w.app.stop());
  return { ...w, server };
}

test('the internal timer reads the servers without any onPoll from Gladys', async (t) => {
  const w = await timed(t);
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].should_poll, false, 'Gladys is not asked to poll');
  const before = w.server.pings;

  for (const players of [['Steve', 'Alex'], ['Alex'], []]) {
    w.server.players = players;
    w.clock.advance(30_000);
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'players_online')), players.length);
  }
  assert.equal(w.server.pings - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_JOINED).map((event) => event.player),
    ['Alex'],
  );
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_LEFT).map((event) => event.player),
    ['Steve', 'Alex'],
  );
});

test('a first failure is read again 15 s later: an outage in 15 s, not a full interval', async (t) => {
  const w = await timed(t, { ...ONE_SERVER, poll_interval: '300' });
  w.server.online = false;
  w.clock.advance(300_000);
  t.mock.timers.tick(300_000);
  await settle();
  assert.deepEqual(events(w, TRIGGERS.SERVER_OFFLINE), []);
  w.clock.advance(15_000);
  t.mock.timers.tick(15_000);
  await settle();
  assert.equal(events(w, TRIGGERS.SERVER_OFFLINE).length, 1);
});

test('the timer stops with the integration', async (t) => {
  const w = await timed(t);
  await w.app.stop();
  const before = w.server.pings;
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(w.server.pings, before);
});
