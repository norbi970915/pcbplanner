# LinkBench-4 site examples — 23 October 2026

The owner reviewed the app preview and explicitly approved LinkBench-4 and publication of all three updates on 23 October 2026.

## Changes

- The KiCad Try an example action loads the original, native LinkBench-4 board and project: four differential pairs, a layer transition, two inner ground planes and a 5 V resistor bank. Explicit nominal currents and dissipations reproduce 4.74 mV maximum load drop and a 55.2 °C peak board-temperature estimate with the stated model assumptions.
- Older saved projects are preserved. The earlier teaching board offers an explicit switch to LinkBench-4, with the existing replacement confirmation. Its deliberately failing routing and 48 V clearance cases remain in regression coverage and existing public download URLs still work.
- Gerber inspection and comparison use native KiCad exports of all four copper layers, top silkscreen and the outline. Revision B changes the LANE0 dogleg, feed width, ground stitching and supply-pour boundary. Both complete board sources and the inspection Gerbers are downloadable in a 19-file archive.
- Sample artwork is fetched on request with cancellation and normal import-error recovery. Only a sample load receives the explanation; manually selected files never inherit it from a filename.
- The two homepage announcements describe the KiCad and Gerber examples. The complete archive documents the illustrative stackup, resistor operating conditions, thermal assumptions and revision changes.
- A narrow-screen header overflow discovered at 320 px is fixed by showing the brand icon without its wordmark at widths up to 360 px.

## Native checks and scope

KiCad 10.0.4 reports zero DRC violations, zero unconnected items and zero schematic-parity issues for both revisions. Revision A is byte-identical to the reviewed original. Revision B has native refilled zones and no added DRC exclusions. These checks cover configured rules; the passive board has no protocol or data-rate qualification. Heatmaps are model estimates, not measurements or component surface/junction temperatures.

The comparison is of rendered geometry. Thin 0.05 mm profile strokes can fall below its documented 50% pixel threshold at board-fit zoom. The regression therefore checks the source profile geometry and export origins as well as the absence of invented differences, without claiming subpixel fabrication inspection.

## Verification and reproduction

Native generation: `scripts/generate-linkbench-gerbers.py` with KiCad 10's bundled Python. Archive: `node scripts/package-linkbench-example.mjs`.

Browser coverage: `scripts/audit-linkbench-example.mjs`, included in CI, checks the new examples, nominal power/thermal results, inactive-tab reports, native Gerber changes and matching outlines, archive contents, missing-file recovery, filename provenance and mobile overflow. Existing KiCad, review/example and Gerber interaction regressions retain their coverage.

Production-preview example audit: 32 checks passed. Gerber interaction checks passed with the native revision set, including focus sizing, tool/task round trips, pan previews, full-resolution settling, fullscreen, PNG and 390/320 px controls. The retained legacy KiCad workflow and review/example audits passed 61 and 38 checks respectively.

Build, lint and the full unit suite are recorded under `dist-check/linkbench-*.log`. Full units: 110 files passed, 1,316 tests passed, two opt-in fixture-writing tests skipped. The full CI and final deployment status are recorded in the dated release handoff after publication.
