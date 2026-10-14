// -----------------------------------------------------------------------------
// RCON client (minecraft.wiki, "RCON"; the Source RCON protocol): TCP,
// little-endian packets `length, request id, type, body, 0, 0`. A login
// (type 3) is answered with type 2 and our id, or id -1 when the password is
// wrong; a command (type 2) with one or more type-0 packets: the vanilla
// server cuts its answers into 4096-byte pieces.
//
// One connection per server, kept open: the vanilla server writes two lines
// to its log for every RCON connection, and a connection every 30 seconds
// would flood it. The connection is opened on the first command and again
// after it drops. Commands run one at a time.
//
// Only two commands are ever sent by this integration: `list` (who is
// online) and `say` (a chat message from a scene). No arbitrary command.
// -----------------------------------------------------------------------------

import { connect } from 'node:net';
import { ERROR_KINDS, MinecraftError, fromSocketError } from './errors.js';

export const RCON_DEFAULT_PORT = 25575;
export const TYPE_LOGIN = 3;
export const TYPE_COMMAND = 2;
export const TYPE_AUTH_RESPONSE = 2;
export const TYPE_RESPONSE = 0;
// The vanilla server answers in pieces of this many bytes: a shorter one is the last.
export const RESPONSE_PIECE_BYTES = 4096;
// The vanilla server refuses a packet over 1460 bytes: room for a command.
export const MAX_COMMAND_BYTES = 1400;
const MAX_PACKET_BYTES = 1024 * 1024;
// A 4096-byte piece may be the last one: wait this long for another.
const LAST_PIECE_WAIT_MS = 250;

