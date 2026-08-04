# Account-led financial model — audit, design & plan

This document redesigns the money model behind **Trade History** and
**Performance / Stats**. The previous model only recorded a win/loss flag, so
Net P/L, ROI, profit factor, account balance and the equity curve could not be
derived, and the "Avg R:R" tile showed a meaningless number.

## 1. Existing schema audit

| Table | Role today | Financial gaps |
| --- | --- | --- |
| `completed_trade` | Authoritative trade record. `result` = `win\|loss\|breakeven\|not_taken`, plus a single nullable `pnl`. | No account, no fees, no gross/net split, no amount risked. `pnl` is only written by the *detailed* completion modal, and the default mode is *quick* → almost every trade has `pnl = NULL`, so all money stats render `—`. |
| `monthly_journal` | Manual monthly balances (`start_balance`, `end_balance`, `pnl`, …). | The only place a "starting balance" lives. `resolveStartingBalance()` scrapes the earliest `start_balance`, else hardcodes `10000`. Not an account ledger. |
| `bias_analysis`, `trade_journal_entry` | Analysis snapshots / journaling. | Not financial. |

**The "Avg R:R 173.9 planned" bug.** `computeStats` averaged `trade.target`.
`target` is **not** an R:R ratio — it is `calculateTarget()` from the bias
engine (`(atr * TARGET_WEIGHTS[grade]) / TARGET_DIVISOR`, `biasEngine.js`), an
ATR-derived price distance. Averaging those yields nonsense. `rMultiple()`
likewise faked R as "win = planned target, loss = −1", i.e. it never used real
risk. Both are removed; real R needs `amountRisked`.

**Data layer.** `src/api/base44Client.js` maps entity names → tables and exposes
`list/filter/create/update/upsert/delete` with per-user RLS
(`auth.uid() = user_id`). New entities are added by extending the `TABLES` map.

## 2. Proposed database changes & migration (`0004_financial_model.sql`)

### New table `trading_account`
`id, user_id, created_date, updated_date, name, currency (default 'USD'),
starting_balance (default 0), created_at, archived_at (nullable)`

### New table `account_transaction`
`id, user_id, created_date, updated_date, account_id → trading_account,
type CHECK IN ('deposit','withdrawal','adjustment'), amount, occurred_at, note`

- `deposit` / `withdrawal` store a **positive magnitude**; the sign is applied
  by type. `adjustment` stores a **signed** amount.

### Alter `completed_trade`
Add: `account_id → trading_account (ON DELETE SET NULL)`, `gross_pnl`, `fees`,
`net_pnl`, `amount_risked` — all nullable.

- **`net_pnl` is the authoritative realised P/L.** `net_pnl IS NULL` means the
  trade's *financial* result is **incomplete** (breakeven stores `net_pnl = 0`,
  which is complete — so `NULL` vs `0` is meaningful and we need no extra flag).
- `net_pnl = gross_pnl − fees`, computed in the app at write time.
- Legacy `pnl` is left in place and kept in sync (`pnl = net_pnl`) so nothing
  that still reads it breaks; new code reads `net_pnl`.

### Migration & backfill
The migration is additive/re-runnable SQL (`IF NOT EXISTS`, run manually by the
single user like the others). Per-user rows can't be seeded in that SQL, so the
**app** owns idempotent backfill (`lib/accounts.js`):

- `ensureDefaultAccount()` — if the user has no non-archived account, create
  **"Main Account"** using the resolved starting balance (earliest
  `monthly_journal.start_balance`, else `10000`).
- Existing `completed_trade` rows: `net_pnl` is backfilled from `pnl` where
  `pnl` is not null; rows with `pnl = NULL` stay financially incomplete and
  surface an **"Add result"** action. Their `outcome` (`result`) is preserved
  and never assigned an invented amount.
- Orphan trades (`account_id = NULL`) are attached to the default account only
  when the user has exactly one account (safe, non-destructive); otherwise they
  are shown under "All accounts" until assigned.

## 3. Calculation definitions (`lib/accounts.js`, `lib/journalStats.js`)

