# LinkBench-4 — PCB Planner demonstration

Original passive four-lane differential interconnect with a separate 5 V resistive load bank.
Open `LinkBench-4.kicad_pro` in KiCad 10, or load the board and project files together in
https://www.pcbplanner.com/kicad-project. The schematic is included.

## Board and operating assumptions

- Chamfered 70 × 50 mm board with four copper layers, two inner ground planes and four differential pairs.
- Three pairs run on F.Cu; LANE2 transitions to B.Cu with nearby return vias.
- The net class assigns a 100 Ω differential target. The passive headers and board do not establish
  compliance with any protocol or data rate.
- Outer copper: 35 µm; inner copper: 18 µm. Dielectrics: 0.110 / 0.674 / 0.110 mm,
  Dk 4.2 and loss tangent 0.018. Total thickness including masks: 1.03 mm.
- Coupled trace width / edge gap: 0.135 / 0.165 mm. This is an illustrative stackup,
  rather than a fabrication house's qualified construction.
- J3 supplies +5 V (pin 1) and GND (pin 2). R1–R4 are four parallel 68 Ω loads,
  nominally 73.529 mA and 0.367647 W each at 5 V: 294.118 mA / 1.470588 W total.
  The intended physical resistors are rated at least 1 W each.
- The Power example uses constant load currents at nominal supply, GND return and 25 °C ambient.
- The Thermal example uses those four heat sources, copper losses, a flat board in still air,
  emissivity 0.9 and laminate conductivities 0.8 / 0.35 W/m·K (in-plane / through-plane).
  Press Solve in Thermal. Maps are steady-state board estimates, not measurements,
  resistor surface temperatures or junction temperatures.

J2's physical orientation reverses the signal pin order: check the schematic before connecting
external equipment. The board has no transmitter or receiver. Validate materials, connector
effects, manufacturing tolerances and complete link performance before making hardware.

## Revision comparison

The root project is revision A. `rev-b/` contains revision B, with the same schematic and netlist:

1. LANE0's centre dogleg moves 0.6 mm on both traces.
2. The two 5 V input-feed segments widen from 0.4 to 0.8 mm.
3. Two GND stitching vias are added at (123, 85.8) and (128, 85.8) mm.
4. The top +5 V pour extends 0.8 mm toward the signal region.
5. The silkscreen revision changes from A to B.

`gerbers/rev-a/` and `gerbers/rev-b/` are native KiCad exports of top and bottom copper,
both inner copper layers, top silkscreen and Edge.Cuts. These are inspection sets; they
do not contain all manufacturing outputs, solder masks, paste or drill files.
Select matching layers when comparing. The outline is unchanged. Added vias and their
clearances affect other copper layers too. Gerber changes describe geometry, not an
electrical sign-off.

Both boards were checked with KiCad 10.0.4: zero DRC violations, zero unconnected items
and zero schematic-parity issues. Zones were filled by KiCad. No DRC exclusions were added.
These checks cover the configured rules and do not qualify the board for production.

## Source and regeneration

The layout and schematic were created for PCB Planner. Standard KiCad library symbols,
footprints and models are used. No third-party demo board design is included.
`scripts/generate-linkbench-gerbers.py` in the PCB Planner source repository creates revision B
from revision A, refills its zones, runs DRC/parity and exports both Gerber sets using KiCad 10.
