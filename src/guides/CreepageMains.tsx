import { Cite, Guide, TryIt } from './Guide';

export default function CreepageMains() {
  return (
    <Guide
      sources={[
        { text: 'IEC 60664-1:2007 (Ed. 2), Insulation coordination for equipment within low-voltage systems – Part 1: Principles, requirements and tests. Tables F.1, F.2, F.4, A.2; clauses 5.1.6, 5.2.2.6, 6.2. Ed. 3 (2020) keeps the same table values.', url: 'https://webstore.iec.ch/en/publication/2522' },
        { text: 'IEC 62368-1, Audio/video, information and communication technology equipment – Part 1: Safety requirements.' },
        { text: 'IEC 60664-3, Use of coating, potting or moulding for protection against pollution.' },
        { text: 'IPC-2221, Generic Standard on Printed Board Design, Table 6-1 (electrical conductor spacing).' },
      ]}
    >
      <p>
        Any board that touches mains voltage needs a minimum spacing between the mains side and everything else, and between mains conductors themselves. There are two different
        distances, and they are sized by different rules. This guide walks through IEC 60664-1, the basic insulation-coordination standard that product safety standards build on, with
        worked examples for 230 V and 120 V.
      </p>
      <p>
        <b>Important:</b> your product standard (for example IEC 62368-1 for IT and audio/video equipment <Cite n={2} />) has the final word and can require more. Use this to design
        sensibly and to understand the numbers, not as a certification.
      </p>

      <h2>Clearance and creepage</h2>
      <ul>
        <li>
          <b>Clearance</b> is the shortest distance <em>through air</em> between two conductors. It must survive short voltage spikes (transients from the mains), so it is sized from an{' '}
          <b>impulse voltage</b>.
        </li>
        <li>
          <b>Creepage</b> is the shortest distance <em>along the surface</em> of the insulation, the PCB surface. It must resist tracking: slow carbonisation of the surface under
          continuous voltage, moisture and dirt. It is sized from the <b>RMS working voltage</b>.
        </li>
      </ul>
      <p>On a flat PCB the two paths are often the same line, but they are checked separately, and a creepage distance may never be shorter than the clearance <Cite n={1} />.</p>

      <h2>Step 1: the impulse voltage</h2>
      <p>
        For equipment connected directly to the mains, Table F.1 gives the rated impulse voltage from the line-to-neutral voltage and the <b>overvoltage category</b> <Cite n={1} />.
        Category II covers appliances and equipment plugged into sockets; category III is fixed installation wiring.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Mains</th>
            <th>Table F.1 row</th>
            <th className="v">OVC II</th>
            <th className="v">OVC III</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>120 V (US)</td>
            <td>≤ 150 V line-to-neutral</td>
            <td className="v">1500 V</td>
            <td className="v">2500 V</td>
          </tr>
          <tr>
            <td>230 V (EU)</td>
            <td>≤ 300 V line-to-neutral</td>
            <td className="v">2500 V</td>
            <td className="v">4000 V</td>
          </tr>
        </tbody>
      </table>

      <h2>Step 2: clearance</h2>
      <p>
        Table F.2 turns the impulse voltage into a minimum clearance for the pollution degree. <b>Pollution degree 2</b> (only non-conductive pollution, occasional condensation) is
        normal for electronics indoors. For a non-uniform field (case A, the usual PCB case) and up to 2000 m altitude <Cite n={1} />:
      </p>
      <ul>
        <li>1500 V → 0.5 mm</li>
        <li>2500 V → 1.5 mm</li>
        <li>4000 V → 3.0 mm</li>
      </ul>
      <p>Above 2000 m, Table A.2 multiplies the clearance: ×1.14 at 3000 m and ×1.29 at 4000 m.</p>

      <h2>Step 3: creepage</h2>
      <p>
        Table F.4 gives creepage from the working voltage, the pollution degree and the <b>material group</b>, set by the comparative tracking index (CTI) of the board material.
        Standard FR-4 is typically group IIIa (175 ≤ CTI &lt; 400). Printed wiring material has its own, smaller columns for pollution degrees 1 and 2 <Cite n={1} />. At 250 V rms and
        pollution degree 2:
      </p>
      <ul>
        <li>Printed wiring material: 1.0 mm</li>
        <li>General column, material group IIIa: 2.5 mm</li>
      </ul>
      <p>
        Use the working voltage your product standard specifies. For 230 V mains that is often 250 V (the rated or rationalised voltage), not 230 V. Linear interpolation between table
        rows is allowed for creepage.
      </p>

      <h2>Step 4: basic or reinforced</h2>
      <p>
        <b>Basic insulation</b> is enough between mains and parts that are themselves protected, for example by a protective earth. Between mains and anything a user can touch
        (SELV outputs, USB, a metal case that is not earthed) you need <b>double or reinforced insulation</b>. For reinforced insulation, IEC 60664-1 raises the impulse voltage one step in the
        preferred series for the clearance and doubles the creepage <Cite n={1} />.
      </p>

      <h2>Worked examples</h2>
      <p>Pollution degree 2, bare PCB (printed wiring material), up to 2000 m, IEC 60664-1 only:</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Case</th>
            <th className="v">Clearance</th>
            <th className="v">Creepage (table)</th>
            <th className="v">Creepage (final)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>230 V, OVC II, basic (250 V working)</td>
            <td className="v">1.5 mm</td>
            <td className="v">1.0 mm</td>
            <td className="v">1.5 mm*</td>
          </tr>
          <tr>
            <td>230 V, OVC II, reinforced</td>
            <td className="v">3.0 mm (4 kV)</td>
            <td className="v">2.0 mm</td>
            <td className="v">3.0 mm*</td>
          </tr>
          <tr>
            <td>120 V, OVC II, basic (150 V working)</td>
            <td className="v">0.5 mm</td>
            <td className="v">0.36 mm</td>
            <td className="v">0.5 mm*</td>
          </tr>
          <tr>
            <td>120 V, OVC II, reinforced</td>
            <td className="v">1.5 mm (2.5 kV)</td>
            <td className="v">0.71 mm</td>
            <td className="v">1.5 mm*</td>
          </tr>
        </tbody>
      </table>
      <p>
        * Raised to the clearance, because creepage cannot be shorter than clearance. Product standards often ask for more than these base values, and solder mask on its own is not normally
        credited as insulation.
      </p>
      <TryIt to="/creepage-clearance">Calculate clearance and creepage for your voltage</TryIt>

      <h2>Getting more creepage on a small board</h2>
      <ul>
        <li>
          <b>Slots.</b> A milled slot between the conductors forces the creepage path down and around it, but only if it is wide enough. IEC 60664-1 ignores grooves narrower than a
          width X: 0.25 mm for pollution degree 1, 1.0 mm for degree 2 and 1.5 mm for degree 3, reduced to one third of the clearance when the clearance is below 3 mm <Cite n={1} />.
          A standard 1 mm router slot therefore counts at pollution degree 2.
        </li>
        <li>
          <b>Conformal coating</b> qualified to IEC 60664-3 can allow the pollution-degree-1 values under the coating <Cite n={3} />.
        </li>
        <li>
          <b>High-CTI laminate</b> (group I or II) reduces the general-column creepage at pollution degree 3.
        </li>
      </ul>

      <h2>Not mains? IPC-2221 is the other tool</h2>
      <p>
        For low-voltage circuits with no safety requirement, IPC-2221 Table 6-1 gives electrical conductor spacing by voltage and location (internal, external, coated) <Cite n={4} />.
        It is a design standard, not a safety standard, and its values are much smaller than IEC 60664-1 at mains voltages.
      </p>
    </Guide>
  );
}