All pure/side-effect-free and unit-tested. A trade **counts financially** only
when `net_pnl != null`.

- **Realised net P/L (period)** = `Σ net_pnl` over financially-complete trades in
  range. Deposits/withdrawals are **never** trading profit.
- **Account balance (all-time)** =
  `starting_balance + Σdeposits − Σwithdrawals + Σ(net_pnl complete) + Σadjustments`.
- **Balance before `t`** = same sum restricted to events strictly before `t`.
  Used as the ROI opening balance and the equity-curve origin.
- **Win rate** = `wins / (wins + losses)` over **directional** (win/loss) trades;
  breakeven and not-taken excluded from the denominator.
- **Gross profit** = `Σ net_pnl where net_pnl > 0`;
  **Gross loss** = `|Σ net_pnl where net_pnl < 0|`.
- **Profit factor** = `grossProfit / grossLoss`. `grossLoss = 0`:
  `Infinity` if there are winning dollars (rendered "No losing trades"), else
  `null`.
- **Total trades** = count in range (all outcomes).
- **Current streak / best winning streak** — over directional trades in
  chronological order.
- **Average R multiple** = `mean(net_pnl / amount_risked)` over trades where
  `amount_risked > 0`. If none, `null` → "Not enough risk data".
- **ROI (range)** = `periodNetPnl / openingBalance × 100`, where `openingBalance`
  = account balance immediately **before the first event in the period**. If
  `openingBalance <= 0`, ROI is `null` (undefined).
- **Equity curve** = chronological account balance after each completed trade:
  start at `balanceBefore(window)` (so prior deposits/withdrawals are included),
  then walk merged trade + transaction events, emitting a point at each trade
  carrying the running true balance.

### Multi-currency / filters
Filters: **date range**, **account**, and **all compatible accounts** (all
accounts sharing one currency). Monetary totals are never summed across
currencies. If "All accounts" spans multiple currencies, monetary tiles show a
"Mixed currencies" guard while currency-independent stats (win rate, streaks,
total trades) still compute.

## 4. Affected screens / components

- `components/bias/CompleteTradeModal.jsx` + `lib/tradeCompletion.js` — capture
  win/loss/BE + **amount made/lost**, optional fees, optional amount risked;
  store `gross_pnl/fees/net_pnl/amount_risked/account_id`. Loss stored negative
  without the user typing a minus.
- `pages/JournalStats.jsx`, `components/journal/PerformanceSummary.jsx`,
  `components/journal/EquityCurve.jsx` — new model, empty states, account + date
  filters; **Avg R:R "planned" removed**, replaced by **Avg R** (risk-based).
- `pages/TradeHistory.jsx` — show net P/L + account; **"Add result"** for
  financially incomplete trades.
- `pages/Settings.jsx` — manage accounts (create / archive) and transactions
  (deposit / withdrawal / adjustment).
- `pages/Dashboard.jsx` — pass the active account into completion.

## 5. Edge cases

- No monetary P/L anywhere → tiles show "Add trade results to unlock this stat."
- No losing trades → profit factor "No losing trades" (∞ with explanation).
- No `amount_risked` recorded → Avg R "Not enough risk data".
- Break-even trade → `net_pnl = 0`, counts as complete, excluded from win-rate
  denominator, contributes 0 to gross profit/loss.
- Historic win/loss trade with no amount → stays visible, outcome preserved,
  "Add result" action; excluded from money stats until filled.
- Deposit/withdrawal must not move Net P/L or ROI numerator.
- ROI opening balance `<= 0` → ROI undefined (guarded).
- Multiple accounts, different currencies → never combined into one total.
- Adjustment can be negative; balance handles signed amounts.
- Withdrawal larger than balance → balance may go negative (allowed; surfaced).

## 6. Test plan

Unit (Vitest, pure logic):
- balance = start + deposits − withdrawals + net P/L + adjustments.
- `balanceBefore(t)` excludes events at/after `t`.
- ROI uses period opening balance; deposits/withdrawals excluded from P/L.
- fees reduce net P/L (`net = gross − fees`); loss stored negative.
- break-even: net 0, complete, not in win-rate denominator.
- no-loss period: profit factor ∞/"No losing trades".
- historic trade without P/L: excluded from money stats, still counted in total.
- average R only over trades with `amount_risked`.
- multiple accounts: per-account isolation; mixed-currency guard.
- equity curve: running balance folds interim deposits/withdrawals.

