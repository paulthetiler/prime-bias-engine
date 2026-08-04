# Wage Maker → Prime Bias integration — read-only audit (Issue #14)

**Scope:** read-only. No code, schema, migrations or DB changed. No spreadsheet
imported. Existing test suite run and reported. Ends with a GO / NO-GO.

**Inputs inspected**
- Workbook: `Wage maker journal Prop $.xlsx` — 15 sheets (`Summary`, `Jan`…`Dec`,
  `Wage Maker`, `Compound Plan`). Formulas read directly (openpyxl, `data_only=False`).
- Issue #14 (full body).
- Repo `paulthetiler/prime-bias-engine` @ branch `claude/wage-maker-audit-ydsr54`.
- Existing design note `docs/financial-model.md`.

**Fact vs assumption:** every claim tagged **[V]** is verified against a specific
file/line or workbook cell. **[A]** is an inference not fully provable from static
inspection (e.g. runtime data volume, which completion mode users actually use).

---

## 0. Workbook decode (verified formulas)

### Monthly sheets (`Jan`…`Dec`) — the realised ledger
Header block (rows 1–8) and the per-trade grid (row 9 headers, rows 10+ data).

**Per-trade columns (rows 10+)** — **[V]** from `Jan!A8:T10`:

| Col | Header | Formula (row 10) | Meaning |
|---|---|---|---|
| A | Date | — (manual) | trade date |
| B | Balance | `25000` (manual, first row only) | **balance before the trade** |
| C | % Invest | manual | risk / invest percentage |
| D | £ Invest | `=B/100*C` | amount invested (= balance × invest%) |
| E | Max Stop | `=IF(F=$A$6,(D/$A$6),D/F)` | stop distance from bid size |
| F | Bid | manual | **position / bid size** |
| G | P&L | manual | **money result of the trade** |
| H | Win | `=IF(G>0,1,0)` | win flag |
| I | Loss | `=IF(G<0,1,0)` | loss flag (G=0 ⇒ neither = breakeven) |
| J | Change | `=G/B` | per-trade ROI (P&L ÷ balance-before) |
| K | R/R | `=G/D` | P&L ÷ amount invested |
| L | Points | `=G/F` | **pips/points** (P&L ÷ bid size) |
| M | Target | `=D/100*$D$7` | target £ (D7 = invest-target %) |
| N | Costs | manual | **fees/costs** |
| O | Wage | manual | **wage / profit withdrawal** |
| P | Market | manual | **instrument** |
| Q | Trades | manual | **number of split positions** |
| R | L/S | manual | **long / short** |
| S | Mood | manual | **mood** |
| T | Why | manual | **trade reason / notes** |

**Monthly header aggregates** — **[V]** `Jan!A3:F8`:
- `A3 =Summary!A2` — month **opening balance** (chained from prior month).
- `B3 =A3+C3-F6` — **current balance = opening + P&L − wages**. *(wages reduce the balance.)*
- `C3 =SUM(G10:G…)-B7`, `B7=N8=SUM(N…)` — **net P&L = Σ trade P&L − Σ costs**.
  ⇒ In the workbook, per-trade `G` is **gross of costs**; costs are subtracted **once, in aggregate**.
- `D3 =C3/A3` — **month ROI** (net P&L ÷ opening balance).
- `E3 =H8+I8` — total positions (wins + losses; breakeven excluded).
- `F3 =IFERROR(H8/E3,0)` — **win rate = wins / (wins+losses)**.
- `D6 =C3/E3` — "Ave Win" (actually mean P&L per position, **mislabelled**).
- `E6 =L8/E3` — average pips per position; `L8 =SUM(L…)` total pips.
- `F6 =O8=SUM(O…)` — **total wages withdrawn**.
- `M1/I2` — Drawdown block is **manual** (`Summary!I2 = 0`), not derived.

### Summary sheet — yearly/monthly rollup **[V]** `Summary!A1:I15`
- `A2` year start (manual). `B2 =Dec!B3` year end. `C2 =B2-A2+E2` (**+wages added back**),
  `E2 =Σ monthly wages`, `D2 =C2/A2` growth, `F2 =Σ pips`, `I2` drawdown (manual).
