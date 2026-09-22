import { Cite, Guide, TryIt } from './Guide';

export default function ControlledImpedance() {
  return (
    <Guide
      sources={[
        { text: 'H. Johnson, M. Graham, High-Speed Digital Design: A Handbook of Black Magic, Prentice Hall, 1993.' },
        { text: 'E. Bogatin, Signal and Power Integrity – Simplified, 3rd ed., Prentice Hall, 2018.' },
        { text: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012 (transmission-line theory, reflection coefficient).' },
        { text: 'E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S International Microwave Symposium Digest, 1980.' },
        { text: 'IPC-2141A, Design Guide for High-Speed Controlled Impedance Circuit Boards, IPC, 2004.' },
        { text: 'pcbplanner impedance calculator: method and validation against a Polar SI9000 field solver (within 1 % on coated microstrip).', url: '/impedance' },
      ]}
    >
      <p>
        “Controlled impedance” appears on fab order forms and in every high-speed layout guide, yet it is often treated as a checkbox. This guide explains what the impedance of a trace
        is, when it matters, and which details of the cross-section move it by several ohms. The numbers come from the 2D field solver in the{' '}
        <a href="/impedance">impedance calculator</a>, so you can reproduce each one.
      </p>

      <h2>What trace impedance is</h2>
      <p>
        A trace over a ground plane is a transmission line. It has an inductance <i>L</i> and a capacitance <i>C</i> per unit length, and a signal edge travelling along it sees a
        characteristic impedance <i>Z</i>
        <sub>0</sub> = √(<i>L</i>/<i>C</i>) <Cite n={[1, 3]} />. Wider traces and thinner dielectrics add capacitance and lower <i>Z</i>
        <sub>0</sub>; narrower traces and thicker dielectrics raise it. The value does not depend on the trace length.
      </p>
      <p>
        Wherever the impedance changes (a connector, a via, a different width, the receiver), part of the edge is reflected. The fraction is the reflection coefficient{' '}
        <i>Γ</i> = (<i>Z</i>
        <sub>2</sub> − <i>Z</i>
        <sub>1</sub>) / (<i>Z</i>
        <sub>2</sub> + <i>Z</i>
        <sub>1</sub>) <Cite n={3} />. A 60 Ω section in a 50 Ω system reflects 10/110 ≈ 9 % of the voltage; a trace at the edge of a ±10 % fab tolerance (55 Ω) reflects about 5 %.
        Reflections close the eye of a high-speed link and cause ringing on clocks.
      </p>

      <h2>When a trace needs controlled impedance</h2>
      <p>
        What matters is the <b>rise time</b> of the signal, not its clock frequency. A common rule of thumb is that a trace behaves as a transmission line once its delay exceeds
        about one sixth of the rise time <Cite n={1} />. On a surface microstrip over a thin 1080 prepreg, the signal travels at about 6.0 ps/mm:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Rise time</th>
            <th className="v">Distance the edge travels</th>
            <th className="v">Critical length (1/6)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1 ns (older logic, slow edges)</td>
            <td className="v">167 mm</td>
            <td className="v">≈ 28 mm</td>
          </tr>
          <tr>
            <td>100 ps (USB 3, PCIe, DDR)</td>
            <td className="v">17 mm</td>
            <td className="v">≈ 2.8 mm</td>
          </tr>
        </tbody>
      </table>
      <p>
        Modern I/O drivers switch in tens of picoseconds even when the data rate is modest, so almost every trace to a fast interface is “long” and must match the impedance the
        interface is specified for: typically 50 Ω single-ended, and 85, 90 or 100 Ω differential.
      </p>
      <TryIt to="/timing">Work out the critical length for your rise time</TryIt>

      <h2>Microstrip and stripline</h2>
      <p>
        A <b>microstrip</b> is a trace on an outer layer with a plane underneath. Part of its electric field is in the air above, so the effective dielectric constant is lower than the
        laminate's and signals travel faster. A <b>stripline</b> is an inner-layer trace between two planes, with its field entirely inside the laminate.
      </p>
      <p>A 50 Ω trace on the two layer types of the same six-layer, 1.6 mm FR-4 board (1080 prepreg on the outside, 1 oz outer and ½ oz inner copper):</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Layer</th>
            <th className="v">Dielectric to plane</th>
            <th className="v">Width for 50 Ω</th>
            <th className="v">Delay</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>L1, microstrip with solder mask</td>
            <td className="v">0.076 mm, Dk 3.91</td>
            <td className="v">0.119 mm</td>
            <td className="v">6.0 ps/mm</td>
          </tr>
          <tr>
            <td>L3, stripline (asymmetric)</td>
            <td className="v">0.092 mm below, 0.6 mm above</td>
            <td className="v">0.121 mm</td>
            <td className="v">6.8 ps/mm</td>
          </tr>
        </tbody>
      </table>
      <p>The practical differences:</p>
      <ul>
        <li>
          <b>Crosstalk.</b> In a stripline surrounded by one uniform dielectric, the even and odd modes travel at the same speed, so far-end crosstalk between parallel traces
          ideally cancels <Cite n={[1, 2]} />. On microstrip it does not, and it grows with the parallel length.
        </li>
        <li>
          <b>Shielding.</b> Striplines are enclosed by planes and radiate far less; microstrips are exposed.
        </li>
        <li>
          <b>Speed and loss.</b> Microstrip is faster (lower effective Dk) and slightly lower in dielectric loss because part of the field is in air.
        </li>
        <li>
          <b>Access.</b> Microstrip needs no vias to reach surface-mount pins; every via on a fast signal adds a small discontinuity and, on thick boards, a resonant stub.
        </li>
      </ul>

      <h2>Solder mask lowers the impedance</h2>
      <p>
        Solder mask is a dielectric (Dk around 3.5–4) that fills the space around an outer trace, where there would otherwise be air. It adds capacitance, so it lowers the impedance.
        On the 1080-prepreg microstrip above (0.0764 mm, Dk 3.91), the field solver gives:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Trace width</th>
            <th className="v">No mask</th>
            <th className="v">With mask (30 µm, Dk 3.8)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>0.12 mm</td>
            <td className="v">53.4 Ω</td>
            <td className="v">49.9 Ω</td>
          </tr>
          <tr>
            <td>0.13 mm</td>
            <td className="v">51.3 Ω</td>
            <td className="v">48.1 Ω</td>
          </tr>
          <tr>
            <td>0.14 mm</td>
            <td className="v">49.4 Ω</td>
            <td className="v">46.3 Ω</td>
          </tr>
        </tbody>
      </table>
      <p>
        That is about 3.5 Ω, or 7 %, which is most of a typical ±10 % fab tolerance. A trace designed for 50 Ω without mask (about 0.137 mm here) ends up near 47 Ω on a real,
        masked board. Always design outer layers with the mask included; fabricators' impedance calculators do the same.
      </p>

      <h2>Etching and copper thickness</h2>
      <p>
        Etched traces are trapezoidal: the top is narrower than the bottom, by roughly 0.5 mil (12.7 µm) on 1 oz copper. All numbers in this guide include that etch. Thicker copper
        adds side-wall capacitance and lowers the impedance slightly. Fabs adjust the final width to their own etch process when you order controlled impedance, which is one reason to
        let them tune it rather than fighting over the third decimal.
      </p>

      <h2>Formulas versus a field solver</h2>
      <p>
        Closed-form equations such as IPC-2141 <Cite n={5} /> or Hammerstad–Jensen <Cite n={4} /> are fits to limited ranges of geometry. For the uncoated 0.12 mm trace above,
        Hammerstad–Jensen gives 54.6 Ω against the solver's 53.4 Ω, about 2 % high. That is still good, but these formulas have no term for solder mask, embedded traces or mixed
        dielectrics at all, and the older IPC-2141 microstrip formula is known to lose accuracy on thin dielectrics <Cite n={2} />. A 2D field solver computes the actual cross-section;
        the one in pcbplanner agrees with a commercial solver within about 1 % on coated microstrip <Cite n={6} />.
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>Find the impedance your interface requires (50 Ω single-ended; 85, 90 or 100 Ω differential).</li>
        <li>Use your fab's actual stackup: the prepreg thickness and Dk under the outer layer set the width.</li>
        <li>Include solder mask for outer layers and the etch for all layers.</li>
        <li>Keep every impedance-controlled trace over a continuous reference plane: no splits or slots underneath.</li>
        <li>Order controlled impedance and give the fab the target and tolerance; they will fine-tune the width.</li>
      </ol>
      <TryIt to="/impedance">Calculate your trace width with the field solver</TryIt>
    </Guide>
  );
}
