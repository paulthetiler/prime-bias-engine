// Screenshot → text for broker imports.
//
// Vision is deliberately a thin, swappable layer: a screenshot is turned into
// TEXT here, and everything downstream (adapters, matching, review) operates on
// that text exactly as it would on a paste. That keeps the interesting logic
// pure and unit-testable, and lets the OCR engine be replaced (or upgraded to a
// hosted vision model) without touching the journal flow.
//
// The default engine is tesseract.js, imported lazily so it never enters the
// main bundle and only downloads when a user actually uploads a screenshot. If
// it can't load (offline, blocked CDN), we throw a friendly error the UI turns
// into "we couldn't read that image — paste the text instead".

/** Injectable engine, so tests (and a future hosted model) can override OCR. */
let engine = null;

/** Override the OCR engine. `fn(file, onProgress) → Promise<string>`. */
export function setOcrEngine(fn) { engine = fn; }

/**
 * Extract raw text from an image file/blob.
 * @param {Blob} file
 * @param {(pct: number) => void} [onProgress]  0..1 recognition progress
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(file, onProgress) {
  if (!file) throw new Error('No image provided');
  if (engine) return engine(file, onProgress);
  return defaultTesseract(file, onProgress);
}

async function defaultTesseract(file, onProgress) {
  let recognize;
  try {
    ({ recognize } = await import('tesseract.js'));
  } catch {
    throw new Error('OCR engine unavailable — paste the broker text instead.');
  }
  try {
    const { data } = await recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress?.(m.progress);
        }
      },
    });
    const text = (data?.text || '').trim();
    if (!text) throw new Error('No readable text found in the image.');
    return text;
  } catch (err) {
    if (err instanceof Error && /paste the broker text|No readable text/.test(err.message)) throw err;
    throw new Error("Couldn't read that screenshot — try a clearer image or paste the text.");
  }
}