- Each month row pulls `X!B3` (end bal), `X!L8` (pips), `X!F6` (wage), `X!F3` (winrate).
- **Every Summary figure is a formula over the monthly sheets** — nothing is re-keyed.

### `Wage Maker` & `Compound Plan` — **planning only** **[V]**
- `Wage Maker`: given a yearly wage goal, derives pips/day/week needed at each £/pip
  (`B3=C3/5`, `B5=$B$3/A5`, `M5=$H$1/H5`…). Pure forward calculator.
- `Compound Plan`: daily bid growth `D5=SUM(D4/100)*(100+$E$2)`, projected running balance
  `M5=SUM(F5:K5)+M4`. Pure projection.
- **No realised trade data.** These must stay out of realised performance (§ group D).

**Workbook partition:**
- **A. Realised account/trade data:** monthly grid cols A–T; header opening/closing balances, wages, costs.
- **B. Derived performance:** H/I/J/K/L per row; C3/D3/E3/F3/D6/E6/L8; all Summary cells.
- **C. Manual goals/rules/notes:** `Jan!G` rules block, `O`/`Q`/`S` targets, "NOTES".
- **D. Forecasting:** `Wage Maker`, `Compound Plan`.

> **Definitional trap [V]:** workbook col K is labelled **R/R** but computes
> `P&L ÷ £ invested` (capital deployed), **not** a true R-multiple (`P&L ÷ money risked
> to stop`). Issue #14 and the app both mean *true* R (`net_pnl / amount_risked`).
> Do **not** import col K as R — it is ROI-on-capital. Verify the real risk instead.

---

## 1. Current-state data-flow diagram

```mermaid
flowchart TD
  subgraph Engine[Prime Bias analysis]
    IN[inputs: 7 TF × 4 indicators] --> BE[calculateBias  lib/biasEngine.js]
    ST[user settings: weights, thresholds, 3 toggles] -. options .-> BE
    BE --> RES[results: grade, score, deep/dd/now, timeframes, buy/sellScore]
  end

  RES --> AS[autoSave → bias_analysis row  0002/0003]
  RES --> CTM[CompleteTradeModal.jsx  quick|detailed]
  CTM --> CT[completeTrade  lib/tradeCompletion.js]
  CTM --> MF[MoneyFields: amount, fees, risk, account]

  CT -->|computeTradeFinancials| FIN[gross_pnl, fees, net_pnl, amount_risked]
  CT -->|persist snapshot subset| DB[(completed_trade)]
  MF --> DB

  ACC[ensureDefaultAccount  lib/accountData.js] --> TA[(trading_account)]
  SET[Settings page] --> TXN[(account_transaction: deposit/withdrawal/adjustment)]

  DB --> JS[JournalStats.jsx]
  TXN --> JS
  TA --> JS
  DB -->|withDerivedFinancials shim| JS
  JS -->|computeStats, grade/asset| SUM[journalStats.js pure fns]
  JS -->|accountBalance, periodRoi, buildEquitySeries| LED[accounts.js pure fns]
  SUM --> UI1[PerformanceSummary + GradeAssetBreakdown]
  LED --> UI1

  subgraph Parallel[SEPARATE manual system — not derived]
    MJF[JournalForm.jsx] --> MJ[(monthly_journal)]
    MJ --> MC[MonthCard.jsx]
    MJ --> YSB[YearSummaryBar.jsx]
  end

  DB -. TradeHistory 'Add result' edit .-> DB
  TJE[(trade_journal_entry)] --> TJT[TradeJournalTab.jsx]
```

**Two disconnected worlds today [V]:**
1. **Ledger world** (`completed_trade` + `trading_account` + `account_transaction`
   → `accounts.js`/`journalStats.js` → Performance page). Derived, tested.
2. **Manual monthly world** (`monthly_journal` → `JournalForm`/`MonthCard`/
   `YearSummaryBar`). Hand-keyed totals, mirrors the workbook, **feeds nothing derived**
   except seeding a brand-new account's starting balance (`resolveStartingBalance`).

---

