import { Cite, Guide, TryIt } from './Guide';

export default function BoostFormulas() {
  return (
    <Guide
      sources={[
        { text: 'Texas Instruments SLVA372D, Basic Calculation of a Boost Converter\'s Power Stage: duty cycle, inductor, ripple current, switch current, maximum output current and output capacitor equations.', url: 'https://www.ti.com/lit/an/slva372d/slva372d.pdf' },
        { text: 'pcbplanner Boost Converter Calculator, Method, formulas and references: the same equations applied across the input range, with component tolerance and rating checks.', url: '/boost-converter#method' },
        { text: 'R. W. Erickson, D. Maksimović, Fundamentals of Power Electronics, 2nd ed., Springer, 2001: the right-half-plane zero of the boost converter in continuous conduction.' },
      ]}
    >
      <p>
        <b>A boost converter's inductor carries more current than its load.</b> Stepping a single Li-ion cell up to 5 V at 1 A needs almost 2 A in the inductor at 3 V,
        and a peak switch current near 2.4 A. That one fact drives most of the component choices, and it is why a boost IC's current limit, not its output rating, decides
        how much load it can supply.
      </p>
      <p>
        This guide works through the continuous-conduction (CCM) formulas from TI's application note SLVA372D, the same ones the boost converter calculator uses,
        for a battery-powered 5 V rail. <Cite n={[1, 2]} />
      </p>

      <h2>The example converter</h2>
      <table className="tbl">
        <tbody>
          <tr><td>Input voltage</td><td className="v">3.0 V to 4.2 V (one Li-ion cell, 3.7 V nominal)</td></tr>
          <tr><td>Output</td><td className="v">5 V at 1 A</td></tr>
          <tr><td>Switching frequency</td><td className="v">1 MHz</td></tr>
          <tr><td>Estimated efficiency η</td><td className="v">85 %</td></tr>
          <tr><td>Inductor ripple target</td><td className="v">30 % of the inductor current</td></tr>
          <tr><td>Output ripple budget</td><td className="v">30 mV (capacitive part)</td></tr>
        </tbody>
      </table>

      <h2>1. Duty cycle</h2>
      <p>D = 1 − Vin × η / Vout</p>
      <p>
        At 3.0 V the duty cycle is 1 − 3.0 × 0.85 / 5 = 0.49; at 3.7 V it is 0.371 and at 4.2 V it is 0.286. The lowest input is the worst case for almost everything in a
        boost converter: the highest duty cycle, the highest inductor current and the highest switch current. Check the IC's maximum duty cycle there. <Cite n={1} />
      </p>
      <p>
        Note what happens at the top of the range. A boost converter cannot step down: once the input approaches the output voltage the duty cycle reaches its minimum,
        and in a non-synchronous design the input then passes through the inductor and diode to the output unregulated. For a 5 V output from a battery that peaks at 4.2 V
        this is fine; for an input that can exceed the output you need a buck-boost or SEPIC instead.
      </p>

      <h2>2. Inductor current</h2>
      <p>IL,avg = Iout / (1 − D)</p>
      <p>
        All the output charge flows through the diode only while the switch is off, a fraction (1 − D) of each cycle. The inductor therefore carries Iout / (1 − D):
        1 / (1 − 0.49) = 1.96 A at 3.0 V for a 1 A load. The input current is the same 1.96 A, which is just the input power Vout × Iout / η divided by Vin. <Cite n={1} />
      </p>

      <h2>3. Inductor value</h2>
      <p>L = Vin × (Vout − Vin) / (ΔIL × fs × Vout) &nbsp;&nbsp;·&nbsp;&nbsp; ΔIL ≈ (0.2 to 0.4) × Iout × Vout / Vin</p>
      <p>
        TI estimates the ripple from the output current scaled by Vout / Vin, which approximates the inductor current. At the nominal 3.7 V with 30 %:
        ΔIL = 0.3 × 1 × 5 / 3.7 = 0.405 A, and L = 3.7 × (5 − 3.7) / (0.405 × 1 000 000 × 5) = 2.37 µH. The nearest standard value is 2.2 µH. <Cite n={1} />
      </p>

      <h2>4. Ripple, peak switch current and maximum load</h2>
      <p>ΔIL = Vin,min × D / (fs × L) &nbsp;&nbsp;·&nbsp;&nbsp; ISW,max = ΔIL / 2 + Iout / (1 − D)</p>
      <p>
        With 2.2 µH at 3.0 V: ΔIL = 3.0 × 0.49 / (1 000 000 × 2.2 µH) = 0.668 A and ISW,max = 0.334 + 1.961 = 2.295 A. The inductor RMS current is
        √(1.961² + 0.668² / 12) = 1.970 A. With −20 % inductance tolerance (1.76 µH) the peak rises to 2.378 A, which is the value to compare with the inductor's
        saturation current. <Cite n={[1, 2]} />
      </p>
      <p>The maximum load follows from the IC's minimum switch current limit:</p>
      <p>Iout,max = (ILIM,min − ΔIL / 2) × (1 − D)</p>
      <p>
        An IC with a 3 A minimum switch limit can therefore supply only (3 − 0.334) × 0.51 = 1.36 A at 3.0 V. A "3 A boost converter" is a 3 A <i>switch</i>, not a
        3 A output. <Cite n={1} />
      </p>

      <h2>5. Output capacitor</h2>
      <p>Cout,min = Iout × D / (fs × ΔVout) &nbsp;&nbsp;·&nbsp;&nbsp; ΔVESR = ESR × (Iout / (1 − D) + ΔIL / 2)</p>
      <p>
        While the switch is on, the diode is off and the output capacitor supplies the whole load. For 30 mV: Cout,min = 1 × 0.49 / (1 000 000 × 0.03) = 16.3 µF.
        Because the capacitor sees the full peak current when the diode turns on, ESR matters more than in a buck: 5 mΩ × 2.295 A = 11.5 mV. <Cite n={1} />
      </p>
      <p>
        The output capacitor's RMS current is also high, close to the load current (about 1.0 A in this example), whereas a buck's output capacitor only carries the ripple.
        With −10 % tolerance and 80 % of the capacitance retained at 5 V, 16.3 µF effective needs 16.3 / (0.9 × 0.8) = 22.7 µF nominal, so use two 22 µF parts.
        Small ceramic capacitors often keep much less than 80 % at 5 V, so read the retained value from the manufacturer's DC-bias curve.
      </p>
      <TryIt to="/boost-converter?vmax=4.2&l=2.2&cout=44">Load this 3.7 V to 5 V example in the calculator</TryIt>

      <h2>6. The diode, and the loop that matters</h2>
      <p>
        The rectifier diode (or synchronous switch) carries the load current on average, 1 A, but at the inductor's peak current. For a Schottky diode the loss is roughly
        Iout × VF. Its reverse voltage rating must exceed Vout. <Cite n={1} />
      </p>
      <p>
        In a boost converter the pulsed current flows in the output loop: switch, diode and output capacitor. Keep that loop as small as possible, with the output capacitor
        right next to the diode and the switch's ground. The input side carries the smooth inductor current, which is why a boost converter's input ripple is lower than a buck's.
      </p>

      <h2>7. The right-half-plane zero</h2>
      <p>fRHPZ = (1 − D)² × Rload / (2π × L)</p>
      <p>
        A boost converter in CCM has a right-half-plane zero that limits how fast its control loop can be. With a 5 Ω load (5 V at 1 A), D = 0.49 and 2.2 µH it sits at about
        94 kHz, and the loop crossover is typically placed well below it. A larger inductor or a heavier load moves the zero lower. Most integrated boost converters
        have internal compensation designed for a recommended inductor range, which is one more reason to stay within the datasheet's inductor values. <Cite n={3} />
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>Calculate D at the lowest input and compare it with the IC's maximum duty cycle.</li>
        <li>Calculate the inductor current Iout / (1 − D) and the peak switch current with the lowest-tolerance inductance.</li>
        <li>Confirm the IC's minimum current limit supports the load: Iout,max = (ILIM,min − ΔIL / 2) × (1 − D).</li>
        <li>Size the output capacitor for charge, ESR ripple and RMS current, using its capacitance at the output voltage.</li>
        <li>Keep the switch, diode and output capacitor loop tight.</li>
      </ol>
    </Guide>
  );
}
