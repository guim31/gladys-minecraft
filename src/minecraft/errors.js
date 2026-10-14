// -----------------------------------------------------------------------------
// Errors of the Minecraft clients, by kind. The hub tells a silent server
// (UNREACHABLE: refused, timed out, no route) from a configuration problem (a
// refused RCON password) and from something that answers but is not a
// Minecraft server (PROTOCOL).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  DNS: 'dns',
  PROTOCOL: 'protocol',
  RCON_AUTH: 'rcon_auth',
  RCON_NO_PASSWORD: 'rcon_no_password',
  RCON_UNREACHABLE: 'rcon_unreachable',
});

export class MinecraftError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message never a password
   */
  constructor(kind, message) {
    super(message);
    this.name = 'MinecraftError';
    this.kind = kind;
  }
}

const SILENCE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ETIMEDOUT',
  'EPIPE',
  'EADDRNOTAVAIL',
]);
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME', 'ENODATA']);

/** A socket error as a MinecraftError (`kind` UNREACHABLE unless the name does not resolve). */
export function fromSocketError(err, what, unreachableKind = ERROR_KINDS.UNREACHABLE) {
  if (err instanceof MinecraftError) {
    return err;
  }
  if (DNS_CODES.has(err.code)) {
    return new MinecraftError(ERROR_KINDS.DNS, `${what}: name not found (${err.code})`);
  }
  const reason = SILENCE_CODES.has(err.code) ? err.code : err.code || err.message;
  return new MinecraftError(unreachableKind, `${what}: ${reason}`);
}
