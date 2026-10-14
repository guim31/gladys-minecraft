// -----------------------------------------------------------------------------
// Optional: against a REAL Minecraft server (`npm run test:real`). Skipped
// unless the environment names one, so the CI never touches the network:
//
//   MINECRAFT_JAVA=192.0.2.10:25565          a Java Edition server
//   MINECRAFT_RCON_PORT=25575                its RCON (optional)
//   MINECRAFT_RCON_PASSWORD=...              never printed
//   MINECRAFT_BEDROCK=192.0.2.10:19132       a Bedrock Edition server
//
// Run in the development session against the official vanilla 1.21.11
// server (Docker image webhippie/minecraft-vanilla, RCON on): the fixtures of
// test/fixtures/minecraft/real were recorded the same way. The Bedrock
// Dedicated Server could not bind its UDP port in that session.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAddress, resolveJavaTarget } from '../../src/minecraft/address.js';
import { pingBedrock } from '../../src/minecraft/bedrock.js';
import { pingJava } from '../../src/minecraft/java.js';
import { parseRconList, readBedrockStatus, readJavaStatus } from '../../src/minecraft/model.js';
import { RconClient } from '../../src/minecraft/rcon.js';

const { MINECRAFT_JAVA, MINECRAFT_RCON_PORT, MINECRAFT_RCON_PASSWORD, MINECRAFT_BEDROCK } =
  process.env;

test('a real Java Edition server answers the status ping', { skip: !MINECRAFT_JAVA }, async () => {
  const target = await resolveJavaTarget(parseAddress(MINECRAFT_JAVA));
  const answer = await pingJava({ ...target, timeoutMs: 5000 });
  const status = readJavaStatus(answer.status, answer.latencyMs);
  assert.ok(status.version, 'a version');
  assert.ok(status.max > 0, 'player slots');
  assert.ok(status.online >= 0);
  assert.ok(status.latencyMs < 5000);
});

test(
  'its RCON lists the players and the list agrees with the status',
  { skip: !MINECRAFT_JAVA || !MINECRAFT_RCON_PASSWORD },
  async (t) => {
    const address = parseAddress(MINECRAFT_JAVA);
    const client = new RconClient({
      host: address.host,
      port: Number(MINECRAFT_RCON_PORT || 25575),
      password: MINECRAFT_RCON_PASSWORD,
    });
    t.after(() => client.close());
    const list = parseRconList(await client.command('list'));
    assert.equal(list.complete, true, 'every name read');
    // Kept open: a second command on the same connection.
    const again = parseRconList(await client.command('list'));
    assert.equal(again.max, list.max);

    const target = await resolveJavaTarget(address);
    const status = readJavaStatus((await pingJava(target)).status, 0);
    assert.equal(status.max, list.max);
  },
);

test(
  'a wrong RCON password is refused',
  { skip: !MINECRAFT_JAVA || !MINECRAFT_RCON_PASSWORD },
  async (t) => {
    const address = parseAddress(MINECRAFT_JAVA);
    const client = new RconClient({
      host: address.host,
      port: Number(MINECRAFT_RCON_PORT || 25575),
      password: `${MINECRAFT_RCON_PASSWORD}-wrong`,
    });
    t.after(() => client.close());
    await assert.rejects(client.command('list'), { kind: 'rcon_auth' });
  },
);

test(
  'a real Bedrock Edition server answers the RakNet ping',
  { skip: !MINECRAFT_BEDROCK },
  async () => {
    const address = parseAddress(MINECRAFT_BEDROCK);
    const answer = await pingBedrock({ host: address.host, port: address.port ?? 19132 });
    const status = readBedrockStatus(answer.status, answer.latencyMs);
    assert.ok(status.max > 0);
    assert.ok(status.online >= 0);
  },
);
