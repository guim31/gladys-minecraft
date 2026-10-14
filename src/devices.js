// -----------------------------------------------------------------------------
// One Gladys device per configured Minecraft server.
//
// Identity: the configuration slot (1 to 3), not the address (see
// src/config.js). Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - online: input/binary, 1 when the server answers the status ping, 0 once
//     it failed twice in a row (one lost ping is not an outage);
//   - players online, player slots: counter-sensor/integer;
//   - players: text/text, who is playing — Java Edition only (Bedrock never
//     tells), complete with RCON, else the status sample (12 at most, may be
//     hidden): the text says when the list is partial or hidden;
//   - version, message of the day: text/text;
//   - latency: duration/integer, in milliseconds, of the status ping.
//
// The devices are published with should_poll: false: the integration reads
// the servers on its own timer (src/hub.js), Gladys never polls them
// (GladysAssistant/Gladys#3198).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { formatAddress } from './minecraft/address.js';
import { PLAYERS_TEXT, pick } from './texts.js';

export const DEVICE_TYPE = 'server';
export const ADDRESS_PARAM = 'MINECRAFT_ADDRESS';
export const EDITION_PARAM = 'MINECRAFT_EDITION';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  PLAYERS_ONLINE: 'players_online',
  PLAYERS_MAX: 'players_max',
  PLAYERS: 'players',
  VERSION: 'version',
  MOTD: 'motd',
  LATENCY: 'latency',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Players online',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Player slots',
    [FEATURE_KEYS.PLAYERS]: 'Players',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.MOTD]: 'Message of the day',
    [FEATURE_KEYS.LATENCY]: 'Latency',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Joueurs connectés',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Places',
    [FEATURE_KEYS.PLAYERS]: 'Joueurs',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.MOTD]: 'Message du jour',
    [FEATURE_KEYS.LATENCY]: 'Latence',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Spieler online',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Spielerplätze',
    [FEATURE_KEYS.PLAYERS]: 'Spieler',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.MOTD]: 'Nachricht des Tages',
    [FEATURE_KEYS.LATENCY]: 'Latenz',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Jugadores conectados',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Plazas',
    [FEATURE_KEYS.PLAYERS]: 'Jugadores',
    [FEATURE_KEYS.VERSION]: 'Versión',
    [FEATURE_KEYS.MOTD]: 'Mensaje del día',
    [FEATURE_KEYS.LATENCY]: 'Latencia',
  },
};

// Display bounds (the core never applies them on write). The largest public
// networks count a few hundred thousand players.
export const PLAYERS_DISPLAY_MAX = 1_000_000;
export const LATENCY_DISPLAY_MAX = 10_000;
// A text state longer than this is cut: the list of a full server.
export const MAX_TEXT_LENGTH = 250;

const text = (key) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    // Gladys keeps no history of a text; min/max are NOT NULL columns: 0/0.
    keep_history: false,
    min: 0,
    max: 0,
  },
});

const counter = (key) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: PLAYERS_DISPLAY_MAX,
  },
});

// Order = display order in Gladys.
const FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
  },
  counter(FEATURE_KEYS.PLAYERS_ONLINE),
  counter(FEATURE_KEYS.PLAYERS_MAX),
  { ...text(FEATURE_KEYS.PLAYERS), javaOnly: true },
  text(FEATURE_KEYS.VERSION),
  text(FEATURE_KEYS.MOTD),
  {
    key: FEATURE_KEYS.LATENCY,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DURATION,
      type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
      unit: DEVICE_FEATURE_UNITS.MILLISECONDS,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: LATENCY_DISPLAY_MAX,
    },
  },
];

const featuresOf = (edition) =>
  FEATURES.filter((feature) => !feature.javaOnly || edition === 'java');

/** External ids of a server's device and features. */
export const deviceIds = (gladys, slot) => gladys.externalIds(DEVICE_TYPE, String(slot));

/** The slot of a device external id, null when it is not one of ours. */
export function slotOf(gladys, externalId) {
  for (const slot of [1, 2, 3]) {
    if (deviceIds(gladys, slot).device === externalId) {
      return slot;
    }
  }
  return null;
}

/** The name shown for a server: the one typed in the configuration, else its address. */
export const serverName = (server) => server.name ?? `Minecraft ${formatAddress(server.address)}`;

/**
 * The discovery payload of a server.
 * @param {object} gladys SDK client
 * @param {{ slot: number, address: object, edition: string, name: string|null }} server
 * @param {string} language feature names language
 */
export function buildDevice(gladys, server, language = 'fr') {
  const ids = deviceIds(gladys, server.slot);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: serverName(server),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: ADDRESS_PARAM, value: formatAddress(server.address) },
      { name: EDITION_PARAM, value: server.edition },
    ],
    features: featuresOf(server.edition).map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

const cut = (value) =>
  value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…` : value;

/** What the "Players" text says for a reading. */
export function playersText(status, language) {
  const words = pick(PLAYERS_TEXT, language);
  if (status.online === 0) {
    return words.nobody;
  }
  if (status.playersHidden || status.players.length === 0) {
    return words.hidden(status.online);
  }
  const list = status.players.join(', ');
  if (status.playersComplete) {
    return cut(list);
  }
  return cut(`${list} ${words.more(Math.max(0, status.online - status.players.length))}`);
}

/**
 * The value of every feature of a server record (null: nothing to publish).
 * `down` publishes the outage: offline, nobody playing; the version and the
 * MOTD keep their last value.
 * @param {object} record { server, status, reachable, down }
 * @returns {Array<{ key: string, externalId: string, state?: number, text?: string }>}
 */
export function featureStates(gladys, record, language) {
  const ids = deviceIds(gladys, record.server.slot);
  const { status, down } = record;
  const live = record.reachable === true && status;
  const words = pick(PLAYERS_TEXT, language);
  const values = {
    [FEATURE_KEYS.ONLINE]: down ? 0 : live ? 1 : null,
    [FEATURE_KEYS.PLAYERS_ONLINE]: down ? 0 : live ? status.online : null,
    [FEATURE_KEYS.PLAYERS_MAX]: status ? status.max : null,
    [FEATURE_KEYS.PLAYERS]: down ? words.offline : live ? playersText(status, language) : null,
    [FEATURE_KEYS.VERSION]: status?.version ? status.version : null,
    [FEATURE_KEYS.MOTD]: status?.motd ? cut(status.motd) : null,
    [FEATURE_KEYS.LATENCY]: live ? Math.min(LATENCY_DISPLAY_MAX, status.latencyMs) : null,
  };
  return featuresOf(record.server.edition).map(({ key, definition }) => {
    const value = values[key];
    const entry = { key, externalId: ids.feature(key) };
    if (value === null || value === undefined) {
      return entry;
    }
    return definition.category === DEVICE_FEATURE_CATEGORIES.TEXT
      ? { ...entry, text: value }
      : { ...entry, state: value };
  });
}
