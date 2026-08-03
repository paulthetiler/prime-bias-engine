# Broker import for the Add Result flow

The **Add Result** flow (Trade History → a completed win/loss with no money yet →
_Add result_) can now import the result straight from a broker instead of the
user re-typing it: **upload a screenshot**, **paste broker text**, or fall back
to **enter manually**. Parsing lives behind a swappable _broker-import adapter_
so new broker formats are added without touching the journal flow.

## 1. Which extracted fields can already be stored

The `completed_trade` table (migrations `0001`, `0003`, `0004`) already holds
most of what an import extracts:

| Extracted field | Existing column | Notes |
| --- | --- | --- |
| Instrument | `instrument` | Set at completion from the analysis; import only uses it for **matching**, it does not overwrite it. |
| Buy/sell direction | `direction` | Same — used for matching, not overwritten. |
| Profit / loss (signed gross) | `gross_pnl` | From `0004`. |
| Fees / commission | `fees` | From `0004`. |
| Net result | `net_pnl` (+ `pnl` mirror) | From `0004`. `net = gross − fees`. |
| Entry price | `entry_price` | From `0001`. |
| Exit price | `exit_price` | From `0001`. |
| Screenshot | `screenshot_url` | From `0001` (link only; no storage upload wired yet). |

## 2. Which database fields need adding (`0005_broker_import.sql`)

Five columns had no home and are added (all nullable, additive, re-runnable):

| Extracted field | New column | Purpose |
| --- | --- | --- |
| Position size / volume | `position_size numeric` | Traded size / lots. |
| Open timestamp | `opened_at timestamptz` | Broker open time, kept separate from journal-side `created_at`. |
| Close timestamp | `closed_at timestamptz` | Broker close time, separate from `completed_at`. |
| Order / trade reference | `broker_ref text` | The **dedupe key**. |
| Provenance | `import_source text` | `manual` \| `broker_text` \| `screenshot`. |

Plus a **partial unique index** `completed_trade_user_broker_ref_key` on
`(user_id, broker_ref) where broker_ref is not null` — a database-level guarantee
that the same broker reference can't be imported twice, even if the client check
is bypassed. Manual rows (no reference) are unconstrained.

## 3. How duplicate detection works

Two layers:

1. **Client** — `findDuplicateByRef(brokerRef, existingTrades, currentTradeId)`
   (`lib/brokerImport/match.js`) checks the extracted reference (case- and
   whitespace-insensitive) against every loaded trade, ignoring the entry being
   edited. On a clash the review screen shows an _"Already imported"_ dialog and
   refuses to save.
2. **Database** — the partial unique index rejects a second insert/update of the
   same `(user_id, broker_ref)`.

Imports with no recoverable reference fall through both layers (nothing to
match on) and rely on the user reviewing before confirming.

## 4. How this updates balance, ROI, win rate and other stats

Nothing new is needed downstream — the import writes the **same** columns the
existing financial model already reads:

- **Balance / equity curve** (`lib/accounts.js`) sum `net_pnl` for
  financially-complete trades. An imported result sets `net_pnl`, so the trade
  starts contributing immediately; the balance stays _calculated_, never stored.
- **ROI** (`periodRoi`) uses `net_pnl` in the numerator and never counts
  deposits/withdrawals — and adapters refuse to read a deposit/withdrawal/balance
  line as P/L (`looksLikeCashFlow`), so account cash flows can't leak in as
  profit.
- **Win rate / grade & asset breakdowns** (`lib/journalStats.js`) key off
  `result` (`win`/`loss`), which is **derived from the sign** of the money
  (`classifyResult`) — a negative import becomes a loss, a positive a win,
  regardless of any label.
- **Profit factor / avg R** use `net_pnl` and `amount_risked` exactly as before.

Because `net = gross − fees` is re-derived on save (`buildResultUpdate` →
`reconcileMoney`), the stored trio is always internally consistent.

## 5. How errors and low-confidence extraction are handled

- **Never auto-saved.** Every path lands on an **editable review screen**; the
  user must press _Confirm & save_.
- **Per-field confidence.** Each extracted field carries `high`/`medium`/`low`.
  The review screen highlights anything below `high` (`check`) and flags empty
  wanted fields (`missing`) with an amber ring.
- **Matching warnings.** `matchTrade` compares instrument, direction, entry and
  date/time against the selected journal entry and warns on mismatch — plus a
  sign-vs-known-result check ("entry is marked Win, imported result is a loss").
  Advisory, not a hard block.
- **OCR failure.** Screenshot text extraction is a lazily-loaded, swappable
  engine (`ocr.js`, default `tesseract.js`). If it can't load or reads nothing,
  the user gets a clear message and a one-tap switch to _Paste text instead_.
- **Unrecognised text.** Returns zero trades with a plain-language warning and
  the manual-entry fallback.

## Architecture — the broker-import adapter

```
src/lib/brokerImport/
  parse.js      pure field primitives (numbers, money, dates, direction, instrument)
  adapters.js   ADAPTERS registry: metatrader, generic (+ selectAdapter, splitTradeBlocks)
  money.js      reconcileMoney / classifyResult (signed gross ↔ net, win/loss/breakeven)
  match.js      matchTrade + findDuplicateByRef
  ocr.js        extractTextFromImage (swappable engine; default tesseract.js, lazy)
  index.js      parseBrokerText / extractFromImage / buildResultUpdate  ← the only import the UI needs
```

An adapter is `{ id, label, detect(text)→0..1, parse(text)→Extraction[] }`.
`selectAdapter` runs the best-scoring one; `generic` is the guaranteed
label-driven fallback. **Adding a broker = adding one adapter object to
`ADAPTERS`** — the journal flow (`components/journal/ImportResultFlow.jsx`) never
changes. The whole library is pure and unit-tested in
`brokerImport.test.js` (34 cases); only `ocr.js` touches the outside world.
