# Prime Bias canonical workbook audit — current Scruff Plus Tools version

## Source of truth

The canonical source is the current `Prime Bias.xlsx` downloaded from **Scruff Plus Tools**, sheet `Bias Tool`.

Winston confirmed his earlier screenshots were produced from a different workbook revision. Those old-version screenshots are therefore historical evidence only and must not override the current workbook.

Parity policy is now simple:

1. Current Scruff Plus Tools workbook formulas are canonical.
2. `src/lib/biasEngine.js` must mirror those formulas exactly.
3. UI components may rename/layout outputs only where explicitly intended, but may not derive or alter canonical decisions.
4. Any future mathematical change requires a new engine version and updated canonical fixtures.

## Formula audit

### Timeframe direction — J4:J10 / Z:AE

Indicator weights:

- Month: Close 40 / MACD 30 / RSI 10 / Boli 20
- Week: 30 / 40 / 10 / 20
- Day: 35 / 25 / 10 / 30
- 4H: 25 / 20 / 20 / 35
- 1H: 0 / 20 / 40 / 40
- 15m: 0 / 15 / 40 / 45
- 5m: 0 / 5 / 50 / 45

The workbook separately totals positive and negative weighted contributions, chooses the side with the larger absolute magnitude, then applies the ±35 direction threshold.

### DEEP / DD / NOW — O4/O6/O8 and Q4/Q6/Q8

Direction uses `MODE()` across each three-timeframe block:

- DEEP = Month / Week / Day
- DD = Day / 4H / 1H
- NOW = 1H / 15m / 5m

All-three-different resolves blank via `IFERROR(MODE(...),"")`.

Strength is anchored exactly as the workbook does:

- DEEP anchor = Day
- DD anchor = 1H
- NOW anchor = 1H

### Trend — AI4:AJ8 / AI8 / P9

Block weights are:

- DEEP = 10
- DD = 49
- NOW = 41

A directional block contributes its weight to BUY or SELL. Blank/neutral contributes zero. `AI8` compares the BUY and SELL totals; the larger side wins, tie = Neutral.

This is important for Winston's GBP/JPY marks: DEEP SELL contributes 10, DD BUY contributes 49, NOW SELL contributes 41, therefore SELL wins **51–49**. The current workbook result is Trend SELL.

### Score and trade direction — AC24:AD34

Score weights:

- Month 2
- Week 5
- Day 10
- 4H 30
- 1H 33
- 15m 10
- 5m 5
- matching Extra Check +5

`AC34` picks the higher BUY/SELL score. A tie is broken by the 1H score row; otherwise `NILL`.

### Raw grade — AB35 / AC35

- >91 = F
- >=80 = C
- >=75 = A
- >=55 = B
- >=45 = C
- otherwise D

Current workbook display wording:

- A = **Very Good**
- B = **Good**
- C = Risky
- D = Dangerous
- F = Fail

### Effective grade — Q10

If Trend (`P9`) equals trade direction (`Q11`), use raw grade `AC35`. Otherwise force C.

### Status — P10

Branch order is locked exactly to the workbook:

1. Winning score > 90 => Extended
2. Raw grade F or D => NO
3. DD = NOW, H1 result = 5m result, and 5m RSI = H1 result => YES
4. DD = NOW, H1 result = 15m result, and 5m RSI differs from H1 result => Wait
5. NOW direction = trade direction and 5m RSI = H1 result => Scalp
6. Otherwise => No

There is **no DD-opposes-trade Scalp guard** in the current workbook. The earlier guard came from comparison against Winston's older workbook revision and has been removed.

### Readiness — M10

Branch order:

1. 5m RSI blank => blank
2. Trend != trade direction => Trend Off
3. Status YES or Scalp => Ready
4. Status Wait => Trend Off
5. Otherwise => Ready

This means Status `No` or `NO` does not itself force Readiness `No`. If Trend remains aligned, the workbook returns Ready.

### Target — O11 / Q11

Target quality:

- DEEP BULL + DD BUY + NOW BUY => GOOD
- DD BUY + NOW BUY => MED
- DEEP BEAR + DD SELL + NOW SELL => GOOD
- DD SELL + NOW SELL => MED
- otherwise Min

Target/trade direction is `AC34`.

### Extra Check — K12

- H1 -1 + 15m -1 => SELL
- H1 +1 + 15m +1 => BUY
- otherwise No Trade

### PLUS 1 MINUS 1 — P12 / Q12

`P12`:

- blank when Status = Scalp
- 1H MACD is the anchor
- H1 -1 plus at least three SELL MACDs across 4H/H1/15m/5m => SELL
- H1 +1 plus at least three BUY MACDs => BUY
- otherwise blank

`Q12` quality precedence:

1. 4H = 1H = 15m => GOOD
2. 15m = 1H = 5m => Scalp
3. 4H = 1H = 5m => CAREFUL
4. otherwise NO

The engine implementation is a direct transcription and regression tests cover BUY and SELL GOOD / Scalp / CAREFUL / blank cases.

## Canonical Winston fixtures under the current workbook

### FTSE

- Trade SELL
- Trend SELL
- B / Good
- Status No
- Readiness Ready

### GBP/USD

- Trade SELL
- Trend SELL
- A / Very Good
- Status YES
- Readiness Ready
- Target MED SELL
- PLUS 1 MINUS 1 = Scalp SELL

### GBP/JPY

- DEEP BEAR
- DD BUY
- NOW SELL
- Trade SELL
- Trend SELL (51–49)
- B / Good
- Status Scalp
- Readiness Ready

### EUR/USD

- DEEP BULL
- DD blank
- NOW SELL
- Trade SELL
- Trend SELL
- C / Risky
- Status Scalp
- Readiness Ready

## Architecture hardening

1. `biasEngine.js` is the only owner of canonical timeframe, block, Trend, score, grade, Status, Readiness, Target and PLUS 1 MINUS 1 decisions.
2. `BiasResult` renders engine outputs and does not recompute canonical state.
3. The current workbook ruleset is versioned as `prime-bias-excel-canonical-v3`; trades from a different engine version are not mixed into current-engine performance statistics.
4. Winston's current-workbook cases are regression fixtures.
5. P12/Q12 branches are formula-level regression fixtures.
6. Workbook formula references are documented beside the engine functions so future changes can be traced back to cells.
7. Old-workbook screenshot overrides have been removed. No historical screenshot is allowed to supersede the current canonical workbook.
8. Any future maths change must update the engine version and parity fixtures in the same PR.

## Audit result

The engine has been brought back to one source of truth: the current Scruff Plus Tools workbook. The previously introduced old-version overrides for grade wording, Trend precedence, Scalp blocking and Readiness have been removed or corrected. The remaining app-only presentation concepts are kept separate from workbook arithmetic.
