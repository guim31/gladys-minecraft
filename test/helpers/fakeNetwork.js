// -----------------------------------------------------------------------------
// Fake Minecraft servers on a fake network, for the hub tests: they answer
// with the status JSON of the real recordings (test/fixtures/minecraft/real)
// through the same reading code as production (src/minecraft/model.js), and
// their RCON speaks like the vanilla server. The byte-level protocols are
// tested on real sockets in protocol.test.js, rcon.test.js, bedrock.test.js.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, MinecraftError } from '../../src/minecraft/errors.js';
import { readBedrockStatus, readJavaStatus } from '../../src/minecraft/model.js';
import { realStatus } from './fixtures.js';

const offlineUuid = (name) =>
  `00000000-0000-3000-8000-${Buffer.from(name).toString('hex').padEnd(12, '0').slice(0, 12)}`;

export class FakeServer {
  /**
   * @param {object} [options]
   * @param {'java'|'bedrock'} [options.edition]
   * @param {string} [options.fixture] a recording of test/fixtures/minecraft/real
   * @param {string[]} [options.players] who is playing
   * @param {string|null} [options.rconPassword] null: RCON off
   * @param {boolean} [options.hidePlayers] hide-online-players=true
   */
  constructor({
    edition = 'java',
    fixture = 'java-1.21.11-empty',
    players = [],
    rconPassword = null,
    hidePlayers = false,
    latencyMs = 3,
  } = {}) {
    this.edition = edition;
    this.status = edition === 'java' ? realStatus(fixture) : null;
    this.bedrock = {
      edition: 'MCPE',
      motd: 'Dedicated Server',
      protocol: 924,
      version: '1.26.52',
      online: 0,
      max: 10,
      levelName: 'Bedrock level',
      gameMode: 'Survival',
    };
    this.players = players;
    this.rconPassword = rconPassword;
    this.hidePlayers = hidePlayers;
    this.latencyMs = latencyMs;
    this.online = true;
    this.rconOnline = true;
    this.pings = 0;
    this.rconCommands = [];
    this.rconConnections = 0;
    this.chat = [];
  }

  /** The status JSON, as the vanilla server builds it. */
  javaStatus() {
    const status = structuredClone(this.status);
    status.players = { max: status.players.max, online: this.players.length };
    if (!this.hidePlayers && this.players.length > 0) {
      // Vanilla: 12 players at most, picked at random.
      status.players.sample = this.players
        .slice(0, 12)
        .map((name) => ({ id: offlineUuid(name), name }));
    }
    return status;
  }

  rconAnswer(command) {
    this.rconCommands.push(command);
    if (command === 'list') {
      const max = this.status.players.max;
      return `There are ${this.players.length} of a max of ${max} players online: ${this.players.join(', ')}`;
    }
    if (command.startsWith('say ')) {
      this.chat.push(command.slice(4));
      return '';
    }
    return `Unknown or incomplete command`;
  }
}

/**
 * @param {Record<string, FakeServer>} servers by "host:port" (default ports
 *   25565 for Java, 19132 for Bedrock)
 */
export function createNetwork(servers) {
  const find = (server) => {
    const port = server.address.port ?? (server.edition === 'bedrock' ? 19132 : 25565);
    return servers[`${server.address.host}:${port}`] ?? null;
  };
  return {
    servers,
    async ping(server) {
      const fake = find(server);
      if (!fake || !fake.online) {
        throw new MinecraftError(ERROR_KINDS.UNREACHABLE, `${server.address.host}: ECONNREFUSED`);
      }
      fake.pings += 1;
      if (fake.edition !== server.edition) {
        throw new MinecraftError(
          server.edition === 'java' ? ERROR_KINDS.PROTOCOL : ERROR_KINDS.UNREACHABLE,
          `${server.address.host}: not a status response`,
        );
      }
      if (fake.edition === 'bedrock') {
        return readBedrockStatus({ ...fake.bedrock, online: fake.players.length }, fake.latencyMs);
      }
      return readJavaStatus(fake.javaStatus(), fake.latencyMs);
    },
    rcon(server) {
      const what = `RCON ${server.address.host}:${server.rcon.port}`;
      let authed = false;
      return {
        closed: false,
        async command(text) {
          const fake = find(server);
          if (
            this.closed ||
            !fake ||
            !fake.online ||
            !fake.rconOnline ||
            fake.rconPassword === null
          ) {
            authed = false;
            throw new MinecraftError(ERROR_KINDS.RCON_UNREACHABLE, `${what}: ECONNREFUSED`);
          }
          if (!authed) {
            if (server.rcon.password !== fake.rconPassword) {
              throw new MinecraftError(ERROR_KINDS.RCON_AUTH, `${what}: password refused`);
            }
            fake.rconConnections += 1;
            authed = true;
          }
          return fake.rconAnswer(text);
        },
        close() {
          this.closed = true;
        },
      };
    },
  };
}
