// -----------------------------------------------------------------------------
// Java Edition "Server List Ping" (minecraft.wiki, "Java Edition protocol/
// Server List Ping"), the request the multiplayer screen sends, without any
// account: over TCP, a Handshake (next state 1, status), a Status Request,
// the Status Response (one JSON string), then a Ping Request whose 8 bytes
// come back in the Pong, for the latency.
//
// The handshake announces protocol 47 (1.8), like mcstatus and so Home
// Assistant: every server since 1.7 answers it, and proxies that adapt their
// answer to the client version (BungeeCord, Velocity, ViaVersion) report their
// whole version range. Servers older than 1.7 (the legacy 0xFE ping) are not
// supported.
//
// Some servers and proxies close the connection after the status without
// answering the ping: the latency is then the status round trip.
// -----------------------------------------------------------------------------

import { connect } from 'node:net';
import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { ERROR_KINDS, MinecraftError, fromSocketError } from './errors.js';
import { decodeVarInt, encodePacket, encodeString, encodeVarInt } from './varint.js';

export const JAVA_DEFAULT_PORT = 25565;
export const HANDSHAKE_PROTOCOL = 47;
// A status JSON carries the server icon (a base64 PNG) and, on modded servers,
// the mod list: a few hundred kilobytes at worst. Anything bigger is not a
// Minecraft server.
export const MAX_PACKET_BYTES = 2 * 1024 * 1024;

const STATUS_STATE = 1;

/** The Handshake packet followed by the Status Request. */
export function buildStatusRequest(host, port, protocol = HANDSHAKE_PROTOCOL) {
  const portBytes = Buffer.alloc(2);
  portBytes.writeUInt16BE(port);
  return Buffer.concat([
    encodePacket(
      0x00,
      encodeVarInt(protocol),
      encodeString(host),
      portBytes,
      encodeVarInt(STATUS_STATE),
    ),
    encodePacket(0x00),
  ]);
}

/**
 * Take one whole packet from the front of `buffer`.
 * @returns {{ id: number, payload: Buffer, rest: Buffer } | null} null: wait for more bytes
 */
export function takePacket(buffer) {
  const length = decodeVarInt(buffer, 0);
  if (!length) {
    return null;
  }
  if (length.value <= 0 || length.value > MAX_PACKET_BYTES) {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, `invalid packet length ${length.value}`);
  }
  const end = length.size + length.value;
  if (buffer.length < end) {
    return null;
  }
  const body = buffer.subarray(length.size, end);
  const id = decodeVarInt(body, 0);
  if (!id) {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, 'packet without id');
  }
  return { id: id.value, payload: body.subarray(id.size), rest: buffer.subarray(end) };
}

/** The JSON string of a Status Response payload. */
export function readStatusJson(payload) {
  const length = decodeVarInt(payload, 0);
  if (!length || length.value < 0 || length.size + length.value > payload.length) {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, 'truncated status string');
  }
  const text = payload.subarray(length.size, length.size + length.value).toString('utf8');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new MinecraftError(ERROR_KINDS.PROTOCOL, 'status is not valid JSON');
  }
}

/**
 * Ping a Java Edition server.
 * @param {object} target
 * @param {string} target.host where to connect (an SRV target already resolved)
 * @param {number} target.port
 * @param {string} [target.handshakeHost] the name sent in the handshake (default: host)
 * @param {number} [target.timeoutMs]
 * @returns {Promise<{ status: object, latencyMs: number }>}
 */
export function pingJava({ host, port, handshakeHost = host, timeoutMs = 5000 }) {
  const what = `${host}:${port}`;
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let buffer = Buffer.alloc(0);
    let status = null;
    let statusLatency = 0;
    let sentAt = 0;
    let token = null;
    let settled = false;

    const finish = (err, value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    };
    // The status alone is a success: some servers do not answer the ping.
    const finishWithStatus = () =>
      status
        ? finish(null, { status, latencyMs: statusLatency })
        : finish(new MinecraftError(ERROR_KINDS.PROTOCOL, `${what}: connection closed early`));

    socket.setTimeout(timeoutMs, () => {
      if (status) {
        finishWithStatus();
      } else {
        finish(new MinecraftError(ERROR_KINDS.UNREACHABLE, `${what}: timed out`));
      }
    });
    socket.on('connect', () => {
      sentAt = performance.now();
      socket.write(buildStatusRequest(handshakeHost, port));
    });
    socket.on('error', (err) => {
      if (status) {
        finishWithStatus();
      } else {
        finish(fromSocketError(err, what));
      }
    });
    socket.on('close', finishWithStatus);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_PACKET_BYTES + 10) {
        finish(new MinecraftError(ERROR_KINDS.PROTOCOL, `${what}: answer too large`));
        return;
      }
      try {
        let packet = takePacket(buffer);
        while (packet && !settled) {
          buffer = packet.rest;
          if (!status) {
            if (packet.id !== 0x00) {
              throw new MinecraftError(ERROR_KINDS.PROTOCOL, `${what}: not a status response`);
            }
            status = readStatusJson(packet.payload);
            statusLatency = performance.now() - sentAt;
            token = randomBytes(8);
            sentAt = performance.now();
            socket.write(encodePacket(0x01, token));
          } else if (packet.id === 0x01 && packet.payload.equals(token)) {
            finish(null, { status, latencyMs: performance.now() - sentAt });
          } else {
            finishWithStatus();
          }
          packet = settled ? null : takePacket(buffer);
        }
      } catch (err) {
        finish(err instanceof MinecraftError ? err : fromSocketError(err, what));
      }
    });
  });
}
