// Lightweight haptic feedback for mobile. No-ops where unsupported.

export function haptic(pattern = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export const tap = () => haptic(8);
export const success = () => haptic([12, 40, 18]);
export const warn = () => haptic([20, 30, 20]);
