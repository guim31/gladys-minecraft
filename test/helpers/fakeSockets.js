// -----------------------------------------------------------------------------
// Byte-level fake servers on the loopback interface (127.0.0.1, a port picked
// by the system): a Java status server that replays the bytes recorded from a
// real vanilla server, an RCON server that answers like it, a Bedrock UDP
// server. They test the protocol code on real sockets, never the network.
// -----------------------------------------------------------------------------

import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { decodeVarInt } from '../../src/minecraft/varint.js';
import { encodeRconPacket, takeRconPackets } from '../../src/minecraft/rcon.js';
import { RAKNET_MAGIC } from '../../src/minecraft/bedrock.js';

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

/** Close a server and every connection it still holds. */
function closer(server, sockets) {
  return () =>
    new Promise((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close(() => resolve());
    });
}

/**
 * A Java status server.
 * @param {object} options
 * @param {Buffer} options.status the bytes sent after the status request
 * @param {'echo'|'close'|'ignore'} [options.ping] what it does with the ping
 */
export async function startJavaServer({ status, ping = 'echo', chunkSize = 0 }) {
  const sockets = new Set();
  const received = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    let answered = false;
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      received.push(chunk);
      // Packets: handshake, status request, then the ping.
      for (;;) {
        const length = decodeVarInt(buffer, 0);
        if (!length || buffer.length < length.size + length.value) {
          return;
        }
        const body = buffer.subarray(length.size, length.size + length.value);
        const packet = buffer.subarray(0, length.size + length.value);
        buffer = buffer.subarray(length.size + length.value);
        const id = body[0];
        if (id === 0x00 && body.length === 1 && !answered) {
          answered = true;
          if (chunkSize > 0) {
            // A slow network: the answer arrives in small pieces.
            for (let at = 0; at < status.length; at += chunkSize) {
              socket.write(status.subarray(at, at + chunkSize));
            }
          } else {
            socket.write(status);
          }
        } else if (id === 0x01) {
          if (ping === 'echo') {
            socket.end(packet);
          } else if (ping === 'close') {
            socket.end();
          }
        }
      }
    });
  });
  const port = await listen(server);
  return { port, received, close: closer(server, sockets) };
}

/** A TCP server that answers anything with `answer` (another service on the port). */
export async function startOtherServer(answer) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', () => socket.end(answer));
  });
  const port = await listen(server);
  return { port, close: closer(server, sockets) };
}

/** A port where nothing listens (refused). */
export async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * An RCON server that behaves like the vanilla one: auth answered with type
 * 2 (id -1 on a wrong password), commands with type-0 pieces of 4096 bytes.
 */
export async function startRconServer({ password, answer = () => '' }) {
  const sockets = new Set();
  const stats = { connections: 0, commands: [], logins: 0 };
  const server = createServer((socket) => {
    sockets.add(socket);
    stats.connections += 1;
    let buffer = Buffer.alloc(0);
    let authed = false;
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = takeRconPackets(buffer);
      buffer = rest;
      for (const packet of packets) {
        if (packet.type === 3) {
          stats.logins += 1;
          authed = packet.body === password;
          socket.write(encodeRconPacket(authed ? packet.id : -1, 2, ''));
        } else if (packet.type === 2 && authed) {
          stats.commands.push(packet.body);
          const text = Buffer.from(answer(packet.body), 'utf8');
          let at = 0;
          do {
            socket.write(
              encodeRconPacket(packet.id, 0, text.subarray(at, at + 4096).toString('utf8')),
            );
            at += 4096;
          } while (at < text.length);
        }
      }
    });
  });
  const port = await listen(server);
  return { port, stats, sockets, close: closer(server, sockets) };
}

/**
 * A Bedrock server: answers an Unconnected Ping with `advertisement`.
 * @returns {Promise<{ port: number, pings: number, close: () => Promise<void> }>}
 */
export function startBedrockServer({ advertisement, guid = Buffer.alloc(8, 7), drop = 0 }) {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const state = { port: 0, pings: 0 };
    let toDrop = drop;
    socket.on('message', (message, remote) => {
      if (message[0] !== 0x01 || !message.subarray(9, 25).equals(RAKNET_MAGIC)) {
        return;
      }
      state.pings += 1;
      if (toDrop > 0) {
        toDrop -= 1; // a lost datagram
        return;
      }
      const text = Buffer.from(advertisement, 'utf8');
      const length = Buffer.alloc(2);
      length.writeUInt16BE(text.length);
      socket.send(
        Buffer.concat([
          Buffer.from([0x1c]),
          message.subarray(1, 9),
          guid,
          RAKNET_MAGIC,
          length,
          text,
        ]),
        remote.port,
        remote.address,
      );
    });
    socket.bind(0, '127.0.0.1', () => {
      state.port = socket.address().port;
      state.close = () => new Promise((done) => socket.close(() => done()));
      resolve(state);
    });
  });
}
