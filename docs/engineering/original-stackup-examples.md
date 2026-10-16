# Original PCBPlanner rigid examples (v1)

Created 2026-10-16. This replaces the previous rigid catalogue; it is a new procedural design, not a conversion or perturbation of its entries.

## Independent derivation

The generator uses only the explicit designer-selected inputs in src/data/rigidStackupRules.ts. No supplier table, glass-style construction, measured material database or external stackup generator is used to derive these examples.

For N copper layers and target copper-to-copper thickness T, subtract two 0.035 mm outer copper layers and N-2 inner 0.018 mm layers. An equal-gap example distributes that dielectric budget across N-1 gaps. A close-outer-plane example assigns 0.100 mm to each outer gap and shares the remainder across N-3 inner gaps. Two-layer examples have a single core. The selected ranges produce 37 examples, all with positive gaps of at least 0.100 mm and mirrored physical thicknesses.

Each dielectric is assumed homogeneous, with Dk 4.0 and Df 0.015. Each outer mask assumes 0.020 mm, Dk 3.5 and Df 0.020. These are chosen simulation assumptions with no claimed measurement frequency. Core/prepreg names illustrate alternating gap types rather than stock or ply schedules. Plane/signal roles are starting assignments, not verification of actual artwork.

This does not model resin consumption, copper distribution, press cycles, available cores/prepregs, plating allowances or production tolerances. A passing advisor result checks the model against entered constraints, not manufacturability. Obtain an approved construction from the chosen fabricator.

## Compatibility

New examples have pcbplanner-v1-* IDs. Do not reuse an ID for changed geometry: a revised rule needs a new version. The retired catalogue is not bundled as a compatibility table. Old manager links show an unavailable-state chooser rather than silently substituting geometry. Interface Rules pauses geometry-dependent results until the user selects an available stackup. Existing custom records and imported full-geometry backups remain intact. A validated draft already in the current tab can be recovered into a new custom record. An ID-only reference cannot reconstruct a retired construction.

## Scope of the source review

This establishes the derivation of the replacement rigid examples and removes the previous catalogue from current application builds. It does not clear other material tables or third-party dependencies, erase repository history, or provide a patent or legal opinion. Flex and rigid-flex starters retain their existing independently constructed geometry and explicitly cited material properties.