## 2. Workbook → app mapping

Status legend: ✅ exists & correct · 🟡 exists, incomplete · 🔴 exists, incorrect ·
⛔ missing · 🚫 should not import.

| Workbook field | Status | Current location | Proposed source of truth |
|---|---|---|---|
| Starting balance | ✅ | `trading_account.starting_balance` (0004); seed via `resolveStartingBalance` | `trading_account.starting_balance` |
| Balance before trade (`B`) | 🟡 | derived `balanceBefore()` `accounts.js:139`; **not stored per trade** | derive from ledger (don't store) |
| Closing/current balance | ✅ | `accountBalance()` `accounts.js:123` | derived from ledger |
| Gross P&L (`G` / `C3`) | 🟡 | `completed_trade.gross_pnl` (0004); modal captures **net-style** amount, gross=amount | `completed_trade.gross_pnl` |
| Fees / costs (`N`) | 🟡 | `completed_trade.fees` (0004) **and** `account_transaction.adjustment` — two homes, no rule | `completed_trade.fees` for per-trade; adjustment only for non-trade costs |
| Net P&L | ✅ | `net_pnl = gross − fees` `tradeCompletion.js:106`; `computeStats.netPnl` | `completed_trade.net_pnl` |
| Deposits | ✅ | `account_transaction type='deposit'` | `account_transaction` |
| Withdrawals | ✅ | `account_transaction type='withdrawal'` | `account_transaction` |
| **Wages / profit withdrawals** (`O`) | 🔴 | no dedicated type — collapses into `withdrawal`, so wages ≡ capital withdrawals | new `account_transaction type='wage_withdrawal'` |
| Amount risked (`D` sort of) | 🟡 | `completed_trade.amount_risked`; optional, rarely captured **[A]** | `completed_trade.amount_risked` |
| Risk % (`C`) | ⛔ | not stored, not derived | derive `net_pnl?`/risk vs balance-before at read time |
| Position / bid size (`F`) | ⛔ | **no column on `completed_trade`** | new `completed_trade.position_size` |
| Pips / points (`L`) | ⛔ | not stored; no fallback computed | new `completed_trade.points_pips` (+ labelled `net_pnl/position_size` fallback) |
| R multiple (`K`, true R) | 🟡 | `rMultiple()` `journalStats.js:84` = `net_pnl/amount_risked` (correct defn) | derived; needs `amount_risked` |
| ROI / growth (`J`,`D3`,`D2`) | ✅ | `periodRoi()` `accounts.js:166` | derived |
| Wins / losses / breakeven | ✅ | `completed_trade.result`; `computeStats` | derived |
| Win rate (`F3`) | ✅ | `computeStats.winRate` (directional only) | derived |
| Average win | 🟡 | not separately computed (workbook's own is mislabelled) | derive: mean(net_pnl>0) |
| Average loss | ⛔ | not computed | derive: mean(net_pnl<0) |
| Expectancy | ⛔ | not computed | derive |
| Profit factor | ✅ | `computeStats.profitFactor` | derived |
| Equity curve | ✅ | `buildEquitySeries()` `accounts.js:192` | derived |
| Maximum drawdown (`I2`) | ⛔ | **manual in workbook; not computed in app** | derive from equity curve |
| Instrument (`P`) | ✅ | `completed_trade.instrument` | `completed_trade.instrument` |
| Long / short (`R`) | 🟡 | `completed_trade.direction` = engine BUY/SELL, **not a user L/S field** | keep engine dir; optionally allow explicit L/S |
| Split positions (`Q`) | ⛔ | not stored | new `completed_trade.split_count` |
| Mood (`S`) | ⛔ | not stored (only free `notes`) | new `completed_trade.mood` |
| Trade reason / notes (`T`) | 🟡 | `completed_trade.notes` (detailed modal only) | `completed_trade.notes` / `reason_tags` |
| Monthly totals | 🔴 | `monthly_journal.*` **manually re-entered** | derived rollup from trades+txns |
| Yearly totals | 🔴 | `YearSummaryBar` sums manual monthly rows | derived rollup |
| — engine snapshot (grade/score/deep/dd/now) | 🟡 | stored on `completed_trade` (0001) **but partial & not reproducible** | see § Engine snapshot |
| Wage Maker / Compound Plan | 🚫 | — | separate optional planner (Phase 10) |

---

## Engine snapshot audit **[V]**

At completion, `tradeCompletion.js:140-179` stores onto `completed_trade`:
`direction, grade, trade_status, trade_action, score(=winningScore), target,
alignment, deep_trend, deep_strength, dd_bias, dd_strength, now_bias, now_strength,
extra_check_h1, extra_check_m15, inputs_snapshot`.

**Present:** direction, grade (effective/capped), score, deep/dd/now dir+strength,
alignment, extra-check, raw indicator inputs, analysis timestamp (`created_at`).

**Missing for an immutable, reproducible snapshot:**
- ⛔ **engine version** — none exists anywhere (`grep engine_version` → 0 hits).
- ⛔ **settings/config version** — `calculateBias` takes `options` (`scoreWeights`,
  `thresholds`, `useM5Override`, `downgradeOnNowWeakness`, `requireAlignmentForA`,
  `biasEngine.js:186-192`) from **mutable user settings**. These are **not stored** with
  the trade. ⇒ **the same inputs can produce a different grade/score after the user
  changes Settings, and the historical trade cannot be reproduced.** **Critical.**
- ⛔ **raw grade before the cap** — `rawGrade` computed `biasEngine.js:261` then
  overwritten to `effectiveGrade`; only the capped grade is stored.
- ⛔ **buyScore / sellScore totals** — computed `biasEngine.js:228-234`, never persisted.
- 🟡 **per-timeframe results** — only raw `inputs_snapshot` is stored; the derived
  `timeframes[key].{result,total,bias}` are recomputed, so they drift if weights change.
- ⛔ **extra/red-light-green-light result** — `lightsActive` computed, not stored (only
  the raw `extra_check_h1/m15` inputs are).

**Conclusion:** the snapshot is a *subset of outputs computed under settings that are
not captured*. Historical trades are **not** protected from re-grading. Issue #14's
requirement — "historical trades must never be recalculated using later engine
settings" — is **not met today**. This is the single most important correctness gap.

---

## 3. Data-integrity risks (ranked)

| # | Risk | Sev | Evidence |
|---|---|---|---|
| R1 | **Historical trades silently re-graded** — engine settings not snapshotted; no engine version | **Critical** | `biasEngine.js:186-192` options from mutable settings; nothing stored on trade |
| R2 | **Wages indistinguishable from capital withdrawals** — no `wage_withdrawal` type; both hit balance identically, so "wages withdrawn" cannot be reported and ROI/withdrawal semantics blur | **Critical** | `accounts.js:71-80` only deposit/withdrawal/adjustment; workbook needs `O` separate |
| R3 | **Fee double-count** — a cost can live in `completed_trade.fees` *and* an `adjustment` txn; both reduce balance, no dedupe/rule | **High** | `tradeCompletion.js:106` + `accounts.js:77`; issue explicitly flags |
| R4 | **Two parallel P&L systems disagree** — manual `monthly_journal` totals vs derived `completed_trade` stats; nothing reconciles them | **High** | `JournalForm.jsx` writes totals; `JournalStats.jsx` derives independently |
| R5 | **Orphan trades (`account_id=NULL`) counted only with exactly one account** — with ≥2 accounts, legacy trades vanish from every account view but appear under "All"; balance vs per-account totals diverge | **High** | `tradeInAccount` `accounts.js:58-63`; `JournalStats.jsx:41` |
| R6 | **Legacy `pnl` vs `net_pnl` reconciled at read time only** — `withDerivedFinancials` shims in memory; a writer that sets `net_pnl` but not `pnl` (or vice-versa) desyncs; `TradeHistory` add-result writes both, completion writes both, but no DB constraint | **Medium** | `accounts.js:41-48`; `tradeCompletion.js:175`; `TradeHistory.jsx:258` |
| R7 | **"All accounts" sums starting balances across accounts but mixes currency guard only on >1 currency** — same-currency multi-account ROI uses a synthetic combined account whose opening balance is Σstart; fine, but equity series merges trades whose `balanceBefore` origins differ | **Medium** | `JournalStats.jsx:54-100` |
| R8 | **Missing money data is invisible in aggregates, not flagged per-breakdown** — grade/asset breakdowns use win/loss counts, so an all-incomplete grade shows 0% not "no data" | **Medium** | `computeGradeBreakdown` `journalStats.js:206` |
| R9 | **Drawdown not computed at all** — issue wants peak-to-trough from equity; today absent | **Medium** | no `maxDrawdown` in `computeStats`/`accounts.js` |
| R10 | **Edited completed trade re-keys analysis id but not financials history** — editing a completed analysis starts a *new* analysis (`resolveAnalysisIdForEdit`), yet the old `completed_trade` row persists unless manually archived → possible double count if re-completed | **Medium** | `tradeCompletion.js:202-209`; `TradeHistory` restore→complete |
| R11 | **`monthly_journal.winrate` stored as 0–1 but `pnl_percent` as %** — mixed unit conventions invite mis-render if ever merged with derived stats | **Low** | `JournalForm.jsx:128` (0–1) vs `:116` (%) |
| R12 | **Same-timestamp ordering undefined** — merged trade/txn events sort by epoch ms only; ties (deposit then trade same instant) order is input-dependent | **Low** | `buildEquitySeries` `accounts.js:193-196` |

---

## 4. Schema changes required (do **not** apply yet)

All additive/nullable, matching the existing "re-runnable `IF NOT EXISTS`" migration style.

**New migration `0005_engine_snapshot.sql`**
- `completed_trade.engine_version text` — app-owned constant, bumped on any engine rule change.
- `completed_trade.engine_settings jsonb` — the exact `options` used (`scoreWeights`,
  `thresholds`, 3 toggles) so the grade is reproducible.
- `completed_trade.raw_grade text` — grade before the C-cap.
- `completed_trade.buy_score numeric`, `sell_score numeric`.
- `completed_trade.timeframes_snapshot jsonb` — per-TF `{result,total,bias}`.
- `completed_trade.lights_result text` (or `smallint`) — extra-check green/red/off.

**New migration `0006_trade_ledger_fields.sql`**
- `completed_trade.position_size numeric` (bid/lot).
- `completed_trade.points_pips numeric` (explicit; null ⇒ show labelled fallback).
- `completed_trade.split_count integer`.
- `completed_trade.mood text`.
- `completed_trade.reason_tags jsonb` (or reuse `notes`).
- Optional `completed_trade.trade_direction text CHECK (in ('long','short'))` if an
  explicit L/S distinct from engine BUY/SELL is wanted (issue treats them as equal — **[A]** default: reuse `direction`).

**New migration `0007_wage_transaction_type.sql`**
- Extend `account_transaction.type` CHECK to include `'wage_withdrawal'` (and keep
  `deposit/withdrawal/adjustment`). Requires drop+recreate of the CHECK constraint.
- Index unchanged (`account_transaction_account_idx` already covers `(user_id,account_id,occurred_at)`).

**Constraints/indexes**
- No new unique keys required. Consider a **CHECK** `net_pnl = gross_pnl - fees` is
  **not** safe (breakeven/nulls) — enforce in app, not DB.
- Keep `pnl` column; do **not** drop (legacy readers `MonthCard`/`YearSummaryBar` read
  `monthly_journal.pnl`, unrelated; `completed_trade.pnl` still mirrored).

**Explicitly not changed now:** `monthly_journal` (Phase 8 turns it into derived
rollups — schema stays, writers change), no drops, no type changes.

---

## 5. Migration & compatibility plan

- **Legacy `completed_trade` rows** (pre-0004): `net_pnl` null → `withDerivedFinancials`
  reads `pnl` at runtime (`accounts.js:41`). Keep this shim. New snapshot columns null →
  treat as `engine_version = 'legacy-pre-snapshot'` at read time; **never** recompute
  their grade. Add a read-time `normalizeTrade()` that stamps a synthetic
  `engine_version` when absent so downstream code can branch safely.
- **Orphan trades (`account_id NULL`)**: keep current sole-account attribution but make
  it explicit — a one-time app-side backfill (idempotent, only when exactly one active
  account) that sets `account_id`. Surface a "Assign account" action when ≥2 accounts
  (fixes R5) rather than silently hiding.
- **`pnl`↔`net_pnl`**: continue writing both on every path (completion, add-result). Add
  a test asserting the invariant so no future writer desyncs them (R6).
- **Wages**: existing `withdrawal` rows stay valid; only *new* wage entries use
  `wage_withdrawal`. Reporting treats both `withdrawal`+`wage_withdrawal` as cash-out for
  balance, but only `wage_withdrawal` for the "wages withdrawn" stat.
- **`monthly_journal`**: remains readable and editable for **goals/rules/notes**; its
  numeric totals become **display-only derived** (Phase 8). No data destroyed; the manual
  numbers are simply superseded by rollups and can be hidden behind a "legacy" toggle.
- **Workbook**: never synced; import is a later, preview-gated one-shot (Phase 9).

---

## 6. Implementation phases (PR-sized)

1. **Lock definitions & source-of-truth** (docs + this audit accepted). No code.
2. **Immutable engine snapshot + versioning** — `0005`; store `engine_version`,
   `engine_settings`, `raw_grade`, `buy/sell_score`, `timeframes_snapshot`,
   `lights_result`; `normalizeTrade()` read-time shim + tests. *(addresses R1)*
3. **Schema + compatibility for ledger fields** — `0006`, `0007`; `position_size`,
   `points_pips`, `split_count`, `mood`, `wage_withdrawal` type; read shims. *(R2 groundwork)*
4. **Trade completion + edit flow** — capture new fields in `CompleteTradeModal`
   (position size, pips, split, mood, reason); write snapshot; edit path guards against
   duplicate rows. Live previews (net P&L, R, ROI, post-trade balance). *(R10)*
5. **Account transactions, wages & balance** — wage type in Settings; balance/ROI treat
   wages separately; fee-vs-adjustment dedupe rule. *(R2, R3)*
6. **Tested ledger & performance functions** — add `averageWin`, `averageLoss`,
   `expectancy`, `maxDrawdown`, `wagesWithdrawn`, `totalPips/avgPips`, risk% derivation;
   pure + unit-tested. *(R9)*
7. **Performance stats & engine breakdowns** — extend Performance UI: balance, gross/net,
   ROI, wages, drawdown, pips, avg win/loss, expectancy, R; breakdowns by grade/asset/
   direction/deep-dd-now strength/alignment/score band/hour-day-month/mood; small-sample flags. *(R8)*
8. **Derived monthly/yearly rollups** — replace manual `monthly_journal` totals with
   rollups from trades+txns; keep goals/rules/notes editable. *(R4)*
9. **Workbook import preview** — parse monthly rows, dedupe, show unmapped, require
   account/currency, never import formula totals, map `G→gross`, `N→fees`, `O→wage_withdrawal`,
   `F→position_size`, `L→points_pips`, `P→instrument`, `R→direction`, `S→mood`, `T→notes`.
10. **Wage Maker / Compound Plan planner** — separate optional tool, no realised data.

Order matches issue #14's suggested order and puts the **snapshot (R1)** before any
capture change so no new rows are baked in without a version.

---

## 7. Test matrix (required before "safe")

Pure-function unit tests (extend `accounts.test.js`, `journalStats.test.js`, add
`ledgerStats.test.js`):

- **Outcomes:** win / loss / breakeven contribution to netPnl, win-rate denominator, gross split.
- **Missing P&L:** win/loss with `net_pnl=null` counts in total & win-rate but not money.
- **Missing risk:** R null; avgR only over `amount_risked>0`.
- **Fees:** `net=gross−fees`; fee on trade **and** adjustment txn → asserts single count (R3 rule).
- **Deposits / withdrawals:** balance moves, ROI numerator unaffected.
- **Wages:** `wage_withdrawal` reduces balance, excluded from trading P&L, summed into "wages withdrawn".
- **Split trades:** `split_count` aggregation; pips/R per split vs per trade.
- **Edited trade:** editing a completed trade does not create a duplicate ledger row (R10).
- **Deleted trade:** removal updates balance/stats/equity/drawdown.
- **Mixed currencies:** monetary tiles guarded; non-monetary stats still compute.
- **ROI across deposits & withdrawals:** opening-balance timing; deposit in-period not in numerator.
- **Max drawdown:** peak-to-trough from chronological equity incl. interim cashflows; all-up curve ⇒ 0.
- **Legacy records:** `pnl`-only trade readable; null snapshot → not re-graded, stamped `legacy` version.
- **Engine version changes:** trade saved under settings A keeps grade after settings→B (R1 regression).
- **Breakdowns:** by grade, score band, asset, direction, deep/dd/now strength, alignment; small-sample flag.
- **Ordering:** same-timestamp deposit-then-trade deterministic (R12).

Component tests: completion modal writes snapshot + new fields; Performance renders new
tiles/empty states; monthly rollup shows derived (not manual) numbers.

---

## 8. Recommended FIRST implementation PR

**Phase 2 only — immutable engine snapshot + versioning.** It is the prerequisite for
everything else and is self-contained, additive, and testable without UI redesign.

**Files:**
1. `supabase/migrations/0005_engine_snapshot.sql` *(new)* — add nullable
   `engine_version text`, `engine_settings jsonb`, `raw_grade text`, `buy_score numeric`,
   `sell_score numeric`, `timeframes_snapshot jsonb`, `lights_result text` to
   `completed_trade`; re-runnable `IF NOT EXISTS`; comment block like `0004`.
2. `src/lib/biasEngine.js` — export a `const ENGINE_VERSION = '<yyyy-mm-dd>-excel'`
   and include `rawGrade`, `buyScore`, `sellScore`, `lightsActive`, `timeframes` in the
   `calculateBias` return **[V already computed, just surface + stamp version]**; add
   `engineSnapshot(results, options)` helper returning the exact fields to persist.
3. `src/lib/tradeCompletion.js` — in `completeTrade`, persist `engine_version`,
   `engine_settings` (the resolved `options`), `raw_grade`, `buy_score`, `sell_score`,
   `timeframes_snapshot`, `lights_result`. Requires passing engine `options`/settings into
   completion (thread from the analysis).
4. `src/lib/accounts.js` (or new `src/lib/tradeCompat.js`) — `normalizeTrade(trade)`
   that stamps `engine_version = 'legacy-pre-snapshot'` when absent and never recomputes.
5. `src/lib/tradeCompletion.test.js` — assert snapshot persisted; grade stable across a
   settings change; legacy row stamped, not recomputed.

**Explicitly out of this PR:** no UI changes, no new capture fields, no wage type, no
monthly-rollup work, no importer. Ledger maths untouched.

---

## Test run (existing suite)

`npm ci` (deps were absent) then `npm test` → **11 files, 123 tests, all passing**
(`accounts` 27, `journalStats` incl. via file, `tradeCompletion` 16, `biasEngine`,
`biasSync` 15, `autoSave` 8, `base44Client` 3, `safeUrl` 5, `JournalStats.test.jsx` 2,
`TradeHistory.test.jsx` 2, `Dashboard.test.jsx` 2). No failures. Only React-Router v7
future-flag warnings (benign). **[V]**

---

## GO / NO-GO

**GO — with a hard sequencing condition.**

The existing ledger foundation (`accounts.js`, `journalStats.js`, `completed_trade` +
`trading_account` + `account_transaction`, 123 green tests) is sound and correctly avoids
double-counting deposits/withdrawals in P&L. Issue #14 extends this architecture rather
than replacing it, which is the right call.

**Condition:** the **first PR must be Phase 2 (engine snapshot + versioning)**. Until
trades store their engine version and settings, every new capture feature bakes
potentially-incorrect, non-reproducible grades into permanent records (R1, Critical).
Do **not** start capture-UX or wage/monthly work ahead of it. R2 (wage type) and R3 (fee
double-count rule) should land immediately after, before the workbook importer.

No blocker prevents starting; proceed on the phased order above.
