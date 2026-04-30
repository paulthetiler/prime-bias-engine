// Central user settings store — persisted to localStorage

const SETTINGS_KEY = 'primebias_settings';

const DEFAULTS = {
  // Display
  showWhyThisTrade: true,
  showAlignment: true,
  showScore: true,
  compactMode: false,
  showTarget: true,
  showNotes: true,

  // Input
  inputStyle: 'tap-cycle', // 'tap-cycle' | 'buttons'

  // Dashboard filters (defaults)
  filterABOnly: false,
  filterHideWait: false,
  filterHideExtended: false,
  filterAlignedOnly: false,

  // Trade completion
  tradeCompletionMode: 'quick', // 'quick' | 'detailed'

  // Advanced logic
  useM5Override: false,
  downgradeOnNowWeakness: false,
  requireAlignmentForA: false,

  // Scoring weights
  weights: {
    month: 2,
    week: 5,
    day: 10,
    h4: 30,
    h1: 33,
    m15: 10,
    m5: 5,
  },

  // Grade thresholds
  gradeThresholds: {
    extended: 90,
    risky: 85,
    A: 75,
    B: 60,
    C: 50,
    D: 40,
  },
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    // Deep-merge: saved overrides defaults, but missing keys fall back
    return {
      ...DEFAULTS,
      ...saved,
      weights: { ...DEFAULTS.weights, ...(saved.weights || {}) },
      gradeThresholds: { ...DEFAULTS.gradeThresholds, ...(saved.gradeThresholds || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('settingsUpdated'));
}

export function useSettings() {
  // Simple hook — reads once. Components that need reactivity should listen to settingsUpdated.
  return getSettings();
}

export { DEFAULTS };