import { describe, expect, it } from 'vitest';
import { RHO20 } from './copper';
import { IPC2221, tempRiseFor } from './ipc2221';
import type { DrawPad } from './kicadDrawing';
import { decodeLoads, encodeLoads, insidePad, netVoltage, quickCheck, requiredWidth, solveDc, type NetCopper, type PowerSettings } from './kicadPower';

const RHO = RHO20 * 1e3; // Ω·mm
const S: PowerSettings = { thickness: { 'F.Cu': 0.035, 'B.Cu': 0.035 }, layerZ: { 'F.Cu': 0, 'B.Cu': 1.6 }, platingMm: 0.025, tempC: 20, dTC: 10 };
const pad = (ref: string, x: number, y: number, w = 1, h = 1, layers = ['F.Cu'], i = 0): DrawPad & { i: number } => ({ i, x, y, w, h, angle: 0, shape: 'rect', layers, net: 'VCC', ref, num: '1' });
const net = (n: Partial<NetCopper>): NetCopper => ({ net: 'VCC', copper: ['F.Cu', 'B.Cu'], tracks: [], vias: [], fills: [], pads: [], ...n });
const track = (i: number, x1: number, y1: number, x2: number, y2: number, w: number, layer = 'F.Cu') => ({ i, layer, w, x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1) });

describe('DC drop', () => {
  it('a single track drops ρL/(Wt)', () => {
    const nc = net({ tracks: [track(0, 0, 0, 20, 0, 0.2)], pads: [pad('J1', 0, 0), pad('U1', 20, 0)] });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }], s: S });
    if (!r.ok) throw new Error(r.error);
    const R = (RHO * 20) / (0.2 * 0.035); // 49.3 mΩ
    expect(R).toBeCloseTo(0.04926, 4);
    expect(r.loads[0].dropMv).toBeCloseTo(R * 1000, 3);
    expect(r.tracks[0].amps).toBeCloseTo(1, 6);
    expect(r.powerW).toBeCloseTo(R, 5);
  });

  it('parallel tracks share the current by their width', () => {
    const nc = net({ tracks: [track(0, 0, 0, 10, 0, 0.2), track(1, 0, 0, 10, 0, 0.4)], pads: [pad('J1', 0, 0), pad('U1', 10, 0)] });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 3 }], s: S });
    if (!r.ok) throw new Error(r.error);
    expect(r.tracks[0].amps).toBeCloseTo(1, 6);
    expect(r.tracks[1].amps).toBeCloseTo(2, 6);
  });

  it('a via barrel joins the layers with ρ·h/(π/4·((d+2p)² − d²))', () => {
    const nc = net({
      tracks: [track(0, 0, 0, 10, 0, 0.3), track(1, 10, 0, 20, 0, 0.3, 'B.Cu')],
      vias: [{ i: 0, x: 10, y: 0, layers: ['F.Cu', 'B.Cu'], drill: 0.3, size: 0.6 }],
      pads: [pad('J1', 0, 0), pad('U1', 20, 0, 1, 1, ['B.Cu'], 1)],
    });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }], s: S });
    if (!r.ok) throw new Error(r.error);
    const rTrack = (RHO * 10) / (0.3 * 0.035);
    const rVia = (RHO * 1.6) / ((Math.PI / 4) * (0.35 ** 2 - 0.3 ** 2)); // 1.08 mΩ
    expect(rVia).toBeCloseTo(0.0010807, 6);
    expect(r.loads[0].dropMv).toBeCloseTo((2 * rTrack + rVia) * 1000, 3);
    expect(r.vias[0].amps).toBeCloseTo(1, 6);
  });

  it('a copper strip drops the sheet resistance times its squares', () => {
    // 10 × 2 mm of 35 µm copper fed across its whole width at both ends: 4.75 squares between the pad centres
    const fill = Float64Array.from([0, -1, 10, -1, 10, 1, 0, 1]);
    const nc = net({ fills: [{ layer: 'F.Cu', xy: fill }], pads: [pad('J1', 0.25, 0, 0.5, 2), pad('U1', 9.75, 0, 0.5, 2, ['F.Cu'], 1)] });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }], s: S, res: 0.05 });
    if (!r.ok) throw new Error(r.error);
    const R = ((RHO / 0.035) * 9.5) / 2; // 2.34 mΩ
    expect(r.loads[0].dropMv).toBeGreaterThan(R * 1000 * 0.95);
    expect(r.loads[0].dropMv).toBeLessThan(R * 1000 * 1.05);
    // 1 A over 2 mm of width in the middle of the strip
    const m = r.layers[0];
    const c = Math.round((5 - m.x0) / m.res);
    const row = Math.round((0 - m.y0) / m.res);
    expect(m.density[row * m.nx + c]).toBeCloseTo(0.5, 2);
  });

  it('thermal spokes narrower than the grid are resolved around the pads the current goes through', () => {
    // a 10 × 10 mm plane with a 2 mm square clearance around a 1 mm pad, joined by four 0.3 mm spokes
    const plane = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10, 0, 5, 4, 5, 4, 6, 6, 6, 6, 4, 4, 4, 4, 5, 0, 5]);
    const spoke = (x0: number, y0: number, x1: number, y1: number) => Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1]);
    const fills = [
      plane,
      spoke(5.4, 4.85, 6.1, 5.15),
      spoke(3.9, 4.85, 4.6, 5.15),
      spoke(4.85, 5.4, 5.15, 6.1),
      spoke(4.85, 3.9, 5.15, 4.6),
    ].map((xy) => ({ layer: 'F.Cu', xy }));
    const nc = net({ fills, pads: [pad('J1', 5, 5), pad('U1', 9.5, 9.5, 1, 1, ['F.Cu'], 1)] });
    const at = (res: number) => {
      const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }], s: S, res });
      if (!r.ok) throw new Error(r.error);
      return r.loads[0].dropMv;
    };
    const fine = at(0.03);
    // the spokes alone: 0.5 mm long, 0.3 mm wide, four in parallel
    expect(fine).toBeGreaterThan((((RHO / 0.035) * 0.5) / 0.3 / 4) * 1000);
    expect(at(0.4)).toBeCloseTo(fine, 0);
    expect(Math.abs(at(0.4) / fine - 1)).toBeLessThan(0.06);
  });

  it('copper the source cannot reach is reported as not connected', () => {
    const nc = net({ tracks: [track(0, 0, 0, 5, 0, 0.2)], pads: [pad('J1', 0, 0), pad('U1', 5, 0), pad('U2', 30, 0, 1, 1, ['F.Cu'], 2)] });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }, { ref: 'U2', amps: 1 }], s: S });
    if (!r.ok) throw new Error(r.error);
    expect(r.loads[0].connected).toBe(true);
    expect(r.loads[1].connected).toBe(false);
    expect(r.loads[1].onNet).toBe(true);
  });

  it('a load without pads on the net is told apart from one the copper does not reach', () => {
    const nc = net({ tracks: [track(0, 0, 0, 5, 0, 0.2)], pads: [pad('J1', 0, 0), pad('U1', 5, 0)] });
    const r = solveDc({ nc, source: 'J1', loads: [{ ref: 'U1', amps: 1 }, { ref: 'R9', amps: 1 }], s: S });
    if (!r.ok) throw new Error(r.error);
    expect(r.loads[1].onNet).toBe(false);
    expect(r.loads[1].connected).toBe(false);
    // the missing load draws nothing: U1's drop is that of its own 1 A
    expect(r.loads[0].dropMv).toBeCloseTo(((RHO * 5) / (0.2 * 0.035)) * 1000, 3);
  });

  it('a source without pads on the net is an error', () => {
    const r = solveDc({ nc: net({ pads: [pad('U1', 0, 0)] }), source: 'J9', loads: [], s: S });
    expect(r.ok).toBe(false);
  });
});

