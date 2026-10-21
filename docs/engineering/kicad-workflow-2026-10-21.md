# KiCad workflow and reporting, 21 October 2026

This change completes the six improvements requested after a review of the live site. It also improves the demonstration board. The unrelated tool-method edits in the original checkout are outside this change.

## Behaviour

- Project reports solve the configured supply/return, thermal and clearance analyses afresh, and include the physical stackup, net classes, designed widths and routing checks. A closed tab does not omit its configured analysis. An unconfigured analysis is labelled as such, never reported as a pass. The report preserves file names, component references, assumptions and sources, and contains standalone grid images. Board strings are escaped. The calculation link does not include the local board file.
- Report snapshots omit hidden file pickers and preserve result text that happens to be a clickable table cell. Busy, invalid and stale thermal results cannot be exported as current results.
- Analysis results are tied to the loaded board object. Replacing a board does not display an old power, thermal or clearance result as a result of the new board. Thermal starts its busy state on the Solve click and retains the ambient temperature of the solved result while inputs are stale.
- New DC loads start at zero current. IC/transistor references are offered first as a heuristic; all parts remain manually selectable. Spread distributes current only over explicitly selected loads. It does not infer a part's current from its reference or footprint.
- Analysis controls follow the selected tab in desktop Properties, move above the results on phones, and stay inside the fullscreen board. There is one set of input controls, not two CSS-hidden copies. Result summaries precede the board. The introduction is shorter and the example explanation is collapsible.
- Loading the demonstration explicitly applies its teaching inputs. Resetting those inputs does not replace a user board. A previously saved older demonstration can be updated with an explicit action. Thermal still requires Solve.
- The homepage and tool chooser link directly to existing board power and thermal workflows. The What's new list is unchanged. Choosing a workflow on the current page preserves other URL inputs.
- Trace Width imports the selected layer's copper thickness, plus a selected net's dominant width and routed length on that layer. Plane and unreferenced layers are selectable. Imported width selects current-capacity mode. No operating current is guessed.
- Via imports board thickness or a selected via's hole, pad and physical layer span. An unresolved blind-via span is left unchanged. Plating, antipad and dielectric constant remain explicit assumptions.

## Demonstration board

The 80 × 60 mm six-layer teaching board retains three distinct differential-pair lessons: USB's wrong width after a layer change, HDMI's uncompensated bend skew, and a passing PCIe pair. The single-ended coupons now connect across their layers. The power section has input/output capacitor pads, actual supply/ground connections to the planes and thermal vias. Board silkscreen text identifies the lessons in the viewer. Its zones are filled by KiCad itself, using the accompanying project constraints.

The power demonstration assumes 0.2 A from 3.3 V: U1 dissipates (5−3.3) × 0.2 = 0.34 W and U2 dissipates 3.3 × 0.2 = 0.66 W. No datasheet junction metric is invented. The separate 48 V section is a clearance geometry lesson; its operating dissipation is not included in the low-voltage thermal scenario.

This is deliberately not a fabrication-ready design. KiCad DRC has no copper/connectivity errors or unconnected pads after repair. It retains two open-ended USB-coupon warnings and library warnings for simplified embedded demonstration footprints. The board's intentional impedance/skew and IPC-2221 spacing findings are distinct from KiCad's own geometric design-rule checks.

## Verification

`scripts/audit-kicad-workflow.mjs` exercises the actual browser flows: demonstration loads, explicit current distribution, stale-result blocking, a report from inactive tabs, HTML download, imports, phone layouts and a plane-dependent unfilled-board fixture. The fixture becomes connected only after opt-in estimation, and its estimate label is checked in Power and Thermal. CI runs this audit against the production build.

Unit regressions cover load selection, physical via spans, connected demonstration supply/return copper, its power budget and escaped file-supplied strings. Existing routing fixtures account for the new 5 mm clock connection. `scripts/refill-example.mjs` can retain its KiCad DRC report with `KICAD_DRC_OUT`; it now copies the project file before filling, so the actual net classes and board constraints are used.

Local release checks passed: 1,268 unit tests (two skipped), the production build and TypeScript, 1,228 existing browser smoke checks, all 35 chooser paths, and 42 KiCad workflow checks against the production build. The workflow audit also prints the standalone report to PDF, checks fullscreen controls, rejects stale thermal exports, reloads the board while Thermal is active, and verifies that all three unconfigured analyses are explicitly marked. KiCad 10.0.4 reports zero errors and zero unconnected pads; its 19 warnings are the two intentional open USB coupon ends and 17 simplified-footprint library warnings.
