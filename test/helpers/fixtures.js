// -----------------------------------------------------------------------------
// Fixtures of test/fixtures/minecraft (see the README there): raw bytes
// recorded from a real vanilla server, and status objects of the other
// sources (mcstatus, Home Assistant, the protocol documentation).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { readStatusJson, takePacket } from '../../src/minecraft/java.js';

const DIR = new URL('../fixtures/minecraft/', import.meta.url);

/** Bytes of a `.hex` fixture. */
export const hexFixture = (name) =>
  Buffer.from(readFileSync(new URL(`${name}.hex`, DIR), 'utf8').trim(), 'hex');

/** A JSON fixture. */
export const jsonFixture = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));

/** A text fixture. */
export const textFixture = (name) => readFileSync(new URL(`${name}.txt`, DIR), 'utf8');

/** The status JSON a real server sent, decoded from its recorded bytes. */
export function realStatus(name) {
  const packet = takePacket(hexFixture(`real/${name}.status`));
  return readStatusJson(packet.payload);
}
