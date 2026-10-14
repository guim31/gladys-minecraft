// -----------------------------------------------------------------------------
// Minecraft text to plain text, for the MOTD and the version shown in Gladys.
//
// A Java server sends its MOTD either as a string with legacy formatting codes
// (`§a`, `§l`, the `§x§r§r§g§g§b§b` hex colors of Spigot) or as a text
// component: `{ text, extra: [...] }`, possibly `translate` with a `fallback`.
// A Bedrock server sends a string with `§` codes, including the Bedrock-only
// colors (`§g` to `§v`). Every `§` and the character after it are dropped:
// whatever the code, it is formatting. (Cases taken from mcstatus, Apache-2.0.)
// -----------------------------------------------------------------------------

const MAX_DEPTH = 32;

/** Drop the `§` formatting codes. */
export const stripCodes = (text) => text.replace(/§./gsu, '').replace(/§$/u, '');

/** A text component (or a string, or an array of them) as plain text. */
export function componentText(component, depth = 0) {
  if (depth > MAX_DEPTH || component === null || component === undefined) {
    return '';
  }
  if (typeof component === 'string') {
    return component;
  }
  if (typeof component === 'number' || typeof component === 'boolean') {
    return String(component);
  }
  if (Array.isArray(component)) {
    return component.map((part) => componentText(part, depth + 1)).join('');
  }
  if (typeof component !== 'object') {
    return '';
  }
  let text = '';
  if (typeof component.text === 'string' || typeof component.text === 'number') {
    text = String(component.text);
  } else if (typeof component.translate === 'string') {
    text = typeof component.fallback === 'string' ? component.fallback : component.translate;
  }
  if (Array.isArray(component.extra)) {
    text += componentText(component.extra, depth + 1);
  }
  return text;
}

/**
 * The plain one-line text of a MOTD: codes dropped, its two lines joined by
 * " · ", spaces collapsed.
 * @param {unknown} raw string or text component
 * @param {number} [max] characters
 */
export function plainMotd(raw, max = 200) {
  const lines = stripCodes(componentText(raw))
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const text = lines.join(' · ');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
