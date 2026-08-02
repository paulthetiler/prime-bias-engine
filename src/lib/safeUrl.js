// Guard for user-supplied URLs that get rendered as links (e.g. screenshot_url).
//
// Only absolute http(s) URLs are allowed. Everything else — javascript:, data:,
// blob:, file:, mailto:, protocol-relative, relative paths, and anything that
// doesn't parse — is rejected so it can't become a clickable link.

/**
 * @param {unknown} value
 * @returns {string | null} the normalised URL if it is a safe http(s) link, else null
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null; // malformed / relative / protocol-relative URLs throw here
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}
