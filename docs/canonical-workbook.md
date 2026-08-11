# Canonical Prime Bias workbook contract

The source of truth for Prime Bias engine arithmetic is the current Scruff Plus Tools workbook supplied on 2026-08-11 as `Prime Bias(3).xlsx`.

SHA-256: `0501ed1beef0712c9ce5af162bc362f3807fc11af04daffa4f9d51bc6c977cbb`

Canonical sheet: `Bias Tool`.

## Rules

1. `src/lib/biasEngine.js` mirrors the workbook formula chain. UI code may display results but must not reinterpret engine decisions.
2. Excel value types are part of the formula semantics. Do not coerce text to numbers, numbers to text, blanks to zero, or otherwise "clean up" a workbook formula unless the workbook itself changes.
3. Any arithmetic or decision-logic change requires a new immutable engine version plus regression updates in the same PR.
4. Old screenshots or previous workbook revisions cannot override this workbook. A newer workbook becomes canonical only when its file is explicitly supplied, audited and this document is updated with its fingerprint.
5. The Winston GBP/JPY fixture is a permanent regression case: current workbook output is B / Good / Status No.
6. GBP/USD keeps Status YES while `PLUS 1 MIN 1` may independently report `Scalp SELL`; those are separate workbook outputs.

## Critical P10 detail

Current workbook P10 contains the final branch:

`AND(AK6=AK8,H10=J8)`

`AK6 = O8`, which is a numeric NOW result (`-1`, `0`, `1`).

`AK8 = IF(Q11="BUY","1",IF(Q11="SELL","-1",""))`, which returns text (`"1"`, `"-1"`).

Excel does not treat numeric `1` as equal to text `"1"`. The engine must preserve that type distinction. Normalising both sides to a number would change the canonical workbook and incorrectly create Status `Scalp` cases such as the GBP/JPY case Winston found.

## Engine version

The first version locked to this exact workbook-and-type contract is `prime-bias-excel-canonical-v4`.
