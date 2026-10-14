#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real Minecraft server, with the integration's own
// clients: what Gladys would read, without Gladys. Nothing is changed on the
// server (a status ping, and RCON `list` when a password is given).
//
//   node scripts/probe.mjs java 192.0.2.10[:25565]
//   node scripts/probe.mjs bedrock 192.0.2.10[:19132]
//   MINECRAFT_RCON_PASSWORD=... node scripts/probe.mjs java 192.0.2.10 [rcon-port]
//
// Prints counts and formats, never a password, nor player names (only how
// many were read), so the output can be pasted in an issue.
// -----------------------------------------------------------------------------

import { parseAddress, resolveJavaTarget } from '../src/minecraft/address.js';
import { pingBedrock } from '../src/minecraft/bedrock.js';
import { pingJava } from '../src/minecraft/java.js';
import { parseRconList, readBedrockStatus, readJavaStatus } from '../src/minecraft/model.js';
import { RconClient } from '../src/minecraft/rcon.js';

const [edition, typed, rconPort = '25575'] = process.argv.slice(2);
const address = parseAddress(typed ?? '');
if (!['java', 'bedrock'].includes(edition) || !address) {
  console.error('usage: node scripts/probe.mjs java|bedrock <host[:port]> [rcon-port]');
  process.exit(2);
}

const summary = (status) => ({
  edition: status.edition,
  version: status.version,
  protocol: status.protocol,
  online: status.online,
  max: status.max,
  namesRead: status.players.length,
  listComplete: status.playersComplete,
  namesHidden: status.playersHidden,
  motdLength: status.motd.length,
  latencyMs: status.latencyMs,
});

try {
  if (edition === 'bedrock') {
    const answer = await pingBedrock({ host: address.host, port: address.port ?? 19132 });
    console.log(
      JSON.stringify(summary(readBedrockStatus(answer.status, answer.latencyMs)), null, 2),
    );
  } else {
    const target = await resolveJavaTarget(address);
    console.log(`target: ${target.srv ? 'SRV record' : 'direct'}, port ${target.port}`);
    const answer = await pingJava(target);
    const raw = answer.status;
    console.log(
      JSON.stringify(
        {
          ...summary(readJavaStatus(raw, answer.latencyMs)),
          // The shape of the answer, to tell a vanilla server from a proxy.
          keys: Object.keys(raw).sort(),
          descriptionType: typeof raw.description,
          sampleSize: Array.isArray(raw.players?.sample) ? raw.players.sample.length : null,
        },
        null,
        2,
      ),
    );
    if (process.env.MINECRAFT_RCON_PASSWORD) {
      const client = new RconClient({
        host: address.host,
        port: Number(rconPort),
        password: process.env.MINECRAFT_RCON_PASSWORD,
      });
      try {
        const answerText = await client.command('list');
        const list = parseRconList(answerText);
        console.log(
          JSON.stringify(
            {
              rcon: 'ok',
              online: list.online,
              max: list.max,
              namesRead: list.players.length,
              complete: list.complete,
            },
            null,
            2,
          ),
        );
      } finally {
        client.close();
      }
    }
  }
} catch (err) {
  console.error(`${err.kind ?? 'error'}: ${err.message}`);
  process.exit(1);
}
