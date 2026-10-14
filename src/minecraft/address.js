// -----------------------------------------------------------------------------
// Server addresses, as a player types them in the multiplayer screen:
// `192.0.2.10`, `mc.example.com`, `mc.example.com:25570`, `[2001:db8::1]:25565`.
//
// Java Edition, like the game, looks up the `_minecraft._tcp.<name>` SRV
// record when no port is given (mcstatus and Home Assistant do the same), and
// falls back to port 25565. Bedrock has no SRV: port 19132 by default.
// -----------------------------------------------------------------------------

import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_HOST_LENGTH = 253;

/**
 * Parse an address typed in the configuration.
 * @param {unknown} raw
 * @returns {{ host: string, port: number|null } | null} null when unusable
 */
export function parseAddress(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  // A pasted `minecraft://` or `http://` prefix, or a trailing slash, is noise.
  const text = raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
    .replace(/\/+$/u, '');
  if (!text || /[\s/@?#]/u.test(text)) {
    return null;
  }
  let host;
  let port = null;
  const bracketed = text.match(/^\[([0-9a-f:.]+)\](?::(\d+))?$/iu);
  if (bracketed) {
    [, host] = bracketed;
    port = bracketed[2] === undefined ? null : Number(bracketed[2]);
  } else if (isIP(text) === 6) {
    host = text; // a bare IPv6 address: no port possible
  } else {
    const match = text.match(/^([^:]+)(?::(\d+))?$/u);
    if (!match) {
      return null;
    }
    [, host] = match;
    port = match[2] === undefined ? null : Number(match[2]);
  }
  if (port !== null && !(port >= 1 && port <= 65535)) {
    return null;
  }
  host = host.toLowerCase();
  if (
    host.length > MAX_HOST_LENGTH ||
    (isIP(host) === 0 &&
      !/^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*\.?$/u.test(host))
  ) {
    return null;
  }
  return { host, port };
}

/** The address as shown to the user. */
export function formatAddress({ host, port }) {
  const shown = isIP(host) === 6 ? `[${host}]` : host;
  return port === null ? shown : `${shown}:${port}`;
}

/**
 * Where to connect for a Java server: the SRV record of a name typed without
 * port, else the name and the port (25565 by default).
 * @param {{ host: string, port: number|null }} address
 * @param {object} [options]
 * @param {(name: string) => Promise<Array<{ name: string, port: number, priority: number, weight: number }>>} [options.resolveSrv]
 * @returns {Promise<{ host: string, port: number, srv: boolean }>}
 */
export async function resolveJavaTarget(
  address,
  { resolveSrv = defaultResolveSrv, defaultPort = 25565 } = {},
) {
  if (address.port !== null) {
    return { host: address.host, port: address.port, srv: false };
  }
  if (isIP(address.host) === 0 && address.host !== 'localhost') {
    try {
      const records = await resolveSrv(`_minecraft._tcp.${address.host.replace(/\.$/u, '')}`);
      const [best] = [...(records ?? [])].sort(
        (a, b) => a.priority - b.priority || b.weight - a.weight,
      );
      if (best?.name && best.port) {
        return { host: best.name.replace(/\.$/u, ''), port: best.port, srv: true };
      }
    } catch {
      // No SRV record (ENODATA, ENOTFOUND) or no DNS answer: the plain name.
    }
  }
  return { host: address.host, port: defaultPort, srv: false };
}

function defaultResolveSrv(name) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  return resolver.resolveSrv(name);
}
