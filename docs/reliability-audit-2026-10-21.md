# Reliability audit — 21–22 October 2026

Audit started on production `f588aa353ea54d74e0c4427aa02c3a611c1ea667`. Fixes and expanded regression coverage are isolated on `codex/audit-reliability-fixes`. The dated release handoff records the final CI run, production commit and live verification.

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
- Resistor searches reject unbounded ranges before enumerating E-series values. Feedback Divider reports a numerical-range error instead of exhausting the array limit.
- VSWR reflection, admittance, delivered power and mismatch/cascade bounds use stable forms of the existing equations at extreme impedances and standing-wave ratios.
- BGA land and escape-routing results reject nonfinite dimensions and counts beyond exact integer representation, with normal Reset recovery.
- BGA's “Other…” ball diameter selection remains selected during custom entry; choosing a preset restores its diameter. This mode participates in saved inputs, Undo/Redo and Reset.

## Verification

The pre-fix live audit covered all 63 tools, 37,286 field/state checks, public routes at desktop and phone widths, internal navigation, offline behavior, synthetic Touchstone data and independent engineering examples.

The expanded verification adds every individual dropdown option, discovered conditional input layouts, malformed and extreme values, Undo/Redo, browser Back/Forward, reload, every default result-copy/help button, report options/downloads/printing, active-project handoffs and saved constructions. Library checks cover all 178 rigid and six flex/rigid-flex presets. Detailed local results are in `dist-check/`.

Completed regression runs include:

- 37,286 field/state checks across all 63 tools and Home on the production build, with no failed checks.
- 121 targeted reliability checks plus 139 malformed string parameters passed before the final BGA selector correction; its three added checks are included in the release handoff's final result.
- 54 KiCad workflow checks and 430 explicit project handoff checks across all eight receiving tools.
- 1,629 default action checks, including 569 copy and 205 help actions; the folder chooser's directory-fixture correction passed its separate rerun.
- 227 additional conditional actions and 814 checks, including mode-specific help, copy, component selection, ply editing and file exports.
- 173,907 passing checks across 714 discovered Impedance, Trace Loss and PDN layouts. Other tools' layouts and affected-route reruns are recorded separately.
- 1,072 solver, stackup, menu and navigation checks. Production build, TypeScript and lint checks pass; lint retains existing warnings.

The crawler starts each recorded layout from clean session state, including the stack manager's independent tab/draft keys, and resolves regenerated Gerber layer IDs by option position. Integer navigation probes use whole-number changes. These corrections distinguish fixture/replay failures from site defects. Scheduled/full CI also runs the conditional action pass and retains its artifacts.

The matrix covers reachable controls and individual option values in the supplied fixtures. Stackup region/layer membership switches are tested individually; each active region exposes its editable cells. Repeated layer editors and optional reference-frequency controls are covered by distinct control/action and row ordinal, without enumerating every subset of layers or frequency editors. Continuous numeric inputs, arbitrary uploaded designs and all combinations of all parameters form an unbounded test space. These checks do not establish manufacturing accuracy beyond the documented models and reference cases.

The release handoff consolidates the remaining mode-rerun counts, the final unit result, exact CI commit and deployment verification. Browser screenshots, downloads and detailed JSON remain local under `dist-check/`; they are not shipped with the site.
