// -----------------------------------------------------------------------------
// Bedrock Edition status: the RakNet "Unconnected Ping" (minecraft.wiki,
// "RakNet"), over UDP, answered by an "Unconnected Pong" whose string is the
// server's advertisement, `;`-separated:
//
//   MCPE;<MOTD line 1>;<protocol>;<version>;<online>;<max>;<server GUID>;
//   <MOTD line 2: the level name>;<game mode>;<game mode number>;<IPv4 port>;
//   <IPv6 port>;
//
// The MOTD may itself contain `;` on some servers: the fields are read from
// both ends when there are too many. UDP may lose a datagram: the ping is
// sent again every second until the timeout. Bedrock tells the player count
// but never who is playing.
// -----------------------------------------------------------------------------

import { createSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ERROR_KINDS, MinecraftError, fromSocketError } from './errors.js';

export const BEDROCK_DEFAULT_PORT = 19132;

// The "offline message data ID" every RakNet offline packet carries.
export const RAKNET_MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const UNCONNECTED_PING = 0x01;
const UNCONNECTED_PONG = 0x1c;
const RESEND_MS = 1000;

/** The Unconnected Ping: id, time (8 bytes), magic, client GUID (8 bytes). */
export function buildUnconnectedPing(time = BigInt(Date.now()), guid = randomBytes(8)) {
  const timeBytes = Buffer.alloc(8);
  timeBytes.writeBigInt64BE(BigInt.asIntN(64, time));
  return Buffer.concat([Buffer.from([UNCONNECTED_PING]), timeBytes, RAKNET_MAGIC, guid]);
}

/**
 * Parse an Unconnected Pong datagram.
 * @returns {{ edition: string, motd: string, protocol: number|null, version: string,
 *   online: number, max: number, levelName: string|null, gameMode: string|null }}
 */
export function parseUnconnectedPong(datagram) {
  const header = 1 + 8 + 8 + RAKNET_MAGIC.length;
  if (
    datagram.length < header + 2 ||
    datagram[0] !== UNCONNECTED_PONG ||
    !datagram.subarray(17, 17 + RAKNET_MAGIC.length).equals(RAKNET_MAGIC)
  ) {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, 'not a RakNet unconnected pong');
  }
  const length = datagram.readUInt16BE(header);
  const text = datagram.subarray(header + 2, header + 2 + length).toString('utf8');
  return parseAdvertisement(text);
}

const NUMBER = /^-?\d+$/;

/** The `;`-separated advertisement string of a Bedrock server. */
export function parseAdvertisement(text) {
  let fields = text.split(';');
  // A `;` in the MOTD shifts everything: find the player counts, the first
  // run of protocol, version, online and max after the edition.
  let motdEnd = 2;
  while (
    motdEnd + 3 < fields.length &&
    !(
      NUMBER.test(fields[motdEnd]) &&
      NUMBER.test(fields[motdEnd + 2]) &&
      NUMBER.test(fields[motdEnd + 3])
    )
  ) {
    motdEnd += 1;
  }
  if (motdEnd > 2) {
    fields = [fields[0], fields.slice(1, motdEnd).join(';'), ...fields.slice(motdEnd)];
  }
  const [edition, motd, protocol, version, online, max, , levelName, gameMode] = fields;
  if (!edition || !NUMBER.test(online ?? '') || !NUMBER.test(max ?? '')) {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, 'not a Minecraft Bedrock advertisement');
  }
  return {
    edition,
    motd: motd ?? '',
    protocol: NUMBER.test(protocol ?? '') ? Number(protocol) : null,
    version: version ?? '',
    online: Number(online),
    max: Number(max),
    levelName: levelName || null,
    gameMode: gameMode || null,
  };
}

/**
 * Ping a Bedrock Edition server.
 * @param {{ host: string, port: number, timeoutMs?: number }} target
 * @returns {Promise<{ status: ReturnType<typeof parseAdvertisement>, latencyMs: number }>}
 */
export async function pingBedrock({ host, port, timeoutMs = 5000 }) {
  const what = `${host}:${port}`;
  let address;
  try {
    address = await lookup(host);
  } catch (err) {
    throw fromSocketError(err, what);
  }
  return new Promise((resolve, reject) => {
    const socket = createSocket(address.family === 6 ? 'udp6' : 'udp4');
    let settled = false;
    let sentAt = 0;
    let resendTimer = null;
    const finish = (err, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      clearInterval(resendTimer);
      socket.close();
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    };
    const deadline = setTimeout(
      () => finish(new MinecraftError(ERROR_KINDS.UNREACHABLE, `${what}: timed out`)),
      timeoutMs,
    );
    socket.on('error', (err) => finish(fromSocketError(err, what)));
    socket.on('message', (datagram) => {
      try {
        finish(null, {
          status: parseUnconnectedPong(datagram),
          latencyMs: performance.now() - sentAt,
        });
      } catch (err) {
        finish(err);
      }
    });
    // ICMP "port unreachable" arrives as ECONNREFUSED on a connected socket
    // only: connecting it tells a stopped server from a slow one.
    socket.connect(port, address.address, (err) => {
      if (err) {
        finish(fromSocketError(err, what));
        return;
      }
      sentAt = performance.now();
      socket.send(buildUnconnectedPing(), (sendErr) => {
        if (sendErr) {
          finish(fromSocketError(sendErr, what));
        }
      });
      resendTimer = setInterval(() => {
        sentAt = performance.now();
        socket.send(buildUnconnectedPing(), () => {});
      }, RESEND_MS);
    });
  });
}
