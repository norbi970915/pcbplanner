"""Create LinkBench-4 revision B and export native KiCad comparison artwork.

Run with KiCad 10's bundled Python; requires kicad-cli beside that Python.
Revision A is the original reviewed board. It is never regenerated or modified.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import pcbnew as k

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / 'public' / 'examples' / 'linkbench-4'
REPORTS = ROOT / 'dist-check' / 'linkbench-native'
CLI = Path(sys.executable).with_name('kicad-cli.exe' if sys.platform == 'win32' else 'kicad-cli')
REPORTS.mkdir(parents=True, exist_ok=True)
revision_b = EXAMPLE / 'rev-b'
revision_b.mkdir(parents=True, exist_ok=True)
for suffix in ['kicad_pro', 'kicad_sch']:
    shutil.copyfile(EXAMPLE / f'LinkBench-4.{suffix}', revision_b / f'LinkBench-4.{suffix}')

board = k.LoadBoard(str(EXAMPLE / 'LinkBench-4.kicad_pcb'))
changed_endpoints = 0
widened_segments = 0
for track in board.GetTracks():
    if track.GetClass() != 'PCB_TRACK':
        continue
    if track.GetNetname() in ['/LANE0_P', '/LANE0_N']:
        for getter, setter in [(track.GetStart, track.SetStart), (track.GetEnd, track.SetEnd)]:
            point = getter()
            x, y = k.ToMM(point.x), k.ToMM(point.y)
            if 127.5 < x < 132.5 and 91.5 < y < 92.3:
                setter(k.VECTOR2I(point.x, point.y + k.FromMM(0.6)))
                changed_endpoints += 1
    if track.GetNetname() == '+5V' and abs(k.ToMM(track.GetWidth()) - 0.4) < 1e-6:
        track.SetWidth(k.FromMM(0.8))
        widened_segments += 1
assert changed_endpoints == 8, changed_endpoints
assert widened_segments == 2, widened_segments

ground = board.FindNet('GND')
for x in [123, 128]:
    via = k.PCB_VIA(board)
    via.SetPosition(k.VECTOR2I(k.FromMM(x), k.FromMM(85.8)))
    via.SetWidth(k.FromMM(0.55))
    via.SetDrill(k.FromMM(0.25))
    via.SetViaType(k.VIATYPE_THROUGH)
    via.SetLayerPair(k.F_Cu, k.B_Cu)
    via.SetNet(ground)
    board.Add(via)

for zone in board.Zones():
    if zone.GetNetname() == '+5V' and zone.GetLayer() == k.F_Cu:
        outline = zone.Outline()
        for index in range(outline.Outline(0).PointCount()):
            point = outline.Outline(0).CPoint(index)
            if abs(k.ToMM(point.y) - 118.5) < 1e-6:
                outline.Outline(0).SetPoint(index, k.VECTOR2I(point.x, k.FromMM(117.7)))

for drawing in board.GetDrawings():
    if drawing.GetClass() == 'PCB_TEXT' and 'REV A' in drawing.GetText():
        drawing.SetText(drawing.GetText().replace('REV A', 'REV B'))
board.GetTitleBlock().SetRevision('B')
file_b = revision_b / 'LinkBench-4.kicad_pcb'
k.SaveBoard(str(file_b), board)
subprocess.run([str(CLI), 'pcb', 'drc', '--refill-zones', '--save-board',
                '--schematic-parity', '--format', 'json', '--exit-code-violations',
                '-o', str(REPORTS / 'rev-b-drc.json'), str(file_b)], check=True)
layers = 'F.Cu,In1.Cu,In2.Cu,B.Cu,F.SilkS,Edge.Cuts'
for revision, file in [('a', EXAMPLE / 'LinkBench-4.kicad_pcb'), ('b', file_b)]:
    subprocess.run([str(CLI), 'pcb', 'export', 'gerbers', '-l', layers,
                    '--no-netlist', '--disable-aperture-macros',
                    '-o', str(EXAMPLE / 'gerbers' / ('rev-' + revision)), str(file)], check=True)
for folder in [EXAMPLE, revision_b]:
    folder.joinpath('LinkBench-4.kicad_prl').unlink(missing_ok=True)
print(json.dumps({'moved_lane0_endpoints': changed_endpoints,
                  'feed_segments_widened_mm': [0.4, 0.8],
                  'added_ground_vias': 2, 'supply_pour_edge_move_mm': 0.8}))