describe('quick check', () => {
  it('uses the IPC-2221 curve fit with the inner-layer constant on inner layers', () => {
    const nc = net({ copper: ['F.Cu', 'In1.Cu', 'B.Cu'], tracks: [track(0, 0, 0, 5, 0, 0.5), track(1, 0, 0, 5, 0, 0.5, 'In1.Cu')] });
    const s = { ...S, thickness: { ...S.thickness, 'In1.Cu': 0.035 } };
    const q = quickCheck(nc, 2, s);
    const aMil2 = (0.5 * 0.035) / 0.0254 ** 2;
    expect(q.tracks[0].dT).toBeCloseTo(tempRiseFor(2, aMil2, IPC2221.kExternal), 9);
    expect(q.tracks[1].dT).toBeCloseTo(tempRiseFor(2, aMil2, IPC2221.kInternal), 9);
    expect(q.tracks[1].dT).toBeGreaterThan(q.tracks[0].dT);
  });
});

describe('pads', () => {
  it('a turned pad covers its turned rectangle', () => {
    const p = { ...pad('U1', 0, 0, 4, 1), angle: 90 };
    expect(insidePad(p, 0, 1.8)).toBe(true);
    expect(insidePad(p, 1.8, 0)).toBe(false);
  });
});

describe('page helpers', () => {
  it('reads the voltage of a net from its name', () => {
    expect(netVoltage('+3V3')).toBe(3.3);
    expect(netVoltage('/power/+5V')).toBe(5);
    expect(netVoltage('VCC_1V8')).toBe(1.8);
    expect(netVoltage('+12V')).toBe(12);
    expect(netVoltage('3.3V')).toBe(3.3);
    expect(netVoltage('VBUS')).toBe(0);
  });

  it('keeps the loads in the address', () => {
    const loads = [{ ref: 'U3', amps: 1.2 }, { ref: 'U5', amps: 0.4 }];
    expect(encodeLoads(loads)).toBe('U3:1.2,U5:0.4');
    expect(decodeLoads('U3:1.2,U5:0.4')).toEqual(loads);
    expect(decodeLoads('U3:x,,U9:-1,R1:0')).toEqual([{ ref: 'R1', amps: 0 }]);
  });

  it('gives the IPC-2221 width the Trace Width tool gives', () => {
    // 1 A, 10 °C rise, 35 µm outer layer: 0.3 mm (11.8 mil)
    expect(requiredWidth(1, 10, 0.035, true)).toBeCloseTo(0.3, 1);
    expect(requiredWidth(1, 10, 0.035, false)).toBeGreaterThan(requiredWidth(1, 10, 0.035, true) * 2);
  });
});