export function encodeRconPacket(id, type, body) {
  const text = Buffer.from(body, 'utf8');
  const packet = Buffer.alloc(14 + text.length);
  packet.writeInt32LE(10 + text.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  text.copy(packet, 12);
  return packet; // the two trailing zero bytes are already there
}

/**
 * Take the whole packets at the front of `buffer`.
 * @returns {{ packets: Array<{ id: number, type: number, body: string }>, rest: Buffer }}
 */
export function takeRconPackets(buffer) {
  const packets = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = buffer.readInt32LE(offset);
    if (length < 10 || length > MAX_PACKET_BYTES) {
      throw new MinecraftError(ERROR_KINDS.PROTOCOL, `invalid RCON packet length ${length}`);
    }
    if (buffer.length - offset < 4 + length) {
      break;
    }
    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const raw = buffer.subarray(offset + 12, offset + 4 + length);
    const end = raw.indexOf(0);
    packets.push({
      id,
      type,
      body: raw.subarray(0, end === -1 ? raw.length : end).toString('utf8'),
    });
    offset += 4 + length;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export class RconClient {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {string} options.password never logged
   * @param {number} [options.timeoutMs]
   * @param {Function} [options.connect] node:net connect (test seam)
   */
  constructor({ host, port, password, timeoutMs = 5000, connect: connectFn = connect }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.connectFn = connectFn;
    this.socket = null;
    this.ready = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    /** @type {Map<number, { pieces: string[], resolve: Function, reject: Function, timer: any }>} */
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.closed = false;
  }

  get what() {
    return `RCON ${this.host}:${this.port}`;
  }

  /** Run one command, after the previous ones. Resolves with the answer text. */
  command(text) {
    const run = this.queue.then(() => this.run(text));
    this.queue = run.catch(() => {});
    return run;
  }

  async run(text) {
    if (Buffer.byteLength(text, 'utf8') > MAX_COMMAND_BYTES) {
      throw new MinecraftError(ERROR_KINDS.PROTOCOL, `${this.what}: command too long`);
    }
    await this.open();
    return this.request(TYPE_COMMAND, text);
  }

  open() {
    if (this.closed) {
      return Promise.reject(
        new MinecraftError(ERROR_KINDS.RCON_UNREACHABLE, `${this.what}: closed`),
      );
    }
    this.ready ??= this.login().catch((err) => {
      this.drop(err);
      throw err;
    });
    return this.ready;
  }

  async login() {
    await new Promise((resolve, reject) => {
      const socket = this.connectFn({ host: this.host, port: this.port });
      this.socket = socket;
      const onError = (err) =>
        reject(fromSocketError(err, this.what, ERROR_KINDS.RCON_UNREACHABLE));
      socket.setTimeout(this.timeoutMs, () =>
        socket.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })),
      );
      socket.once('error', onError);
      socket.once('connect', () => {
        socket.off('error', onError);
        socket.setTimeout(0);
        // Only for this connection: a late event of an old one never drops a new one.
        const mine = (fn) => (arg) => this.socket === socket && fn(arg);
        socket.on(
          'error',
          mine((err) => this.drop(fromSocketError(err, this.what, ERROR_KINDS.RCON_UNREACHABLE))),
        );
        socket.on(
          'close',
          mine(() =>
            this.drop(
              new MinecraftError(ERROR_KINDS.RCON_UNREACHABLE, `${this.what}: connection closed`),
            ),
          ),
        );
        socket.on(
          'data',
          mine((chunk) => this.receive(chunk)),
        );
        resolve();
      });
    });
    const answer = await this.request(TYPE_LOGIN, this.password, { login: true });
    if (answer === null) {
      throw new MinecraftError(ERROR_KINDS.RCON_AUTH, `${this.what}: password refused`);
    }
  }

  request(type, body, { login = false } = {}) {
    const id = this.nextId;
    this.nextId = this.nextId >= 0x7ffffff0 ? 1 : this.nextId + 1;
    return new Promise((resolve, reject) => {
      const entry = {
        login,
        pieces: [],
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending.delete(id);
          const err = new MinecraftError(ERROR_KINDS.RCON_UNREACHABLE, `${this.what}: no answer`);
          reject(err);
          this.drop(err);
        }, this.timeoutMs),
      };
      entry.timer.unref?.();
      this.pending.set(id, entry);
      this.socket.write(encodeRconPacket(id, type, body));
    });
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let parsed;
    try {
      parsed = takeRconPackets(this.buffer);
    } catch (err) {
      this.drop(err);
      return;
    }
    this.buffer = parsed.rest;
    for (const packet of parsed.packets) {
      if (packet.id === -1) {
        // Wrong password: the answer to the one login in flight.
        for (const [id, entry] of this.pending) {
          if (entry.login) {
            this.settle(id, null);
          }
        }
        continue;
      }
      const entry = this.pending.get(packet.id);
      if (!entry) {
        continue;
      }
      if (entry.login) {
        // Some servers send an empty RESPONSE_VALUE before the auth response.
        if (packet.type === TYPE_AUTH_RESPONSE) {
          this.settle(packet.id, '');
        }
        continue;
      }
      if (packet.type !== TYPE_RESPONSE) {
        continue;
      }
      entry.pieces.push(packet.body);
      clearTimeout(entry.timer);
      if (Buffer.byteLength(packet.body, 'utf8') < RESPONSE_PIECE_BYTES) {
        this.settle(packet.id, entry.pieces.join(''));
      } else {
        entry.timer = setTimeout(
          () => this.settle(packet.id, entry.pieces.join('')),
          LAST_PIECE_WAIT_MS,
        );
        entry.timer.unref?.();
      }
    }
  }

  settle(id, value) {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(value);
  }

  /** Forget the connection (the next command opens a new one) and fail what waits. */
  drop(err) {
    const socket = this.socket;
    this.socket = null;
    this.ready = null;
    this.buffer = Buffer.alloc(0);
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(err);
    }
    socket?.destroy();
  }

  close() {
    this.closed = true;
    this.drop(new MinecraftError(ERROR_KINDS.RCON_UNREACHABLE, `${this.what}: closed`));
  }
}
