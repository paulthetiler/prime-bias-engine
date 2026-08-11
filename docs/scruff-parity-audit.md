# Scruff parity audit — Winston cases

Source basis: Winston's supplied Scruff screenshots, the Prime Bias screenshots made from the same indicator marks, and the current `src/lib/biasEngine.js`. Do not infer canonical behaviour beyond what these cases prove.

## Proven mismatches

### 1. Canonical grade wording

Two supplied comparisons prove the current app labels are not Scruff's wording:

- Grade A: Scruff = **Good**; Prime Bias currently = **Very Good**.
- Grade B: Scruff = **Fair**; Prime Bias currently = **Good**.

Current `calcGradeLabel()` therefore reinterprets canonical wording and should be corrected at engine level, not in the component.

### 2. GBP/JPY Trend precedence and false Scalp

Supplied GBP/JPY marks:

- M: Close -1, MACD -1, RSI 0, Boli 0 -> SELL
- W: Close +1, MACD -1, RSI 0, Boli 0 -> SELL
- D: Close +1, MACD +1, RSI 0, Boli 0 -> BUY
- 4H: Close -1, MACD +1, RSI 0, Boli +1 -> BUY
- 1H: Close 0, MACD -1, RSI -1, Boli 0 -> SELL
- 15m: Close 0, MACD 0, RSI -1, Boli 0 -> SELL
- 5m: Close 0, MACD -1, RSI -1, Boli 0 -> SELL
- Extra Check: 1H 0, 15m -1 -> No Trade

Scruff shows:

- DEEP SELL / weak
- Dominant Direction BUY / weak
- NOW SELL / strong
- **Trend BUY**
- Status/ready path: **No / Trend Off**, grade **C**
- No Scalp output

This is decisive evidence against Prime Bias's previous unconditional `DEEP 10 / DD 49 / NOW 41` winner calculation. That calculation gives SELL (10 + 41 versus 49), while the supplied Scruff sheet gives BUY. A directional Dominant Direction therefore has precedence for Trend in the observed canonical case.

The existing Scalp guard was also too weak. A Scalp must never be generated when Dominant Direction opposes the trade direction.

### 3. Blank Dominant Direction fallback — EUR/USD

A prior Winston/Scruff EUR/USD comparison adds the missing fallback case:

- DEEP = BUY / strong
- Dominant Direction = blank (all three DD inputs resolve differently)
- NOW = SELL / strong
- Scruff Trend = **SELL**
- Scruff Ready = **No**, grade **C**

Together with GBP/JPY this proves the safe observed rule used by the engine hardening: when DD is directional, it owns Trend; when DD is blank/neutral, the existing DEEP/NOW fallback can resolve Trend. This avoids replacing one guessed weighting scheme with another.

### 4. Naming: `PLUS 1 MINUS 1`, not `MACD Extra`

Scruff labels the separate lower-row MACD-derived output **PLUS 1 MINUS 1**. Prime Bias currently labels the same presented field **MACD Extra**. The supplied GBP/USD case shows the output itself as SELL / Scalp and Prime Bias also reaches SELL / Scalp, so this screenshot does **not** prove the underlying P12/Q12 calculation is wrong. It proves the terminology differs.

Rename the user-facing label to Scruff's wording. Keep implementation names internal if desired, but do not present an app-invented canonical field name.

## Cases that currently agree on core direction/output

### FTSE

Marks reproduce the same timeframe directions and main SELL result. Scruff reports grade B with wording Fair; Prime Bias reports B with wording Good. The proven mismatch here is wording, not the grade letter.

### GBP/USD

Marks reproduce SELL, A, Ready/YES, MED SELL and the separate SELL / Scalp output. Scruff calls A `Good`; Prime Bias calls it `Very Good`. Again, the proven mismatch is wording.

## Architecture hardening

1. `biasEngine.js` remains the only owner of canonical grade/status/readiness/Trend/target/PLUS 1 MINUS 1 values.
2. Components render returned values only; they must not recreate canonical decisions.
3. Add table-driven regression fixtures for FTSE, GBP/USD, GBP/JPY and EUR/USD from Winston's screenshots.
4. Add a Trend invariant fixture: directional DD takes precedence in the proven GBP/JPY conflict case; blank DD falls back correctly in EUR/USD.
5. Add a Scalp invariant test: blank DD or DD opposite trade direction cannot produce Scalp.
6. Add canonical label tests: A -> Good, B -> Fair.
7. Add a terminology test in the Bias Result component for `PLUS 1 MINUS 1` so `MACD Extra` cannot reappear as user-facing wording.
8. Keep ATR/target-pip value differences out of parity assertions when the tester has supplied different daily ATR values.

## Important limit of this audit

The supplied screenshots do not prove the full truth table for the separate P12/Q12 calculation. Do not rewrite `calcMacdExtra()` wholesale from inference. Lock the observed GBP/USD SELL/Scalp case first, then only change the formula when a Scruff case demonstrates a calculation mismatch.