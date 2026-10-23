# Tool UI improvements — 23 October 2026

Status: implemented and verified locally. Publishing requested; release verification in progress.

Working checkout: `A:/Workspaces/Fusion/PCI3/kicad-workflow-reporting`.
The original `pcbplanner` checkout and its existing edits were not changed.

## Changes

1. **Focus view for KiCad Project and Gerber Viewer.** A visible toolbar toggle hides tool navigation, retains Properties, compacts the heading and sizes the canvas for a desktop viewport. Exiting restores the prior panel preferences. The View menu remains usable during focus. Focus is scoped to the tool and does not change calculator inputs or overwrite saved panel preferences. Existing fullscreen behavior is retained.
2. **Contextual KiCad Properties.** Overview shows a compact project summary, a routing-review action and collapsed stackup/impedance settings. Board puts routing targets first and keeps loss, mask and optional layer roles available. Power, Thermal and Clearance retain their dedicated controls. Shared settings and completed analysis results survive view changes.
3. **Separate Gerber tasks.** The default Inspect one board task shows one file area and layer controls. Compare revisions reveals revision B, comparison modes and alignment. Switching tasks retains both revisions, selected layers and alignment in volatile tab memory. Inspection excludes B from rendering, copper analysis and exported-image metadata. Reset returns to empty inspection. Reload still clears volatile Gerber data.
4. **Explicit impedance tasks.** Calculate impedance, Find trace width and Find pair spacing are available in the main view and in Properties on narrow screens. Solving modes identify the variable and show the current width/gap alongside impedance. The task is stored with the other calculator state for tool round trips, shared URLs and undo/reset. Spacing mode selects differential signaling. Pending target solves cannot overwrite inputs changed after the solve began.

No analytics events were added. No example-board files were changed.

## Verification

- Production build and TypeScript passed.
- Lint passed with existing repository warnings.
- Full unit suite: 109 files passed; 1,314 tests passed, two opt-in fixture-writing tests skipped.
- KiCad workflow: 61 checks passed, including contextual settings, settings preservation, focus sizing at 1280 × 720, report exports, mobile controls and board-specific result invalidation.
- Review/examples: 38 checks passed, including cached analysis results, pending-worker navigation and reports.
- Impedance/broadside: nine check groups passed, including width and spacing targets, reference values, sharing/reload, units, invalid inputs, both themes and 390/320 px layouts.
- Gerber interaction audit passed, including inspection/comparison and tool round trips, alignment preservation, focus sizing at 1280 × 720, pan/zoom, fullscreen, PNG and 390/320 px layouts.
- Shared workbench: 14 check groups passed, including eight pages at 1600, 1024, 390 and 320 px in both themes.
- No browser runtime errors in these audits. Changed browser audits were updated for the new task-selection controls.

The first unit invocation could not share its sandbox-generated temporary module files with workers. Running with TEMP/TMP in the ignored workspace verification directory completed successfully. The initial sandboxed development server was inaccessible to the app browser; the final production preview was served on the host for verification.

## Evidence

Logs under `dist-check/ui-workflow-*.log` include build, lint, units, KiCad, review/examples, impedance/broadside, Gerber interaction and workbench results.

Screenshots:

- `dist-check/kicad-workflow/focus-view.png`
- `dist-check/gerber/focus-view.png`
- `dist-check/ui-workflow/kicad-focus.png`

The local production preview used `http://127.0.0.1:4196`. This is not a public deployment. The development and preview servers were stopped after verification. The generated sitemap was restored after building to avoid unrelated generated-date changes in the source diff.
