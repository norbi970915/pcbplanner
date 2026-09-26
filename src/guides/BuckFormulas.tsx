import { Cite, Guide, TryIt } from './Guide';

export default function BuckFormulas() {
  return (
    <Guide
      sources={[
        { text: 'Texas Instruments SLVA477B, Basic Calculation of a Buck Converter\'s Power Stage: duty cycle, inductor, ripple current, switch current and capacitor equations.', url: 'https://www.ti.com/lit/an/slva477b/slva477b.pdf' },
        { text: 'pcbplanner Buck Converter Calculator, Method, formulas and references: the same equations applied across the input range, with component tolerance and rating checks.', url: '/buck-converter#method' },
      ]}
    >
      <p>
        <b>Five formulas size most of a buck converter's power stage:</b> the duty cycle, the inductor, the inductor ripple current, the peak switch current and the output
        capacitor. The input capacitor adds a sixth. This guide works through all of them for a 12 V to 3.3 V, 2 A converter at 500 kHz, and shows which input voltage
        is the worst case for each part.
      </p>
      <p>
        The equations are the continuous-conduction (CCM) formulas from TI's application note SLVA477B, the same ones the buck converter calculator uses. <Cite n={[1, 2]} />
      </p>

      <h2>The example converter</h2>
      <table className="tbl">
        <tbody>
          <tr><td>Input voltage</td><td className="v">10.8 V to 13.2 V (12 V ± 10 %)</td></tr>
          <tr><td>Output</td><td className="v">3.3 V at 2 A</td></tr>
          <tr><td>Switching frequency</td><td className="v">500 kHz</td></tr>
          <tr><td>Estimated efficiency η</td><td className="v">90 %</td></tr>
          <tr><td>Inductor ripple target</td><td className="v">30 % of the output current</td></tr>
          <tr><td>Output ripple budget</td><td className="v">20 mV (capacitive part)</td></tr>
        </tbody>
      </table>

      <h2>1. Duty cycle</h2>
      <p>D = Vout / (Vin × η)</p>
      <p>
        The efficiency term accounts for the losses the switch has to make up by staying on a little longer. For the example, D = 0.3395 at 10.8 V, 0.3056 at 12 V and
        0.2778 at 13.2 V. The duty cycle is highest at the lowest input, which is where the IC's maximum duty cycle and minimum off-time must be checked. It is lowest
        at the highest input, which sets the shortest on-time: 0.2778 / 500 kHz = 556 ns. <Cite n={1} />
      </p>

      <h2>2. Inductor value</h2>
      <p>L = Vout × (Vin − Vout) / (ΔIL × fs × Vin)</p>
      <p>
        Choose the ripple current ΔIL first. TI suggests 20 % to 40 % of the output current as a starting point. With ΔIL = 0.3 × 2 A = 0.6 A at the nominal 12 V:
      </p>
      <p>L = 3.3 × (12 − 3.3) / (0.6 × 500 000 × 12) = 7.98 µH.</p>
      <p>
        The next standard value up is 10 µH, which lowers the ripple. A larger inductor gives less ripple but responds more slowly to load steps and is physically bigger
        for the same current rating. <Cite n={1} />
      </p>

      <h2>3. Ripple current with the chosen inductor</h2>
      <p>ΔIL = (Vin − Vout) × D / (fs × L)</p>
      <p>
        Unlike the duty cycle, the ripple is <b>largest at the highest input voltage</b>. With 10 µH at 13.2 V: ΔIL = (13.2 − 3.3) × 0.2778 / (500 000 × 10 µH) = 0.55 A,
        or 27.5 % of the load. <Cite n={1} />
      </p>

      <h2>4. Peak switch current and inductor ratings</h2>
      <p>ISW,max = Iout + ΔIL / 2 &nbsp;&nbsp;·&nbsp;&nbsp; IL,rms = √(Iout² + ΔIL² / 12)</p>
      <p>
        The example gives ISW,max = 2 + 0.275 = 2.275 A and IL,rms = 2.006 A. The inductor's saturation current must exceed the peak, and its RMS (heating) rating must
        exceed the RMS current. The IC's minimum switch current limit sets the largest load it can deliver: Iout,max = ILIM,min − ΔIL / 2. <Cite n={1} />
      </p>
      <p>
        Inductance tolerance matters here. A 10 µH part with −20 % tolerance can be 8 µH, which raises the ripple to 0.688 A and the peak to 2.344 A. The calculator applies
        that tolerance before checking the saturation current. <Cite n={2} />
      </p>

      <h2>5. Output capacitor</h2>
      <p>Cout,min = ΔIL / (8 × fs × ΔVout) &nbsp;&nbsp;·&nbsp;&nbsp; ΔVESR = ESR × ΔIL</p>
      <p>
        For a 20 mV capacitive ripple with the nominal 10 µH: Cout,min = 0.55 / (8 × 500 000 × 0.02) = 6.9 µF. At the −20 % inductance the requirement rises to 8.6 µF.
        A 5 mΩ ceramic bank adds 5 mΩ × 0.55 A = 2.75 mV of ESR ripple on top. <Cite n={1} />
      </p>
      <p>
        Ceramic capacitors lose capacitance with DC bias. If a capacitor keeps 80 % of its value at 3.3 V and has a −10 % tolerance, 8.6 µF effective needs about
        8.6 / (0.9 × 0.8) = 11.9 µF nominal, so two 10 µF parts (14.4 µF effective) pass. Take the retained capacitance from the capacitor's DC-bias curve, not from this
        example. The output capacitor usually also has to be sized for load-step response, which these ripple formulas do not cover.
      </p>

      <h2>6. Input capacitor</h2>
      <p>Cin,min = Iout × D × (1 − D) / (fs × ΔVin) &nbsp;&nbsp;·&nbsp;&nbsp; ICIN,rms ≈ Iout × √(D × (1 − D))</p>
      <p>
        Both are largest at D = 0.5. The example never reaches 0.5, so the worst case is the lowest input (D = 0.3395). For 100 mV of input ripple:
        Cin,min = 2 × 0.3395 × 0.6605 / (500 000 × 0.1) = 9.0 µF, and the RMS current is about 0.95 A. The input capacitor carries the pulsed switch current,
        so place it as close as possible to the IC's input and ground pins; that loop sets most of the converter's high-frequency noise.
      </p>
      <TryIt to="/buck-converter?l=10&cout=20">Load this 12 V to 3.3 V example in the calculator</TryIt>

      <h2>Worst case for each part</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th>Quantity</th>
            <th>Worst at</th>
            <th className="v">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Duty cycle, minimum off-time</td><td>Lowest Vin</td><td className="v">D = 0.340</td></tr>
          <tr><td>Minimum on-time</td><td>Highest Vin</td><td className="v">556 ns</td></tr>
          <tr><td>Ripple current, peak current</td><td>Highest Vin, lowest L</td><td className="v">0.688 A, 2.344 A</td></tr>
          <tr><td>Output capacitance</td><td>Highest Vin, lowest L</td><td className="v">8.6 µF effective</td></tr>
          <tr><td>Input capacitance and RMS current</td><td>D closest to 0.5</td><td className="v">9.0 µF, 0.95 A</td></tr>
        </tbody>
      </table>

      <h2>When the formulas stop applying</h2>
      <p>
        All of the above assumes continuous conduction: the inductor current never falls to zero. The valley current is Iout − ΔIL / 2, so at light loads below about
        ΔIL / 2 (0.34 A in the example, with the low-tolerance inductor) a non-synchronous buck enters discontinuous mode and the duty cycle drops below the formula.
        Many synchronous converters instead keep CCM by allowing negative inductor current, or switch to a pulse-skipping light-load mode. Check the IC datasheet.
      </p>
      <p>
        For a non-synchronous buck with a rectifier diode, the diode carries Iout × (1 − D) on average, largest at the highest input: 2 × (1 − 0.2778) = 1.44 A in the example.
        Its loss is that current times the forward voltage. <Cite n={1} />
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>Calculate D at the lowest and highest input and compare them with the IC's maximum duty cycle and minimum on- and off-times.</li>
        <li>Size L for 20–40 % ripple at the nominal input, then recalculate the ripple at the highest input with the lowest-tolerance inductance.</li>
        <li>Check the inductor's saturation and RMS ratings and the IC's current limit against the peak and RMS currents.</li>
        <li>Size the output and input capacitors from their effective capacitance at the operating voltage, and check their ripple-current ratings.</li>
      </ol>
    </Guide>
  );
}
