import React, { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  X, Upload, ClipboardPaste, Pencil, Loader2, AlertTriangle, Check, ArrowLeft, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  parseBrokerText, extractFromImage, reconcileMoney, matchTrade, findDuplicateByRef, buildResultUpdate,
} from '@/lib/brokerImport';

const resultLabels = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };

// Human labels for the editable review fields, in display order.
const REVIEW_FIELDS = [
  { key: 'instrument',   label: 'Instrument',    type: 'text',   context: true },
  { key: 'direction',    label: 'Direction',     type: 'text',   context: true },
  { key: 'grossPnl',     label: 'Profit / loss', type: 'number', money: true },
  { key: 'fees',         label: 'Fees',          type: 'number', money: true },
  { key: 'entryPrice',   label: 'Entry price',   type: 'number' },
  { key: 'exitPrice',    label: 'Exit price',    type: 'number' },
  { key: 'positionSize', label: 'Position size', type: 'number' },
  { key: 'openedAt',     label: 'Opened',        type: 'datetime' },
  { key: 'closedAt',     label: 'Closed',        type: 'datetime' },
  { key: 'brokerRef',    label: 'Broker ref',    type: 'text' },
];

function Shell({ title, subtitle, onClose, onBack, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} className="p-1 rounded-lg hover:bg-secondary shrink-0"><ArrowLeft className="w-4 h-4" /></button>
            )}
            <div className="min-w-0">
              <div className="text-base font-bold truncate">{title}</div>
              {subtitle && <div className="text-xs text-muted-foreground font-mono truncate">{subtitle}</div>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary shrink-0"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Read the extraction's field value into an editable string for the review form.
function toFormValues(fields, money) {
  const v = {};
  for (const { key } of REVIEW_FIELDS) v[key] = fields[key]?.value ?? '';
  // The reconciled signed gross is the authoritative "Profit / loss".
  if (money.grossPnl != null) v.grossPnl = String(money.grossPnl);
  if (money.fees != null) v.fees = String(money.fees);
  return v;
}

export default function ImportResultFlow({ trade, existingTrades = [], saving, onClose, onSave }) {
  const [step, setStep] = useState('choose'); // choose | text | ocr | select | review | manual
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState(null);        // full parseBrokerText result
  const [chosenIndex, setChosenIndex] = useState(0);
  const [form, setForm] = useState({});
  const [sourceText, setSourceText] = useState('');   // original text/OCR for the review panel
  const [imageUrl, setImageUrl] = useState(null);     // object URL of an uploaded screenshot
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState('');
  const [dupWarn, setDupWarn] = useState(null);

  const fileRef = useRef(null);

  // Manual-entry state (kept separate from the review form).
  const [mAmount, setMAmount] = useState('');
  const [mFees, setMFees] = useState('');
  const [mRisk, setMRisk] = useState('');

  const chosen = parsed?.trades?.[chosenIndex] || null;

  // Live money preview for the review form.
  const reviewMoney = useMemo(
    () => reconcileMoney({ grossPnl: form.grossPnl, fees: form.fees }),
    [form.grossPnl, form.fees]
  );

  // Match the (edited) review fields against the journal entry, plus a
  // sign-vs-known-result check.
  const match = useMemo(() => {
    if (step !== 'review' || !chosen || !trade) return null;
    const fieldsForMatch = {};
    for (const { key } of REVIEW_FIELDS) fieldsForMatch[key] = { value: form[key] === '' ? null : form[key] };
    const m = matchTrade(fieldsForMatch, trade);
    const warnings = m.mismatches.map(x => x.message);
    if ((trade.result === 'win' || trade.result === 'loss') && reviewMoney.result &&
        reviewMoney.result !== trade.result) {
      warnings.unshift(`This entry is marked ${resultLabels[trade.result]}, but the imported result is a ${reviewMoney.result}.`);
    }
    return { ...m, warnings };
  }, [step, chosen, form, trade, reviewMoney.result]);

  if (!trade) return null;

  const startReview = (result, index) => {
    const t = result.trades[index];
    setChosenIndex(index);
    setForm(toFormValues(t.fields, t.money));
    setStep('review');
  };

  const handleParsed = (result) => {
    setParsed(result);
    setSourceText(result.text || '');
    if (result.trades.length === 0) {
      setError(result.warnings[0] || "Couldn't read a trade from that.");
      return;
    }
    setError('');
    if (result.trades.length === 1) startReview(result, 0);
    else setStep('select');
  };

  const handlePaste = () => {
    setError('');
    handleParsed(parseBrokerText(pasteText));
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError('');
    setOcrProgress(0);
    setStep('ocr');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    try {
      const result = await extractFromImage(file, (p) => setOcrProgress(p));
      handleParsed(result);
      if (result.trades.length === 0) setStep('ocr'); // stay to show the error + retry
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the screenshot.');
      setStep('ocr');
    }
  };

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const confirmImport = () => {
    const brokerRef = form.brokerRef?.trim() || null;
    const dup = findDuplicateByRef(brokerRef, existingTrades, trade.id);
    if (dup) {
      setDupWarn(dup);
      return;
    }
    const update = buildResultUpdate({
      grossPnl: form.grossPnl,
      fees: form.fees,
      entryPrice: form.entryPrice,
      exitPrice: form.exitPrice,
      positionSize: form.positionSize,
      openedAt: form.openedAt || null,
      closedAt: form.closedAt || null,
      brokerRef,
      source: parsed?.source || 'broker_text',
    });
    onSave(update);
  };

  const saveManual = () => {
    const money = reconcileMoney({ grossPnl: mAmount, fees: mFees });
    onSave({
      gross_pnl: money.grossPnl,
      fees: money.fees,
      net_pnl: money.netPnl,
      pnl: money.netPnl,
      result: money.result ?? undefined,
      amount_risked: mRisk === '' ? null : Math.abs(Number(mRisk)),
      import_source: 'manual',
    });
  };

  const subtitle = `${trade.instrument} · ${resultLabels[trade.result] || ''}`;

  // ── Choose ────────────────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <Shell title="Add result" subtitle={subtitle} onClose={onClose}>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Import the result from your broker instead of typing it out.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-border bg-secondary px-4 py-4 text-left hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] transition-all"
          >
            <Upload className="w-5 h-5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-bold">Upload screenshot</div>
              <div className="text-xs text-muted-foreground">Camera, photo library or file</div>
            </div>
          </button>
          <button
            onClick={() => setStep('text')}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-border bg-secondary px-4 py-4 text-left hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] transition-all"
          >
            <ClipboardPaste className="w-5 h-5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-bold">Paste broker text</div>
              <div className="text-xs text-muted-foreground">Copy a row from your broker history</div>
            </div>
          </button>
          <button
            onClick={() => setStep('manual')}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Enter manually
          </button>
          {error && <ErrorNote text={error} />}
        </div>
      </Shell>
    );
  }

  // ── Paste text ──────────────────────────────────────────────────────────────
  if (step === 'text') {
    return (
      <Shell title="Paste broker text" subtitle={subtitle} onClose={onClose} onBack={() => setStep('choose')}>
        <div className="p-4 space-y-3">
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={7}
            autoFocus
            placeholder={'Paste a line or block from your broker history, e.g.\n\nEUR/USD Sell 1.00\nOpen 1.2600  Close 1.2500\nCommission -7.00  Profit 1000.00\nTicket 55512345'}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          {error && <ErrorNote text={error} />}
          <Button className="w-full" disabled={!pasteText.trim()} onClick={handlePaste}>Read text</Button>
          <p className="text-[10px] text-muted-foreground text-center">Nothing is saved until you review and confirm.</p>
        </div>
      </Shell>
    );
  }

  // ── OCR in progress / error ─────────────────────────────────────────────────
  if (step === 'ocr') {
    return (
      <Shell title="Reading screenshot" subtitle={subtitle} onClose={onClose} onBack={() => { setError(''); setStep('choose'); }}>
        <div className="p-4 space-y-4">
          {imageUrl && (
            <img src={imageUrl} alt="Uploaded screenshot" className="w-full max-h-56 object-contain rounded-lg border border-border bg-black/20" />
          )}
          {error ? (
            <>
              <ErrorNote text={error} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>Try another image</Button>
                <Button className="flex-1" onClick={() => setStep('text')}>Paste text instead</Button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin" />
              <div>Extracting trade details…</div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ── Choose which trade (multi-trade screenshot/text) ────────────────────────
  if (step === 'select') {
    return (
      <Shell title="Which trade?" subtitle={subtitle} onClose={onClose} onBack={() => setStep('choose')}>
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            {parsed.trades.length} trades detected. Pick the one for this journal entry.
          </p>
          {parsed.trades.map((t, i) => {
            const m = t.money;
            return (
              <button
                key={i}
                onClick={() => startReview(parsed, i)}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-left hover:border-primary/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {t.fields.instrument.value || 'Unknown'} · {t.fields.direction.value || '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {t.fields.closedAt.value ? new Date(t.fields.closedAt.value).toLocaleString() : (t.fields.brokerRef.value ? `Ref ${t.fields.brokerRef.value}` : 'No date')}
                  </div>
                </div>
                {m.netPnl != null && (
                  <div className={cn('font-mono text-sm font-bold shrink-0', m.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {m.netPnl > 0 ? '+' : m.netPnl < 0 ? '−' : ''}{Math.abs(m.netPnl)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Shell>
    );
  }

  // ── Manual entry ────────────────────────────────────────────────────────────
  if (step === 'manual') {
    return (
      <Shell title="Enter manually" subtitle={subtitle} onClose={onClose} onBack={() => setStep('choose')}>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1">
              Profit / loss <span className="text-muted-foreground font-normal">— use a minus for a loss</span>
            </label>
            <input
              type="number" inputMode="decimal" step="any" value={mAmount} onChange={e => setMAmount(e.target.value)}
              placeholder="e.g. 1000 or -250" autoFocus
              className="w-full h-11 rounded-lg border border-input bg-background px-3 text-base font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Fees (optional)</label>
              <input type="number" inputMode="decimal" min="0" step="any" value={mFees} onChange={e => setMFees(e.target.value)} placeholder="0.00"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Risked (optional)</label>
              <input type="number" inputMode="decimal" min="0" step="any" value={mRisk} onChange={e => setMRisk(e.target.value)} placeholder="0.00"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          {mAmount !== '' && Number.isFinite(Number(mAmount)) && (
            <NetPreview money={reconcileMoney({ grossPnl: mAmount, fees: mFees })} />
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setStep('choose')}>Back</Button>
            <Button className="flex-1" disabled={saving || mAmount === ''} onClick={saveManual}>Save result</Button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Review & confirm ────────────────────────────────────────────────────────
  return (
    <Shell title="Review & confirm" subtitle={subtitle} onClose={onClose} onBack={() => setStep(parsed?.trades?.length > 1 ? 'select' : 'choose')}>
      <div className="p-4 space-y-3">
        {parsed?.adapterLabel && (
          <div className="text-[11px] text-muted-foreground">Recognised as <span className="font-semibold text-foreground">{parsed.adapterLabel}</span> — check the values below before saving.</div>
        )}

        {match?.warnings?.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" /> This may not match the selected entry
            </div>
            {match.warnings.map((w, i) => <div key={i} className="text-[11px] text-amber-700 dark:text-amber-300">• {w}</div>)}
          </div>
        )}

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-2">
          {REVIEW_FIELDS.map(f => {
            const conf = chosen?.fields?.[f.key]?.confidence;
            const uncertain = form[f.key] !== '' && conf && conf !== 'high';
            const missing = form[f.key] === '' && (f.key === 'grossPnl' || f.key === 'instrument');
            return (
              <div key={f.key}>
                <label className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  {f.label}
                  {uncertain && <span className="text-amber-600 dark:text-amber-400 font-semibold">check</span>}
                  {missing && <span className="text-amber-600 dark:text-amber-400 font-semibold">missing</span>}
                  {f.context && <span className="text-muted-foreground/60">(for matching)</span>}
                </label>
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  value={f.type === 'datetime' ? toLocalInput(form[f.key]) : (form[f.key] ?? '')}
                  onChange={e => setField(f.key, f.type === 'datetime' ? fromLocalInput(e.target.value) : e.target.value)}
                  className={cn(
                    'w-full h-9 rounded-lg border bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring',
                    f.type === 'number' ? 'font-mono' : '',
                    uncertain || missing ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-input'
                  )}
                />
              </div>
            );
          })}
        </div>

        <NetPreview money={reviewMoney} />

        {/* Original source alongside the values */}
        {(imageUrl && parsed?.source === 'screenshot') ? (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Original screenshot</div>
            <img src={imageUrl} alt="Imported screenshot" className="w-full max-h-44 object-contain rounded-lg border border-border bg-black/20" />
          </div>
        ) : sourceText ? (
          <details className="rounded-lg border border-border bg-secondary/40">
            <summary className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground cursor-pointer">
              <FileText className="w-3.5 h-3.5" /> Original text
            </summary>
            <pre className="px-3 pb-2 text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-32 overflow-y-auto">{sourceText}</pre>
          </details>
        ) : null}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-1.5" disabled={saving || reviewMoney.netPnl == null} onClick={confirmImport}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Confirm & save</>}
          </Button>
        </div>
      </div>

      {/* Duplicate guard */}
      {dupWarn && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setDupWarn(null)}>
          <div className="w-full max-w-xs bg-card rounded-2xl border border-border p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" /> Already imported
            </div>
            <p className="text-xs text-muted-foreground">
              Broker reference <span className="font-mono text-foreground">{form.brokerRef}</span> is already on
              a saved trade ({dupWarn.instrument}). Importing it again would duplicate the result.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDupWarn(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function NetPreview({ money }) {
  if (money.netPnl == null) {
    return <div className="text-[11px] text-amber-600 dark:text-amber-400">Enter a profit or loss to compute the net result.</div>;
  }
  const net = money.netPnl;
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        Net result {money.fees ? <span className="opacity-70">(after {money.fees} fees)</span> : null}
      </span>
      <span className={cn('font-mono font-bold text-sm', net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
        {net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net)} <span className="uppercase text-[10px] font-semibold opacity-70">{money.result}</span>
      </span>
    </div>
  );
}

function ErrorNote({ text }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{text}</span>
    </div>
  );
}

// datetime-local <-> ISO helpers. The input works in the browser's local zone;
// we store ISO (UTC). Round-trips are best-effort — a missing value stays empty.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local) {
  if (!local) return '';
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}
