import { ToolPage } from '../components/ToolPage';
import { NumField, Panel, SelectField } from '../components/ui';
import { C0, cToF, fmt, fToC, LEN_UNITS, si, type LenUnit } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const LENGTHS: LenUnit[] = ['mm', 'mil', 'in', 'um', 'cm', 'oz'];
const DEFAULTS = { len: 1, lenU: 'mm', tc: 25, dbm: 0, r: 50, f: 100 };

export default function Units() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const lenU = LENGTHS.includes(p.lenU as LenUnit) ? p.lenU as LenUnit : 'mm';
  const { len, tc, dbm, r, f } = p;
  const mm = len * LEN_UNITS[lenU].toMm;
  const w = Math.pow(10, dbm / 10) / 1000;
  const vrms = Math.sqrt(w * r);

  return (
    <ToolPage title="Unit Converter" description="Quick conversions for PCB work: mm, mil, inch, µm and copper weight; temperature; dBm, watts and volts; frequency, period and free-space wavelength." properties={<p className="p-2 text-faint">The converters are in the document area.</p>} status="Unit converter" onReset={reset}>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Length and copper weight">
          <div className="space-y-[3px] border-b border-line p-2">
            <NumField label="Value" value={len} onChange={(v) => set({ len: v })} allowZero unit="" />
            <SelectField label="Unit" value={lenU} onChange={(v) => set({ lenU: v })} options={LENGTHS.map((u) => ({ value: u, label: u === 'oz' ? 'oz/ft² (copper)' : LEN_UNITS[u].label }))} />
          </div>
          <table className="tbl">
            <tbody>
              {LENGTHS.map((u) => (
                <tr key={u}>
                  <td>{u === 'oz' ? 'oz/ft² copper' : LEN_UNITS[u].label}</td>
                  <td className="v">{fmt(mm / LEN_UNITS[u].toMm, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Temperature">
          <div className="space-y-[3px] border-b border-line p-2">
            <NumField label="Celsius" value={tc} onChange={(v) => set({ tc: v })} unit="°C" allowNegative />
          </div>
          <table className="tbl">
            <tbody>
              <tr>
                <td>Fahrenheit</td>
                <td className="v">{fmt(cToF(tc), 5)} °F</td>
              </tr>
              <tr>
                <td>Kelvin</td>
                <td className="v">{fmt(tc + 273.15, 5)} K</td>
              </tr>
              <tr>
                <td>A rise of {fmt(tc, 4)} °C</td>
                <td className="v">{fmt(tc * 1.8, 5)} °F</td>
              </tr>
              <tr>
                <td>{fmt(tc, 4)} °F in Celsius</td>
                <td className="v">{fmt(fToC(tc), 5)} °C</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Power">
          <div className="space-y-[3px] border-b border-line p-2">
            <NumField label="Power" value={dbm} onChange={(v) => set({ dbm: v })} unit="dBm" allowNegative />
            <NumField label="Load" value={r} onChange={(v) => set({ r: v })} unit="Ω" />
          </div>
          <table className="tbl">
            <tbody>
              <tr>
                <td>Power</td>
                <td className="v">{si(w, 'W')}</td>
              </tr>
              <tr>
                <td>RMS voltage</td>
                <td className="v">{si(vrms, 'V')}</td>
              </tr>
              <tr>
                <td>Peak-to-peak (sine)</td>
                <td className="v">{si(vrms * 2 * Math.SQRT2, 'V')}</td>
              </tr>
              <tr>
                <td>dBW</td>
                <td className="v">{fmt(dbm - 30, 5)} dBW</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Frequency">
          <div className="space-y-[3px] border-b border-line p-2">
            <NumField label="Frequency" value={f} onChange={(v) => set({ f: v })} unit="MHz" />
          </div>
          <table className="tbl">
            <tbody>
              <tr>
                <td>Period</td>
                <td className="v">{si(1 / (f * 1e6), 's')}</td>
              </tr>
              <tr>
                <td>Free-space wavelength</td>
                <td className="v">{si(C0 / (f * 1e6), 'm')}</td>
              </tr>
              <tr>
                <td>Angular frequency</td>
                <td className="v">{si(2 * Math.PI * f * 1e6, 'rad/s')}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </ToolPage>
  );
}
