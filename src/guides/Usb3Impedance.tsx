import { Cite, Guide, TryIt } from './Guide';

export default function Usb3Impedance() {
  return (
    <Guide
      sources={[
        { text: 'USB 3.2 Specification, Revision 1.1, June 2022 (Table 6-18 transmitter, Table 6-22 receiver, §E.6.4 insertion-loss budget).', url: 'https://www.usb.org/document-library/usb-32-revision-11-june-2022' },
        { text: 'USB Type-C Cable and Connector Specification, Release 2.0, August 2019 (§3.7 normalisation, §3.7.1 cable, §3.7.3.1 mated connector).', url: 'https://www.usb.org/sites/default/files/USB%20Type-C%20Spec%20R2.0%20-%20August%202019.pdf' },
        { text: 'USB-IF, Managing Connector and Cable Assembly Performance for USB SuperSpeed, Rev. 1.0, 2013.', url: 'https://www.usb.org/sites/default/files/USB_SuperSpeed_CabCon_Whitepaper.pdf' },
        { text: 'Texas Instruments SLLA414A, High-Speed Layout Guidelines for Signal Conditioners and USB Hubs, rev. 2026.', url: 'https://www.ti.com/lit/an/slla414/slla414.pdf' },
        { text: 'Texas Instruments SPRAAR7J, High-Speed Interface Layout Guidelines, rev. 2023 (Appendix A, per-device impedance tables).', url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf' },
        { text: 'Genesys Logic GL3520 USB 3.0 Hub Design Guide, Rev. 2.11, 2015.', url: 'http://www.jfd-ic.com/documents/GL3520_USB%203.0%20Hub%20Design%20Guide_211.pdf' },
      ]}
    >
      <p>
        Search for the impedance of a USB 3 pair and you will find both 85 Ω and 90 Ω, each stated as if it were the obvious answer. Both numbers are real and both come from USB-IF
        documents — they simply describe different parts of the link.
      </p>
      <p>
        <b>Route your board to 90 Ω differential.</b> 85 Ω is the target for the mated Type-C connector and the reference impedance the Type-C S-parameters are normalised to, not a
        trace specification.
      </p>

      <h2>Where each number comes from</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th>Value</th>
            <th>What it applies to</th>
            <th>Document</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>72–120 Ω</td>
            <td>The silicon: transmitter and receiver DC differential impedance</td>
            <td>USB 3.2, Tables 6-18 and 6-22 <Cite n={1} /></td>
          </tr>
          <tr>
            <td>85 Ω</td>
            <td>The impedance all Type-C S-parameters are normalised to</td>
            <td>Type-C R2.0 §3.7 <Cite n={2} /></td>
          </tr>
          <tr>
            <td>85 Ω ± 9 Ω</td>
            <td>The <i>mated connector</i>, measured with a 40 ps edge</td>
            <td>Type-C R2.0 §3.7.3.1 <Cite n={2} /></td>
          </tr>
          <tr>
            <td>90 Ω ± 5 Ω</td>
            <td>The raw cable (45 Ω ± 3 Ω single-ended for coaxial construction)</td>
            <td>Type-C R2.0 §3.7.1 <Cite n={2} /></td>
          </tr>
          <tr>
            <td>75–105 Ω</td>
            <td>The mated legacy USB 3.0 connector, including its PCB footprint</td>
            <td>USB-IF connector whitepaper <Cite n={3} /></td>
          </tr>
          <tr>
            <td>90 Ω nominal</td>
            <td>The design target for the link as a whole</td>
            <td>USB-IF connector whitepaper <Cite n={3} /></td>
          </tr>
          <tr>
            <td>90 Ω ± 10 % / ± 15 %</td>
            <td>PCB traces, as chip vendors specify them</td>
            <td>Genesys Logic <Cite n={6} />, TI <Cite n={4} /></td>
          </tr>
        </tbody>
      </table>
      <p>
        So the trace number that USB-IF itself states is 90 Ω: “USB 3.0 specification defines a 90-ohm nominal characteristic impedance. If every component in the SuperSpeed link is
        designed with a 90-ohm impedance, there won't be any reflection” <Cite n={3} />. The 85 Ω figure only ever appears attached to the connector or to the S-parameter reference.
      </p>
      <p>
        One wrinkle worth knowing: some SoC vendors publish their own number. TI's layout guidelines use 90 Ω on older devices and 95 Ω on newer ones, with a ±5 % window
        <Cite n={5} />. If your controller's datasheet states an impedance, follow it — it describes that device's package and receiver.
      </p>

      <h2>How much does the difference actually cost?</h2>
      <p>The interesting part is how small this argument is. A trace at 90 Ω meeting a connector at 85 Ω produces a reflection of</p>
      <p>
        Γ = (85 − 90) / (85 + 90) = 0.029, which is <b>−31 dB</b> of return loss.
      </p>
      <p>Put next to the other discontinuities on the same link:</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Discontinuity</th>
            <th className="v">Return loss</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>90 Ω trace into an 85 Ω connector</td>
            <td className="v">−31 dB</td>
          </tr>
          <tr>
            <td>A 90 Ω trace built 10 % low by the fabricator (81 Ω)</td>
            <td className="v">−26 dB</td>
          </tr>
          <tr>
            <td>A trace that arrives at 75 Ω</td>
            <td className="v">−21 dB</td>
          </tr>
          <tr>
            <td>A connector launch with no plane voiding, sinking to 40 Ω <Cite n={3} /></td>
            <td className="v">−8 dB</td>
          </tr>
        </tbody>
      </table>
      <p>
        Your fabricator's ±10 % tolerance moves the impedance further than the entire 85-versus-90 question, and a badly voided connector footprint moves it twenty decibels further
        again. Which is to say: pick 90 Ω, then spend your attention on tolerance and on the launch.
      </p>
      <TryIt to="/impedance">Design a 90 Ω pair on your stackup and see the tolerance</TryIt>

      <h2>What actually decides whether the link passes</h2>
      <p>USB 3.2 gives an informative budget of 8.5 dB for a host or device and 23 dB for the whole channel, at 2.5 GHz for Gen 1 and 5 GHz for Gen 2 <Cite n={1} />. Against that:</p>
      <ul>
        <li>
          <b>The connector launch.</b> Without ground voiding under the receptacle pads, the launch impedance can fall to about 40 Ω — the whitepaper calls the voiding imperative
          <Cite n={3} />.
        </li>
        <li>
          <b>The coupling capacitors.</b> Mandatory on every transmitter, 75–265 nF, and no larger than 0603 — TI asks for 0402 or smaller with the plane voided under the pads
          <Cite n={[1, 4]} />.
        </li>
        <li>
          <b>Via stubs.</b> Keep them under 15 mil or back-drill them; at 5 GHz the stub costs more than the via <Cite n={4} />.
        </li>
        <li>
          <b>Loss.</b> On ordinary FR-4 a Gen 2 pair spends roughly 0.7 dB per inch at 5 GHz, so a long run eats the budget before anything else does.
        </li>
      </ul>

      <h2>The rest of the rules, briefly</h2>
      <ul>
        <li><b>Intra-pair matching:</b> about 5 mil, or 15 ps per metre. The specification sets no board limit; the raw cable is held to 10 ps per metre <Cite n={[2, 4]} />.</li>
        <li><b>Pair-to-pair:</b> no requirement at all. The transmit and receive pairs do not have to be the same length <Cite n={4} />.</li>
        <li><b>Polarity:</b> the two lines of a pair may be swapped to avoid a crossover <Cite n={4} />.</li>
        <li><b>Spacing:</b> five trace widths between pairs, 30 mil to any other signal, 50 mil to a clock <Cite n={4} />.</li>
        <li><b>Reference:</b> one solid ground reference end to end, with stitching vias within 200 mil of every layer change <Cite n={4} />.</li>
      </ul>

      <h2>Checklist</h2>
      <ol>
        <li>Design the traces to 90 Ω differential, ±10 %, unless your controller's datasheet states otherwise.</li>
        <li>Treat 85 Ω as the connector's number, not the trace's.</li>
        <li>Void the reference plane under the receptacle pads and under the coupling capacitors.</li>
        <li>Coupling capacitors 75–265 nF, 0402 or smaller, on the transmit pairs.</li>
        <li>Match within a pair to about 5 mil; ignore matching between pairs.</li>
        <li>Keep via stubs under 15 mil, and ask the fabricator for controlled impedance rather than hoping.</li>
      </ol>
      <TryIt to="/interface-rules">Check a USB 3.2 pair against every rule on your own stackup</TryIt>
    </Guide>
  );
}
