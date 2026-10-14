// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to three servers, each in its own slot (address, edition, name, RCON).
// The slot number is the device identity: Minecraft servers have no stable
// id to use instead (the Bedrock GUID changes at every start), and moving a
// server to a new address must not orphan its device and its history.
// -----------------------------------------------------------------------------

import { parseAddress } from './minecraft/address.js';
import { RCON_DEFAULT_PORT } from './minecraft/rcon.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const SLOTS = [1, 2, 3];
export const EDITIONS = ['java', 'bedrock'];

// Reading intervals offered in the configuration, in seconds. A status ping
// is a few hundred bytes: 15 s is harmless for the server.
export const POLL_INTERVALS = ['15', '30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  server_1_address: '',
  server_1_edition: 'java',
  server_1_name: '',
  server_1_rcon: false,
  server_1_rcon_port: RCON_DEFAULT_PORT,
  server_1_rcon_password: '',
  server_2_address: '',
  server_2_edition: 'java',
  server_2_name: '',
  server_2_rcon: false,
  server_2_rcon_port: RCON_DEFAULT_PORT,
  server_2_rcon_password: '',
  server_3_address: '',
  server_3_edition: 'java',
  server_3_name: '',
  server_3_rcon: false,
  server_3_rcon_port: RCON_DEFAULT_PORT,
  server_3_rcon_password: '',
  poll_interval: '30',
  language: 'fr',
};

const MAX_NAME_LENGTH = 40;

const isTrue = (value) => value === true || value === 'true' || value === 1 || value === '1';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const servers = [];
  const invalidSlots = [];
  for (const slot of SLOTS) {
    const typed = text(`server_${slot}_address`);
    if (!typed) {
      continue;
    }
    const address = parseAddress(typed);
    if (!address) {
      invalidSlots.push(slot);
      continue;
    }
    const edition = pick(`server_${slot}_edition`, EDITIONS);
    const rconPort = Number(source[`server_${slot}_rcon_port`]);
    // Passwords are kept as typed: spaces may be part of them.
    const password = source[`server_${slot}_rcon_password`];
    const rconWanted = edition === 'java' && isTrue(source[`server_${slot}_rcon`]);
    servers.push({
      slot,
      address,
      edition,
      name: text(`server_${slot}_name`).slice(0, MAX_NAME_LENGTH) || null,
      rcon: rconWanted
        ? {
            port:
              Number.isInteger(rconPort) && rconPort >= 1 && rconPort <= 65535
                ? rconPort
                : RCON_DEFAULT_PORT,
            password: typeof password === 'string' ? password : '',
          }
        : null,
    });
  }

  return {
    servers,
    invalidSlots,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
