// -----------------------------------------------------------------------------
// The VarInt of the Java Edition protocol (minecraft.wiki, "Java Edition
// protocol/Data types"): 7 bits per byte, least significant group first, the
// high bit set on every byte but the last, at most 5 bytes for a 32-bit int.
// Negative values are written as their 32-bit two's complement.
// -----------------------------------------------------------------------------

export const MAX_VARINT_BYTES = 5;

/** @param {number} value 32-bit integer */
export function encodeVarInt(value) {
  let rest = value >>> 0;
  const bytes = [];
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (rest !== 0);
  return Buffer.from(bytes);
}

/**
 * Read a VarInt at `offset`.
 * @returns {{ value: number, size: number } | null} null when the buffer ends first
 * @throws {RangeError} more than 5 bytes
 */
export function decodeVarInt(buffer, offset = 0) {
  let value = 0;
  for (let i = 0; i < MAX_VARINT_BYTES; i += 1) {
    if (offset + i >= buffer.length) {
      return null;
    }
    const byte = buffer[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) {
      return { value: value | 0, size: i + 1 };
    }
  }
  throw new RangeError('VarInt longer than 5 bytes');
}

/** A protocol string: VarInt byte length, then UTF-8. */
export function encodeString(text) {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([encodeVarInt(bytes.length), bytes]);
}

/** A packet: VarInt length of (id + payload), VarInt id, payload. */
export function encodePacket(id, ...parts) {
  const body = Buffer.concat([encodeVarInt(id), ...parts]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}
