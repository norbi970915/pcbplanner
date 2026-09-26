import { Cite, Guide, TryIt } from './Guide';

export default function ViaFence() {
  return (
    <Guide
      sources={[
        { text: 'H. W. Ott, Electromagnetic Compatibility Engineering, Wiley, 2009, chapter 6: shielding effectiveness of apertures and slots.' },
        { text: 'M. Swaminathan, A. E. Engin, Power Integrity Modeling and Design for Semiconductors and Systems, Prentice Hall, 2007: the cavity model of a plane pair and its resonances.' },
        { text: 'H. Johnson, M. Graham, High-Speed Digital Design: A Handbook of Black Magic, Prentice Hall, 1993: the knee frequency 0.5 / tr of a digital edge.' },
        { text: 'pcbplanner Via Stitching & Via Fence Spacing, Method, formulas and references: wavelength, via-grid cell resonance, plane-pair resonances and slot leakage.', url: '/via-stitching#method' },
      ]}
    >
      <p>
        <b>A via fence is a row of ground vias that acts as a wall.</b> Placed along an RF trace, around a noisy circuit or along the board edge, it keeps fields from
        spreading sideways between the planes. Stitching vias do the same job across a whole board by tying the ground planes together. Both only work if the vias are close
        together compared with the wavelength, and the usual rules for "close" are λ/10 and λ/20.
      </p>
      <p>
        This guide shows how to turn those rules into a via pitch in millimetres, then checks the result with two physical estimates: the resonance of the cells between
        the vias and the leakage through the gaps.
      </p>

      <h2>Step 1: the wavelength inside the board</h2>
      <p>λ = c / (f × √εr)</p>
      <p>
        Use the highest frequency you need to contain: an RF band, a clock harmonic, or for digital edges the knee frequency 0.5 / tr. A 100 ps rise time gives 5 GHz.
        <Cite n={3} /> The fields between two planes are inside the laminate, so use its dielectric constant. For FR-4 with εr = 4.2:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">Frequency</th>
            <th className="v">λ in FR-4</th>
            <th className="v">λ/10</th>
            <th className="v">λ/20</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">1 GHz</td><td className="v">146.3 mm</td><td className="v">14.6 mm</td><td className="v">7.3 mm</td></tr>
          <tr><td className="v">2.4 GHz</td><td className="v">61.0 mm</td><td className="v">6.1 mm</td><td className="v">3.0 mm</td></tr>
          <tr><td className="v">5 GHz</td><td className="v">29.3 mm</td><td className="v">2.9 mm</td><td className="v">1.5 mm</td></tr>
          <tr><td className="v">10 GHz</td><td className="v">14.6 mm</td><td className="v">1.5 mm</td><td className="v">0.7 mm</td></tr>
        </tbody>
      </table>
      <p>
        λ/20 is the common conservative choice and λ/10 is often accepted. Both are design guidelines rather than requirements of a standard. A surface microstrip
        has part of its field in air, so its wavelength is longer than this; using the laminate εr keeps the pitch on the safe side. <Cite n={4} />
      </p>

      <h2>Step 2: check the cells between the vias</h2>
      <p>f11 = c × √2 / (2 × s × √εr)</p>
      <p>
        Two planes stitched on a square grid of pitch s form small cavities. Treating each row of vias as a wall, the lowest resonance of a cell is f11. Real via rows leak,
        so the true resonance is somewhat lower; keep it at least twice the highest frequency. <Cite n={[2, 4]} />
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">Pitch</th>
            <th className="v">Cell resonance</th>
            <th className="v">Gap (0.6 mm pads)</th>
            <th className="v">Leakage estimate at 5 GHz</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">1.5 mm</td><td className="v">69.0 GHz</td><td className="v">0.9 mm</td><td className="v">30.5 dB</td></tr>
          <tr><td className="v">2 mm</td><td className="v">51.7 GHz</td><td className="v">1.4 mm</td><td className="v">26.6 dB</td></tr>
          <tr><td className="v">3 mm</td><td className="v">34.5 GHz</td><td className="v">2.4 mm</td><td className="v">21.9 dB</td></tr>
          <tr><td className="v">5 mm</td><td className="v">20.7 GHz</td><td className="v">4.4 mm</td><td className="v">16.7 dB</td></tr>
        </tbody>
      </table>
      <p>
        At 5 GHz every pitch in the table keeps the cell resonance far above the operating frequency, even the 5 mm grid. Yet 3 mm is already just over λ/10 (2.9 mm),
        and 5 mm is well over it. The cell resonance is rarely what limits the pitch; the leakage through the gaps is.
      </p>

      <h2>Step 3: estimate the leakage through the gaps</h2>
      <p>SE ≈ 20 × log10(λ / (2 × L))</p>
      <p>
        The space between two via pads behaves like a slot of length L. Ott's slot formula estimates how much it attenuates a field, and gives 0 dB when the slot is half
        a wavelength long. <Cite n={1} /> The last column of the table uses the free-space wavelength, as the via stitching calculator does. Each halving of the gap adds
        about 6 dB, which is the practical argument for a tighter fence around a sensitive RF section. Treat these values as order-of-magnitude estimates: they assume a
        single slot in a perfect wall, and a fence has many slots in a row. <Cite n={4} />
      </p>
      <TryIt to="/via-stitching">Load the 5 GHz, 3 mm pitch example</TryIt>

      <h2>Why an unstitched board resonates</h2>
      <p>fmn = c / (2√εr) × √((m / a)² + (n / b)²)</p>
      <p>
        A pair of planes with no stitching is a cavity the size of the board. For a 100 × 80 mm board in FR-4 the first resonances are at 731 MHz, 914 MHz and 1.17 GHz.
        Noise injected between the planes near those frequencies builds up and radiates from the board edges. <Cite n={2} /> Stitching the planes together, and a via fence
        along the edge, split the cavity into cells whose resonances are far higher, as in the table above.
      </p>

      <h2>Fencing a trace</h2>
      <p>
        A fence along an RF or clock trace uses the same pitch rules, with a row of vias on each side. Keep the vias connected to every reference plane the trace sees:
        on a stripline, the fence ties the plane above to the plane below. If the fence copper or the vias are close to the trace, the line becomes a grounded coplanar
        waveguide and its impedance drops. Either keep the fence far enough away that the impedance does not change, or design the line as coplanar from the start.
      </p>
      <TryIt to="/impedance">Check the trace impedance with coplanar ground beside it</TryIt>

      <h2>Checklist</h2>
      <ol>
        <li>Find the highest frequency to contain: the RF band, a harmonic, or 0.5 / tr for digital edges.</li>
        <li>Calculate λ in the laminate and pick a pitch between λ/20 and λ/10.</li>
        <li>Confirm the via-grid cell resonance is at least twice that frequency.</li>
        <li>Around sensitive sections, tighten the pitch until the gap leakage estimate gives the isolation you need.</li>
        <li>Stitch along the board edge and across plane pairs, and check the effect of a trace fence on its impedance.</li>
      </ol>
    </Guide>
  );
}
