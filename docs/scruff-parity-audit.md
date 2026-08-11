# Scruff parity audit — Winston cases + uploaded workbook

Source basis:

1. Winston's supplied screenshots from the current Scruff sheet.
2. Prime Bias screenshots made from the same indicator marks.
3. The uploaded `Prime Bias.xlsx` workbook, inspected cell-by-cell on the `Bias Tool` sheet.
4. Current `src/lib/biasEngine.js`.

The uploaded workbook is extremely useful as the formula baseline, but it is **not the same revision as the Scruff sheet Winston is testing**. This is now proven rather than suspected: the workbook still labels A as `Very Good` and B as `Good`, while Winston's current Scruff screenshots show A = `Good` and B = `Fair`; the workbook also gives GBP/JPY Trend = SELL / B / Scalp for Winston's supplied marks, while the current Scruff screenshot gives Trend = BUY / C / No / Trend Off.

Therefore parity policy is:

- Use the uploaded workbook formula exactly where current Scruff evidence does not contradict it.
- Where Winston's current Scruff screenshot proves a newer result, the current Scruff result wins and is locked as a regression fixture.
- Never invent a new rule merely to make one screenshot pass.

## Workbook formulas now verified

### Timeframe direction

The app's weighted timeframe direction is confirmed against workbook cells `Z:AE`:

- Month: Close 40 / MACD 30 / RSI 10 / Boli 20
- Week: 30 / 40 / 10 / 20
- Day: 35 / 25 / 10 / 30
- 4H: 25 / 20 / 20 / 35
- 1H: 0 / 20 / 40 / 40
- 15m: 0 / 15 / 40 / 45
- 5m: 0 / 5 / 50 / 45

The dominant positive/negative side is selected and the final direction uses the ±35 threshold. Current engine implementation matches this.

### DEEP / DD / NOW

Workbook cells `O4/O6/O8` use `MODE()` over the three timeframe results. Strength cells `Q4/Q6/Q8` are anchored on Day for DEEP and 1H for DD/NOW. Current engine implementation matches this.

### Score / raw grade

Workbook score weights are Month 2 / Week 5 / Day 10 / 4H 30 / 1H 33 / 15m 10 / 5m 5, with a matching Extra Check adding 5. Raw grade thresholds in `AC35` are represented by the current engine.

### PLUS 1 MINUS 1 — P12/Q12

This is no longer an inferred formula. The uploaded workbook gives the exact rules:

- `P12` is blank when Status is Scalp.
- Otherwise 1H MACD is the anchor.
- If 1H MACD = -1 and at least three of 4H/1H/15m/5m MACD are -1 => SELL.
- If 1H MACD = +1 and at least three are +1 => BUY.
- Otherwise blank.
- `Q12` quality precedence is:
  1. 4H = 1H = 15m => GOOD
  2. 15m = 1H = 5m => Scalp
  3. 4H = 1H = 5m => CAREFUL
  4. otherwise NO

The existing `calcMacdExtra()` is a direct transcription of these formulas. It should **not** be rewritten. Regression tests now lock BUY and SELL variants of GOOD / Scalp / CAREFUL plus blank cases.

One useful consequence of the workbook maths: with a non-blank P12 direction, the `NO` branch in Q12 appears unreachable for valid -1/0/+1 MACD inputs because every possible 3-of-4 match necessarily satisfies GOOD, Scalp or CAREFUL first. We keep the branch because the workbook contains it; we do not simplify canonical logic away.

## Proven current-Scruff deltas from the uploaded workbook

### 1. Grade wording

Winston's current Scruff screenshots prove:

- Grade A = **Good**
- Grade B = **Fair**

The uploaded workbook still contains A = `Very Good`, B = `Good`, so this is confirmed revision drift rather than an app-only typo. Prime Bias follows the current Scruff wording.

### 2. GBP/JPY Trend and Status

Supplied GBP/JPY marks:

- M: Close -1, MACD -1, RSI 0, Boli 0 -> SELL
- W: Close +1, MACD -1, RSI 0, Boli 0 -> SELL
- D: Close +1, MACD +1, RSI 0, Boli 0 -> BUY
- 4H: Close -1, MACD +1, RSI 0, Boli +1 -> BUY
- 1H: Close 0, MACD -1, RSI -1, Boli 0 -> SELL
- 15m: Close 0, MACD 0, RSI -1, Boli 0 -> SELL
- 5m: Close 0, MACD -1, RSI -1, Boli 0 -> SELL
- Extra Check: 1H 0, 15m -1 -> No Trade

Both workbook and current Scruff agree on the underlying blocks:

- DEEP = BEAR / WEAK
- DD = BUY / WEAK
- NOW = SELL / STRONG
- trade-score direction = SELL

They then diverge:

- Uploaded workbook P9/AI8 uses DEEP 10 / DD 49 / NOW 41, producing Trend SELL (51 vs 49), effective B and the old Scalp path.
- Winston's current Scruff screenshot shows **Trend BUY, C, No, Trend Off**.

That screenshot is decisive evidence of a later Scruff revision. Prime Bias therefore uses the current observed behaviour: directional DD owns Trend in this conflict state, and Scalp is blocked when DD opposes the trade direction.

### 3. Blank DD fallback — EUR/USD

A prior Winston/Scruff EUR/USD comparison proves the complementary case:

- DEEP = BUY / STRONG
- DD = blank
- NOW = SELL / STRONG
- current Scruff Trend = SELL
- current Scruff Status = No / grade C

The hardened rule is therefore deliberately narrow: directional DD takes precedence; when DD is blank, DEEP/NOW resolve the fallback. This matches both known current-Scruff cases without inventing another global weighting scheme.

## Cases locked by regression tests

### FTSE

- SELL
- B
- wording Fair
- Trend SELL
- Status No

### GBP/USD

- SELL
- A
- wording Good
- Trend SELL
- Status YES / Ready
- Target MED SELL
- PLUS 1 MINUS 1 = Scalp SELL

### GBP/JPY

- DEEP BEAR / DD BUY / NOW SELL
- Trade SELL
- Trend BUY
- effective C
- Status No
- Readiness Trend Off

### EUR/USD

- DEEP BULL
- DD blank
- NOW SELL
- Trend SELL
- Trade SELL
- C / No

## Architecture hardening

1. `biasEngine.js` is the sole owner of grade/status/readiness/Trend/target/PLUS 1 MINUS 1 decisions.
2. Components render returned values only.
3. Current-Scruff screenshot cases are permanent regression fixtures.
4. Uploaded-workbook formulas are documented as baseline formulas and locked where they remain current.
5. Current-Scruff deltas are explicitly documented so a future refactor cannot blindly "restore Excel parity" and reintroduce known bugs.
6. PLUS 1 MINUS 1 is now formula-locked to workbook P12/Q12 rather than inferred pattern logic.
7. ATR/target-pip numeric differences are excluded from parity when testers intentionally use different daily ATR values.

## Remaining limitation

We now know exactly where the uploaded workbook and Winston's current Scruff revision disagree. What we do **not** possess is the newer Scruff workbook containing the revised Trend/Status formulas. Until that file is available, the newer rules are represented by the narrowest behaviour proven by Winston's screenshots and guarded by regression fixtures. Do not broaden those exceptions without new current-Scruff evidence.
