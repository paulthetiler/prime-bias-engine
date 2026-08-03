// Lightweight, greppable logging for the cross-device sync path (save / fetch /
// hydrate). Kept deliberately simple: everything routes through console with a
// stable `[PrimeBias:sync]` prefix so a user can open DevTools on either device,
// filter by that tag, and immediately see whether the save, fetch, or hydration
// is the step that failed.
//
// Verbose (info/debug) logging can be silenced by setting
//   localStorage.setItem('primebias_sync_debug', 'off')
// Warnings and errors always print.

const PREFIX = '[PrimeBias:sync]';

function debugEnabled() {
  try {
    return localStorage.getItem('primebias_sync_debug') !== 'off';
  } catch {
    return true;
  }
}

/**
 * @param {string} area one of 'save' | 'fetch' | 'hydrate' | 'auth' | 'complete'
 * @param {string} msg
 * @param {any} [data]
 */
export function syncLog(area, msg, data) {
  if (!debugEnabled()) return;
  if (data !== undefined) console.info(`${PREFIX}[${area}] ${msg}`, data);
  else console.info(`${PREFIX}[${area}] ${msg}`);
}

/**
 * @param {string} area
 * @param {string} msg
 * @param {any} [err]
 */
export function syncWarn(area, msg, err) {
  if (err !== undefined) console.warn(`${PREFIX}[${area}] ${msg}`, err);
  else console.warn(`${PREFIX}[${area}] ${msg}`);
}

/**
 * @param {string} area
 * @param {string} msg
 * @param {any} [err]
 */
export function syncError(area, msg, err) {
  if (err !== undefined) console.error(`${PREFIX}[${area}] ${msg}`, err);
  else console.error(`${PREFIX}[${area}] ${msg}`);
}
