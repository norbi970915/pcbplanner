import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function BobSmithGuide() {
  return (
    <Guide
      sources={[
        { text: 'R. W. Smith, US Patent 5,321,372, “Apparatus and method for terminating cables to minimize emissions and susceptibility”, filed 8 January 1993, issued 14 June 1994.', url: 'https://patents.google.com/patent/US5321372A/en' },
        { text: 'J. Satterwhite, “Bob Smith Termination vs Proper Termination”, Teltest Electronics Laboratories Engineer’s Notes, 30 January 2004 (Table 1, Figures 5–8, CAT6 section).', url: 'http://www.teli.us/EN_BSTermination04.pdf' },
        { text: 'J. Satterwhite, “Updating the Bob Smith termination technique”, EE Times, 30 April 2004.', url: 'https://www.eetimes.com/updating-the-bob-smith-termination-technique/' },
        { text: 'Z. Peterson, “Bob Smith Termination for Ethernet Circuits: Is it Correct?”, Altium Resources, 28 October 2020 (secondary summary of R. Bohnert’s measurements).', url: 'https://resources.altium.com/p/bob-smith-termination-it-correct-ethernet' },
        { text: 'Texas Instruments SNLA079D, AN-1469 PHYTER Design & Layout Guide, rev. April 2013 (Figure 2, §2.3, §2.4).', url: 'https://www.ti.com/lit/an/snla079d/snla079d.pdf' },
        { text: 'Texas Instruments DP83867IR/CR data sheet SNLS484J, rev. June 2026 (Figure 9-2, §9.2.2.2.1).', url: 'https://www.ti.com/lit/ds/symlink/dp83867ir.pdf' },
        { text: 'Microchip KSZ9031RNX data sheet DS00002117K (§12.0, Figure 12-1, Table 12-1).', url: 'https://ww1.microchip.com/downloads/aemDocuments/documents/UNG/ProductDocuments/DataSheets/KSZ9031RNX-Data-Sheet-DS00002117.pdf' },
        { text: 'Microchip ENT-AN1231 VSC8541 Design and Layout Guide, VPPD-04420 Rev. 1.1, September 2017 (§3.1.3, Figure 2).', url: 'https://ww1.microchip.com/downloads/en/Appnotes/VPPD-04420.pdf' },
        { text: 'Microchip ENT-AN0098 Magnetics Guide, VPPD-01740 Rev. 2.2, June 2018 (§2, §3.2–3.5, §3.8, §3.9, Figures 2 and 3).', url: 'https://ww1.microchip.com/downloads/en/AppNotes/VPPD-01740.pdf' },
        { text: 'Texas Instruments SNLA387, Ethernet PHY PCB Design Layout Checklist, June 2021.', url: 'https://www.ti.com/lit/pdf/snla387' },
        { text: 'Würth Elektronik 7499111121A WE-RJ45LAN data sheet, rev. 003.000, 2023-07-11 (1000BASE-T jack with integrated magnetics).', url: 'https://www.we-online.com/components/products/datasheet/7499111121A.pdf' },
        { text: 'Würth Elektronik 7499010211A WE-RJ45LAN data sheet, rev. 003.000, 2023-07-11 (100BASE-TX jack with integrated magnetics).', url: 'https://www.we-online.com/components/products/datasheet/7499010211A.pdf' },
      ]}
    >
      <p>
        Bob Smith termination connects each cable-side centre tap of the Ethernet magnetics through a 75 Ω resistor to one common node, and that node through a high-voltage
        capacitor — typically 1000 pF rated 2 kV — to chassis ground <Cite n={[7, 8]} />. It is meant to terminate the common mode of the cable pairs so that the cable radiates and
        picks up less <Cite n={1} />; every PHY data sheet and design guide checked here that shows the magnetics draws it, but whether 75 Ω is
        the right value, and whether the network makes a measurable difference at all, is disputed <Cite n={[2, 4]} />.
      </p>
      <p>This guide sets out what the patent claims, what the vendors draw and where they differ, the published critique, and what is safe to do on a board either way.</p>

      <h2>The circuit</h2>
      <p>
        A 1000BASE-T port has four transformers, one per pair. The windings on the cable side each have a centre tap, and the termination hangs off those four taps. The
        PHY-side taps are a separate matter: for voltage-mode PHYs (such as the DP83867 and KSZ9031), each goes to ground through its own 0.1 µF capacitor and is never tied to
        the others, because the common-mode voltage differs from pair to pair and with the speed mode <Cite n={[6, 7]} />. TI’s 10/100 PHYTER guide instead pulls the PHY-side
        centre taps to VDD <Cite n={5} />.
      </p>
      <ul>
        <li><b>Cable-side centre taps:</b> 4 × 75 Ω to a common node <Cite n={[6, 7, 8]} />.</li>
        <li><b>Common node:</b> 1000 pF / 2 kV to chassis ground <Cite n={[7, 8]} />.</li>
        <li><b>PHY-side centre taps (voltage-mode PHY):</b> 4 × 0.1 µF, one per tap, to signal ground <Cite n={[6, 7]} />.</li>
      </ul>
      <p>
        In magnetics with an auto-transformer stage (Microchip’s “12-core” type), the auto-transformer is what presents the low common-mode impedance into the termination; in
        “8-core” magnetics with the choke on the cable side, the 75 Ω connects to the transformer’s cable-side centre tap and the choke sits between it and the cable <Cite n={9} />.
      </p>

      <h2>What the patent claims</h2>
      <p>
        Robert W. Smith filed the idea in January 1993; it issued as US 5,321,372 in June 1994 <Cite n={1} />. In outline:
      </p>
      <ul>
        <li>Each twisted pair is terminated differentially in its matched input impedance, 100 Ω in the example.</li>
        <li>The signals also produce common-mode currents, which set up standing waves on the cable; left unterminated, the cable becomes a common-mode radiator.</li>
        <li>Terminating the common mode at <b>both</b> ends of the cable, in a load roughly equal to the pairs’ common-mode impedance, dissipates that energy. By reciprocity the cable also picks up less.</li>
        <li>For Category 5 cable the patent gives the common-mode impedance as approximately 145 Ω, and the embodiment uses four 75 Ω resistors from the centre taps to a common node. Two 145 Ω resistors may be substituted for the four 75 Ω, and chokes may be used instead of resistors.</li>
      </ul>
      <p>
        Two details are often missed. The patent states that the common node “could be, but does not necessarily have to be grounded”, and it does not mention a capacitor at all
        <Cite n={1} />. The 1000 pF / 2 kV capacitor in today’s vendor drawings is not from the patent; Microchip’s magnetics guide says plainly that the capacitor “is not a part of Bob Smith termination” but helps filter noise
        that leaks through the transformer <Cite n={9} />. The patent describes the benefit as “upwards of approximately 10 dB improvement in emissions and susceptibility”
        <Cite n={1} />, but gives no measurement data or test conditions for that figure.
      </p>

      <h2>What the vendors draw</h2>
      <p>Every vendor document uses 75 Ω. The capacitor and its ground connection vary.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Document</th>
            <th>Resistors</th>
            <th>Capacitor</th>
            <th>Node returned to</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Smith patent</td>
            <td>4 × 75 Ω, or 2 × 145 Ω</td>
            <td>None</td>
            <td>Optional ground <Cite n={1} /></td>
          </tr>
          <tr>
            <td>Microchip KSZ9031RNX</td>
            <td>4 × 75 Ω</td>
            <td>1000 pF / 2 kV</td>
            <td>Chassis ground <Cite n={7} /></td>
          </tr>
          <tr>
            <td>Microchip VSC8541 guide (VPPD-04420)</td>
            <td>4 × 75 Ω</td>
            <td>1000 pF, 2 kV</td>
            <td>Chassis ground <Cite n={8} /></td>
          </tr>
          <tr>
            <td>Microchip magnetics guide (AN0098)</td>
            <td>75 Ω per pair</td>
            <td>1000 pF, 2 kV</td>
            <td>Chassis ground; the capacitor is described as not part of the termination <Cite n={9} /></td>
          </tr>
          <tr>
            <td>TI DP83867 data sheet</td>
            <td>4 × 75 Ω</td>
            <td>1 nF / 2 kV</td>
            <td>A ground joined to the PHY ground through a parallel R and C, with values deferred to TI’s schematic checklist <Cite n={6} /></td>
          </tr>
          <tr>
            <td>TI AN-1469 (10/100 PHYTER)</td>
            <td>75 Ω each, the two unused pairs included</td>
            <td>Text: 1000 pF, at least 2 kV. Figure: 1500 pF, 2 kV</td>
            <td>Chassis ground in the text (§2.3); Figure 2 draws it to ordinary ground <Cite n={5} /></td>
          </tr>
          <tr>
            <td>Satterwhite (critique)</td>
            <td>4 × 52.3 Ω for CAT5/5e, about 66 Ω for CAT6</td>
            <td>Not discussed</td>
            <td>Not discussed <Cite n={2} /></td>
          </tr>
        </tbody>
      </table>
      <p>Four differences matter in practice:</p>
      <ol>
        <li>
          <b>The capacitor value.</b> 1000 pF is the common figure, but TI’s own PHYTER guide says 1000 pF in the text and draws 1500 pF in its schematic <Cite n={5} />. None of the
          documents explains how the value was chosen.
        </li>
        <li>
          <b>Which ground.</b> The Microchip documents and AN-1469 take the capacitor to chassis ground <Cite n={[5, 7, 8, 9]} />, although AN-1469’s Figure 2 draws it to
          ordinary ground rather than to its chassis symbol <Cite n={5} />. The DP83867 figure draws a parallel R and C between
          the two grounds and leaves the values to a separate checklist <Cite n={6} />.
        </li>
        <li>
          <b>Unused pairs at 10/100 Mb/s.</b> AN-1469 terminates the two unused pairs into the same node, and says the network also reduces susceptibility to noise from them
          <Cite n={5} />.
        </li>
        <li>
          <b>Power over Ethernet.</b> TI’s PHYTER guide says Bob Smith termination does not apply to PoE <Cite n={5} />. Microchip keeps it, but isolates the resistors from the PoE
          DC voltage with blocking capacitors of about 10 nF, which it says is small enough not to disturb the pair-to-pair matching <Cite n={9} />.
        </li>
      </ol>

      <h2>What the 1000 pF does</h2>
      <p>
        The capacitor’s reactance is X = 1 / (2π f C). For 1000 pF that is about 3.2 MΩ at 50 Hz, 159 Ω at 1 MHz, 16 Ω at 10 MHz and 1.6 Ω at 100 MHz. At mains frequency the node
        is effectively isolated from chassis. A common-mode signal on all four pairs sees the four 75 Ω resistors in parallel, 18.75 Ω, which is about the capacitor’s reactance
        at 10 MHz; from about 50–100 MHz upward (3.2 Ω down to 1.6 Ω) the capacitor is small next to the resistors, and the network behaves as a resistive termination to chassis.
      </p>
      <TryIt to="/reactance?C=1e-9&f=30000000">Check the capacitor’s reactance at your frequency</TryIt>
      <p>
        Because the capacitor connects the cable side of the transformer to chassis, it sits across the port’s isolation. Microchip quotes the IEEE requirement that a
        10/100/1000BASE-T port withstand 1,500 V AC for one minute from each port to chassis ground <Cite n={9} />; 1500 V rms is about 2.1 kV peak. Every vendor document that
        states a rating specifies 2 kV, and TI’s PHYTER guide asks for at least 2 kV <Cite n={[5, 7, 8]} />.
      </p>

      <h2>The critique: is 75 Ω the right value?</h2>
      <p>
        The best-known objection comes from Jim Satterwhite, written up as a Teltest engineer’s note and in EE Times in 2004; he says the work was done while he was at Cicada
        Semiconductor <Cite n={[2, 3]} />. His argument has three parts.
      </p>
      <p>
        <b>The 145 Ω figure is unsupported.</b> Smith does not say which common-mode configuration has a 145 Ω impedance. Satterwhite measured CAT5 cable with a network analyser in
        three configurations <Cite n={2} />:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Configuration</th>
            <th>Measured (CAT5)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>One pair against one other pair, the remaining two floating</td>
            <td>About 100 Ω</td>
          </tr>
          <tr>
            <td>One pair against the other three tied together</td>
            <td>About 70 Ω</td>
          </tr>
          <tr>
            <td>Two pairs tied against the other two tied</td>
            <td>About 50 Ω</td>
          </tr>
        </tbody>
      </table>
      <p>
        None is near 145 Ω, and he notes a variation of as much as ±15 % within a single cable <Cite n={2} />. One CAT6 cable gave 86.5 Ω for the one-against-three case <Cite n={2} />.
      </p>
      <p>
        <b>Four 75 Ω resistors match the wrong impedance.</b> Looking into one pair with the other three in parallel, the network presents R + R/3. With 75 Ω that is 100 Ω; to match
        the measured 70 Ω, R = 3 × 70 / 4 ≈ 52.5 Ω, for which he specifies 52.3 Ω <Cite n={2} />. His calculated common-mode return loss is 13.5–16.9 dB with 75 Ω against
        28 dB to more than 40 dB with 52.3 Ω, over a 65–75 Ω range of cable impedance. For CAT6 he suggests about 66 Ω, and a compromise value where both cable types are expected <Cite n={2} />.
      </p>
      <p>
        <b>A pulse test agrees.</b> With 52.3, 75 and 100 Ω sets at both ends of a 7 ft cable and a common-mode pulse with about 1 ns rise time, the 75 Ω and 100 Ω
        terminations reflect visibly and 52.3 Ω does not <Cite n={2} />.
      </p>
      <p>
        Two limits of this work are worth stating. It measures <b>reflection</b> of a common-mode wave, not radiated emissions from a product. And Satterwhite himself says Smith’s
        technique “does reduce the common mode radiation, but not optimally”, and calls for more cable types to be characterised <Cite n={2} />. His theoretical section, using an
        estimated 200 Ω pair-to-pair impedance, gives R + R/3 = 200/3 Ω (66.7 Ω), which gives R = 50 Ω rather than 52.3 Ω; the difference is small next to his ±15 % cable variation.
      </p>

      <h2>The critique: does it make any difference?</h2>
      <p>
        A second line of argument goes further. Measurements by Royce Bohnert are widely quoted for showing that 75 Ω, 52.3 Ω and <b>no termination at all</b> produced no apparent
        difference in return loss, in a comparison in the ~160 MHz marine band. We could not open Bohnert’s original
        presentation: Altium reports the original link as insecure, and the copy it points to returned an error when we tried it. This summary is therefore taken from Altium’s
        article <Cite n={4} />, which should be read as a secondary source. The same article concludes that there is no reason not to fit the network, with either value, and suggests simulating the chosen choke and termination, capacitor included <Cite n={4} />.
      </p>
      <p>
        Neither side, in the documents we could open, publishes a radiated-emissions comparison of the same product with and without the network. The vendor documents draw the
        termination without presenting data on it: Microchip’s EMC table compares magnetics types, not termination values <Cite n={9} />.
      </p>

      <h2>So does it help?</h2>
      <p>
        On the evidence available, the honest answer is that it is not shown either way. The patent claims a benefit, the vendors draw the circuit, one measured critique says the value
        is wrong for the impedance it is meant to match, and a second, available to us only second-hand, finds no difference in return loss at all.
      </p>
      <p>
        <b>Our recommendation:</b> fit the network as your PHY vendor draws it — the parts cost little and every vendor drawing we found includes them — but treat the
        resistor value and the capacitor as variables, not as a specification. If a product fails radiated emissions on the cable, the termination is a cheap thing to vary during EMC testing,
        alongside the magnetics themselves.
      </p>

      <h2>Board-level rules that are not in dispute</h2>
      <ul>
        <li>
          <b>Keep the PHY-side centre taps separate.</b> On voltage-mode PHYs each gets its own 0.1 µF to ground; Microchip also advises against magnetics whose centre taps are ganged inside the part{' '}
          <Cite n={[6, 7, 9]} />.
        </li>
        <li>
          <b>No metal under the magnetics</b> on any layer; metal under an RJ45 with integrated magnetics is allowed <Cite n={10} />.
        </li>
        <li>
          <b>Isolate earth ground</b> from the rest of the board with a keep-out of at least 20 mil on all layers, bridged only by a capacitor and a resistor of 1 MΩ or more{' '}
          <Cite n={10} />. Older TI guidance calls the isolated plane chassis ground and bridged it to system ground with two 1206 zero-ohm resistors either side of the RJ45,
          which can be removed or replaced if necessary <Cite n={5} />. The Bob Smith resistors connect to the cable side of the transformer, so they sit on the isolated side of the port together with the connector.
        </li>
        <li>
          <b>Check the capacitor’s withstand rating against the hipot test voltage</b> (1500 V rms is about 2.1 kV peak). Every vendor document that gives a rating uses 2 kV; the
          port must survive 1500 V rms from the port to chassis <Cite n={[5, 9]} />.
        </li>
        <li>
          <b>ESD protection on the PHY side.</b> The connector side can see high common-mode voltage swings, and a protector placed there can fail during them <Cite n={10} />.
        </li>
      </ul>
      <p>
        The 20 mil keep-out is a layout rule; SNLA387 gives no voltage basis for it <Cite n={10} />. If a safety standard your product falls under sets a spacing for this barrier,
        work it out with the <Link to="/creepage-clearance">creepage and clearance calculator</Link>; the <Link to="/guides/creepage-clearance-mains">mains creepage guide</Link>{' '}
        explains the IEC 60664-1 terms it uses. Nothing in the Ethernet documents above specifies that standard for you.
      </p>

      <h2>Jacks with integrated magnetics</h2>
      <p>
        Many RJ45 jacks with built-in magnetics already contain the termination. Würth’s 7499111121A, a 1000BASE-T jack, has four 75 Ω resistors from the cable-side centre taps
        to a common node and a 0.001 µF / 2 kV capacitor inside the housing, brought out to a pin the data sheet labels GND (pin 10); its insulation test is 1500 V rms for one minute
        <Cite n={11} />. Pin 10 also returns the four PHY-side 0.01 µF centre-tap capacitors, whose taps tie to pin 9 (VCC), so it is not a chassis-only pin <Cite n={11} />. The 100BASE-TX 7499010211A has the same arrangement for two pairs, with the two unused pairs also terminated through 75 Ω, and a 0.001 µF capacitor to
        pin 8 <Cite n={12} />.
      </p>
      <p>With a jack like this:</p>
      <ul>
        <li><b>Do not add a second network outside.</b> It would sit in parallel with the one in the housing and halve the resistance.</li>
        <li><b>Decide where the capacitor pin goes.</b> The jack names it GND; the PHY documents above return the termination to chassis ground <Cite n={[7, 8, 9]} />.</li>
        <li><b>Read the schematic in the data sheet.</b> Both Würth parts show the network there <Cite n={[11, 12]} />; check the part you use rather than assuming.</li>
      </ul>
      <p>
        Integrated jacks save space but are not automatically better for EMC. Microchip notes that their magnetic cores are smaller and closer together, which can limit the choke’s
        effectiveness, against the benefit of the metal shield, and that emissions can be better or worse depending on the product <Cite n={9} />; and TI recommends a discrete transformer for better EMC performance with the DP83867 <Cite n={6} />.
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>Four 75 Ω resistors from the cable-side centre taps to one node, unless you have measured a better value for your cable and magnetics.</li>
        <li>1000 pF from that node to chassis ground, rated at least 2 kV.</li>
        <li>PHY-side centre taps separate, each with its own 0.1 µF to ground (voltage-mode PHYs; follow your PHY’s data sheet otherwise).</li>
        <li>With PoE, follow your PHY and PSE vendor; Microchip isolates the resistors from the PoE DC voltage with blocking capacitors of about 10 nF.</li>
        <li>Integrated-magnetics jack: check whether the network is already inside before adding one.</li>
        <li>Earth-ground (chassis) island isolated by at least 20 mil on all layers; no metal under discrete magnetics; ESD parts on the PHY side.</li>
      </ol>
      <TryIt to="/interface-rules/ethernet-1000base-t">See every 1000BASE-T layout rule with its source</TryIt>
      <p>
        The impedance, pair-matching and length rules for the MDI traces themselves are in the <Link to="/interface-rules">interface rules</Link> tool, which applies them to your
        stackup.
      </p>
    </Guide>
  );
}
