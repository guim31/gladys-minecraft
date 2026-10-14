// -----------------------------------------------------------------------------
// What a server tells, reduced to what the integration shows: online, the
// player counts, who is playing (when the server says it), the version, the
// MOTD and the latency.
//
// Who is playing, on Java Edition, comes from the `players.sample` of the
// status, which is NOT a reliable list (minecraft.wiki, Server List Ping):
//   - the vanilla server sends 12 players at most, picked at random;
//   - `hide-online-players=true` removes it, and a player who turned off
//     "Allow Server Listings" shows as "Anonymous Player" (null UUID);
//   - plugins and proxies replace it with free text (§-colored lines).
// So the list is `complete` only when it holds exactly `online` real names:
// the join and leave triggers fire only between two complete lists. RCON
// `list` gives the whole list when enabled. Bedrock never tells who plays.
// -----------------------------------------------------------------------------

import { plainMotd, stripCodes } from './motd.js';

export const ANONYMOUS_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_NAME_LENGTH = 16;
const MAX_VERSION_LENGTH = 60;

/** A name a player can have: never formatting codes, 16 characters at most. */
export const isPlayerName = (name) =>
  typeof name === 'string' &&
  name.trim() === name &&
  name.length > 0 &&
  name.length <= MAX_NAME_LENGTH &&
  !name.includes('§');

const count = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

/** Sorted the way people read them, whatever the case. */
export const sortNames = (names) =>
  [...new Set(names)].sort(
    (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : 1),
  );

const shortVersion = (text) => {
  const plain = stripCodes(String(text ?? ''))
    .replace(/\s+/gu, ' ')
    .trim();
  return plain.length > MAX_VERSION_LENGTH ? `${plain.slice(0, MAX_VERSION_LENGTH - 1)}…` : plain;
};

/**
 * @param {object} status the JSON of a Java Status Response
 * @param {number} latencyMs
 */
export function readJavaStatus(status, latencyMs) {
  const players = status.players && typeof status.players === 'object' ? status.players : {};
  const online = count(players.online);
  const max = count(players.max);
  const sample = Array.isArray(players.sample) ? players.sample : null;
  let names = [];
  let complete = false;
  if (sample) {
    const real = sample.filter(
      (entry) => entry && isPlayerName(entry.name) && entry.id !== ANONYMOUS_UUID,
    );
    names = sortNames(real.map((entry) => entry.name));
    complete = real.length === sample.length && names.length === online;
  } else if (online === 0) {
    complete = true; // nobody: nothing to hide
  }
  return {
    edition: 'java',
    online,
    max,
    players: names,
    playersComplete: complete,
    playersHidden: !sample && online > 0,
    playersSource: 'status',
    version: shortVersion(status.version?.name),
    protocol: typeof status.version?.protocol === 'number' ? status.version.protocol : null,
    motd: plainMotd(status.description ?? ''),
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}

/**
 * @param {ReturnType<import('./bedrock.js').parseAdvertisement>} status
 * @param {number} latencyMs
 */
export function readBedrockStatus(status, latencyMs) {
  return {
    edition: 'bedrock',
    online: count(status.online),
    max: count(status.max),
    players: [],
    playersComplete: false,
    playersHidden: false,
    playersSource: 'none',
    version: shortVersion(status.version),
    protocol: status.protocol,
    // The level name is the second MOTD line of the Bedrock menu.
    motd: plainMotd([status.motd, status.levelName].filter(Boolean).join('\n')),
    gameMode: status.gameMode,
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}

/**
 * The answer of the RCON `list` command.
 * Vanilla: "There are 3 of a max of 10 players online: Alex, Steve, Notch_42".
 * Older and patched servers word it differently ("There are 3/10 players
 * online:", "There are 3 out of maximum 10 players online."), and some
 * plugins group the names by rank on several "rank: names" lines.
 * @returns {{ online: number|null, max: number|null, players: string[], complete: boolean }}
 */
export function parseRconList(text) {
  const plain = stripCodes(String(text ?? ''));
  const numbers = (plain.match(/\d+/gu) ?? []).map(Number);
  const [online = null, max = null] = numbers;
  const names = [];
  const lines = plain.split(/\r?\n/u);
  lines.forEach((line, index) => {
    const colon = line.indexOf(':');
    if (colon === -1) {
      return;
    }
    // The first line's prefix is the sentence; another line's is a rank.
    if (index > 0 || /\d/u.test(line.slice(0, colon))) {
      for (const part of line.slice(colon + 1).split(',')) {
        const name = part.trim();
        if (isPlayerName(name)) {
          names.push(name);
        }
      }
    }
  });
  const players = sortNames(names);
  return { online, max, players, complete: online !== null && players.length === online };
}
