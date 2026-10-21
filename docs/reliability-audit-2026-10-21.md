# Reliability audit — 21 October 2026

Audit started on production `f588aa353ea54d74e0c4427aa02c3a611c1ea667`. Work is isolated on `codex/audit-reliability-fixes`; publication and final verification are pending.

## Corrections

- Reports use explicit busy state rather than interpreting filenames as calculation progress. Pending imports, solves and Gerber painting remain blocked.
- Unsupported conductor, fill, resistor-colour and feedback-series choices produce recoverable input errors. Solver accuracy and mask permittivity are validated before solving.
- Emergency recovery clears the failed tool's saved inputs and comparison. Other tools, favorites and custom constructions are retained.
- Reset clears its URL immediately, so a rapid reload cannot restore the previous design during the URL debounce.
- Copper/aluminium models reject nonpositive or nonfinite resistivity. Normal cold-temperature calculations remain available.
- Invalid SI-prefix and phase-noise drafts pause results and can be undone. Correction links focus the offending field.
- Editable Power Tree and I²C panels remain visible while an entry is invalid.
- Stackup and ply cells parse the whole entry. Invalid plies stay editable; tiny positive values survive serialization. Ply drafts support Undo and Reset.
- Blank KiCad load-current, power and peak-voltage entries retain the previous committed value instead of silently becoming zero. Decimal-comma entry remains supported.
- Field solutions reject nonfinite outputs. PDN overflow produces a useful error; wide-band edges use a stable form of the existing quadratic solution and logarithmic plots handle ideal endpoints.
- Loss results are keyed to their current request. Invalidating or replacing a pending request cannot leave a permanent busy state or expose an old result with new inputs.
- Report printing tracks the loaded HTML, so toggling an option with identical output does not permanently disable Print.

## Verification

The pre-fix live audit covered all 63 tools, 37,286 field/state checks, public routes at desktop and phone widths, internal navigation, offline behavior, synthetic Touchstone data and independent engineering examples.

The expanded verification adds every individual dropdown option, discovered conditional input layouts, malformed and extreme values, Undo/Redo, browser Back/Forward, reload, every default result-copy/help button, report options/downloads/printing, active-project handoffs and saved constructions. Library checks cover all 178 rigid and six flex/rigid-flex presets. Detailed local results are in `dist-check/`.

The matrix covers reachable controls and individual option values in the supplied fixtures. Continuous numeric inputs, arbitrary uploaded designs and all combinations of all parameters form an unbounded test space. These checks do not establish manufacturing accuracy beyond the documented models and reference cases.

Final counts, CI commit and deployment verification will be recorded when the audit finishes.