Component (Testing Library):
- Completion modal: loss input positive → stored negative; save writes
  net_pnl/fees/risk/account.
- Stats page renders empty states instead of fake values; no "173.9 planned".
- Trade History shows "Add result" on incomplete trades.

Implementation proceeds in the stages listed in commits on this branch.

## 7. Authoritative source-of-truth rules (Wage Maker integration, phase 3)

These rules fix where each realised-money figure lives so nothing is ever counted
twice. They are enforced by the pure helpers in `lib/accounts.js` and
`lib/tradeCompat.js`; the schema for them lands in migrations `0006`/`0007`.

### Per-trade costs
Per-trade broker fees, commissions and direct costs belong on
**`completed_trade.fees`** and are subtracted there (`net_pnl = gross_pnl − fees`,
`lib/tradeCompletion.js`).

### Account adjustments
**`account_transaction.type = 'adjustment'`** is only for non-trade corrections or
account-level adjustments (reconciliation, a manual balance fix). **A cost must
never be recorded both as a trade fee and as an account adjustment** — pick one:
per-trade cost → `completed_trade.fees`; account-level correction → `adjustment`.

### Wages
Profit taken out as personal wages belongs in
**`account_transaction.type = 'wage_withdrawal'`** (migration `0007`). A wage
withdrawal **reduces account cash balance** (it moves cash exactly like an
ordinary withdrawal, `txnDelta`) but **does not reduce realised trading P/L** —
gross/net P/L, win rate, profit factor, expectancy and R multiple are computed
from `completed_trade` rows only and never see transactions. Wages are a distinct
type purely so they can be reported separately (`wagesWithdrawn`); old
`withdrawal` rows are **never** reclassified as wages.

### Position size and points
- **`completed_trade.position_size`** stores the actual bid / lot / point-value
  input used for the trade.
- **`completed_trade.points_pips`** stores the explicitly recorded movement
  result (may be positive, negative or zero).
- `points_pips` is **never** auto-populated from `net_pnl / position_size` during
  migration. A future UI may show that computed value only as a clearly-labelled
  fallback when no explicit `points_pips` was recorded.

### Executed direction
The existing `completed_trade.direction` column stores the **Prime Bias engine
recommendation** (`results.mainDirection`, `BUY`/`SELL`). The new nullable
**`completed_trade.trade_direction`** (`'long'`/`'short'`, migration `0006`)
records the direction **actually taken**. Legacy rows leave it `null`; the
executed side is not guessed from the engine recommendation.

### Risk percentage — derived, not stored (decision + trade-off)
There is intentionally **no** stored `risk_pct` column. The preferred value is
derived: `amount_risked / balance_before_trade × 100`, where
`balance_before_trade` comes from the ledger (`balanceBefore`).

- **Trade-off.** Deriving keeps a single source of truth, but the derived risk %
  of a *historical* trade can shift if earlier ledger records are later edited
  (a corrected earlier deposit changes `balance_before_trade`). Snapshotting
  `risk_pct` (or `balance_before_trade`) at completion would freeze it, at the
  cost of a second, potentially-diverging stored figure.
- **Decision for this phase.** Keep it derived. Snapshotting the balance-before
  is a wider architectural change (it would belong with the engine-snapshot
  approach) and is **out of scope here** — flagged for a future phase rather than
  introduced silently.

### Compatibility guarantees
`normalizeTrade` (`lib/tradeCompat.js`) exposes read-time defaults for rows that
predate these columns — `position_size: null`, `points_pips: null`,
`split_count: 1`, `mood: null`, `reason_tags: []`, `trade_direction: null`,
`engine_version: 'legacy-pre-snapshot'` — **without writing them back**. Invalid
values normalise to `null`/safe defaults, never to `0`. `isWageWithdrawal`
identifies wages solely by the explicit new type.
