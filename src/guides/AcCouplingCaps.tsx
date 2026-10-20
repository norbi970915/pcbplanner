import { Cite, Guide, TryIt } from './Guide';

export default function AcCouplingCaps() {
  return (
    <Guide
      sources={[
        { text: 'PCI-SIG, PCI Express Card Electromechanical (CEM) Specification, Revision 3.0, 2013 (§4.7.1 AC coupling on the transmit pair).', url: 'https://pcisig.com/specifications' },
        { text: 'PCI-SIG, PCI Express Base Specification, Revision 2.0, 2006 (Table 4-9, AC coupling capacitor 75–200 nF).', url: 'https://pcisig.com/specifications' },
        { text: 'USB 3.2 Specification, Revision 1.1, June 2022 (Table 6-18 transmitter, Table 6-22 receiver).', url: 'https://www.usb.org/document-library/usb-32-revision-11-june-2022' },
        { text: 'Universal Serial Bus Specification, Revision 2.0, 2000 (§7.1.6.1, edge-rate capacitance; §7.1.6.2, high-speed capacitance to ground).', url: 'https://www.usb.org/document-library/usb-20-specification' },
        { text: 'SATA-IO, Serial ATA Revision 3.1, Gold Revision (Table 35; §7.2.2.1.10 capacitor size and return loss).', url: 'https://sata-io.org/system/files/specifications/SerialATA_Revision_3_1_Gold.pdf' },
        { text: 'USB Type-C Cable and Connector Specification, Release 2.0, August 2019 (§E.2.2, placement for alternate modes).', url: 'https://www.usb.org/sites/default/files/USB%20Type-C%20Spec%20R2.0%20-%20August%202019.pdf' },
        { text: 'Texas Instruments SNLA426, High-Speed PCB Layout for PCIe Gen 5, 2023.', url: 'https://www.ti.com/lit/pdf/snla426' },
        { text: 'Texas Instruments SLLA414A, High-Speed Layout Guidelines for Signal Conditioners and USB Hubs, rev. 2026.', url: 'https://www.ti.com/lit/an/slla414/slla414.pdf' },
        { text: 'Texas Instruments DP83869HM data sheet SNLS614 (§9.4, SGMII coupling capacitors).', url: 'https://www.ti.com/lit/ds/symlink/dp83869hm.pdf' },
        { text: 'NXP AN10798, DisplayPort PCB layout guidelines, Rev. 01, 2009 (§2.4).', url: 'https://www.nxp.com/docs/en/application-note/AN10798.pdf' },
        { text: 'Texas Instruments TMDS1204 data sheet SLLSF57A (§5.3, AC-coupling capacitor 85–253 nF; §7.2.7, §7.2.13.1, AC-coupled transmit mode).', url: 'https://www.ti.com/lit/ds/symlink/tmds1204.pdf' },
        { text: 'Microchip KSZ9031RNX data sheet DS00002117 (§12.0, transformer centre taps).', url: 'https://ww1.microchip.com/downloads/aemDocuments/documents/UNG/ProductDocuments/DataSheets/KSZ9031RNX-Data-Sheet-DS00002117.pdf' },
        { text: 'Texas Instruments SPRACP4A, Jacinto 7 High-Speed Interface Design Guidelines, rev. 2024 (§3.4.1 CSI-2 and DSI high-level schematics).', url: 'https://www.ti.com/lit/pdf/spracp4' },
      ]}
    >
      <p>
        A series capacitor on a high-speed pair looks like the most boring part on the board, and it is the one most often chosen wrong. The value is copied from another design, the
        package is whatever was in the library, and the schematic gives no hint that one interface forbids the part entirely while another fails compliance if its body is one size too
        large.
      </p>
      <p>This guide collects what each specification actually requires, why the value has both a floor and a ceiling, and why the footprint matters more than the capacitance.</p>

      <h2>What the capacitor is there for</h2>
      <p>
        AC coupling lets the two ends of a link sit at different common-mode voltages. A transmitter built on one process drives a common mode its partner may not tolerate, and on a
        cable the two ends may not even share a ground. Blocking DC also lets a receiver detect whether anything is attached: USB 3.2 and PCIe both detect a partner by looking for the
        receiver's DC termination, which only works if the link is DC-isolated <Cite n={3} />.
      </p>
      <p>
        That is why the serial interfaces that cross a connector nearly all mandate it on the transmit side, and why the interfaces that stay on one board — DDR, MIPI, RGMII — do
        not use it at all.
      </p>

      <h2>The value, interface by interface</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th>Interface</th>
            <th>Series capacitor</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PCIe Gen 1 / Gen 2</td>
            <td>Required, transmit pair</td>
            <td>75–200 nF <Cite n={[1, 2]} /></td>
          </tr>
          <tr>
            <td>PCIe Gen 3 and later</td>
            <td>Required, transmit pair</td>
            <td>176–265 nF at 8 GT/s <Cite n={1} />; TI uses 75–220 nF, typically 220 nF, which fits every generation <Cite n={7} /></td>
          </tr>
          <tr>
            <td>USB 2.0 High Speed</td>
            <td><b>Not allowed</b></td>
            <td>No series capacitor; at High Speed keep at most 10 pF per line to ground (§7.1.6.2). The 75 pF edge-rate allowance is for low and full speed only <Cite n={4} /></td>
          </tr>
          <tr>
            <td>USB 3.2 Gen 1 / Gen 2</td>
            <td>Required on every transmitter</td>
            <td>75–265 nF. A receiver may be coupled too, but then the window is 297–363 nF <Cite n={3} /></td>
          </tr>
          <tr>
            <td>SATA 3.0</td>
            <td>Required for every SATA variant except Gen1i, where it is optional</td>
            <td><b>12 nF maximum</b>, and the specification advises against values under 300 pF <Cite n={5} /></td>
          </tr>
          <tr>
            <td>SGMII</td>
            <td>Required on every connection</td>
            <td>0.1 µF, in an 0402 package or smaller <Cite n={9} /></td>
          </tr>
          <tr>
            <td>DisplayPort main link</td>
            <td>Required</td>
            <td>75–200 nF, 100 nF preferred <Cite n={10} /></td>
          </tr>
          <tr>
            <td>HDMI (TMDS)</td>
            <td><b>None</b></td>
            <td>DC-coupled: the sink biases the pair through its 50 Ω pull-ups <Cite n={11} /></td>
          </tr>
          <tr>
            <td>1000BASE-T (MDI)</td>
            <td><b>None in series</b></td>
            <td>The transformer isolates. For voltage-mode PHYs, each PHY-side centre tap gets its own 0.1 µF to ground <Cite n={12} /></td>
          </tr>
          <tr>
            <td>MIPI D-PHY</td>
            <td><b>None</b></td>
            <td>TI's CSI-2 and DSI schematics connect each lane straight through, with only vias in the path <Cite n={13} />. The low-power mode is DC-coupled single-ended signalling, which a series capacitor would block</td>
          </tr>
          <tr>
            <td>DDR4 / LPDDR4</td>
            <td><b>None</b></td>
            <td>Single-ended, referenced to VDDQ</td>
          </tr>
        </tbody>
      </table>
      <p>
        Note how far apart SATA and USB sit: <b>12 nF maximum</b> for SATA, <b>75 nF minimum</b> for USB 3.2. A 100 nF part that is correct on a SuperSpeed pair is eight times the
        SATA limit. This is the single most common substitution error, and it happens because both links look identical on a schematic.
      </p>

      <h2>Why there is a minimum and a maximum</h2>
      <p>
        The capacitor and the line form a high-pass filter. Each line of the pair sees its own capacitor between a 50 Ω source and a 50 Ω load, so the time constant is 100 Ω · C and
        the corner frequency is <b> f = 1 / (2π · 100 Ω · C)</b>: about 16 kHz for 100 nF, 6 kHz for 265 nF, and 133 kHz for SATA's 12 nF ceiling.
      </p>
      <p>
        The <b>minimum</b> protects the low-frequency end. Scrambled or 8b/10b-coded data still contains long runs of the same polarity, and if the corner creeps into that content the
        baseline wanders and the eye closes from the top and bottom. The <b>maximum</b> presumably exists because the capacitor has to charge and discharge; USB 3.2 requires a coupled receiver to discharge to
        500 mV within 250 ms, tested against a transmitter at its largest permitted capacitance <Cite n={3} />, and a larger part is also a larger pad.
      </p>

      <h2>The package matters more than the value</h2>
      <p>
        At 2.5 GHz and above, the capacitor is not really a capacitor — it is a discontinuity with a value written on it. The pads are wider than the trace, and the reference plane
        beneath them adds capacitance exactly where the line should stay at 90 or 100 Ω.
      </p>
      <p>The SATA specification is unusually blunt about this: bodies larger than 0603, it says, are likely to fail the return-loss requirement <Cite n={5} />. In practice:</p>
      <ul>
        <li><b>0402 or smaller</b>, and 0201 where the layout allows it; 0603 is the largest any of these documents tolerates <Cite n={[5, 8]} />.</li>
        <li><b>Void the reference plane under the pads</b>, 100 % of the pad area and at least two layers deep <Cite n={8} />.</li>
        <li><b>Both capacitors of a pair identical</b> — use the same value and package for both capacitors of a pair and place them symmetrically <Cite n={[8, 10]} />.</li>
        <li>Keep the stub into the pad symmetrical and short <Cite n={7} />.</li>
      </ul>
      <TryIt to="/impedance">See what a wider pad does to the impedance of your pair</TryIt>

      <h2>Which side, and where</h2>
      <p>
        The capacitor belongs on the <b>transmit</b> side of each direction — that is what PCIe and USB both require <Cite n={[1, 3]} />. Where along the trace depends on what it is
        driving:
      </p>
      <ul>
        <li><b>Chip to connector:</b> next to the connector or the edge fingers <Cite n={7} />.</li>
        <li><b>Chip to chip on one board:</b> as close to the receiver as possible <Cite n={7} />.</li>
        <li>
          <b>USB Type-C with an orientation switch or alternate-mode mux:</b> between the mux and the receptacle, so the mux operates inside the common-mode limits set by the local PHY{' '}
          <Cite n={6} />.
        </li>
      </ul>

      <h2>Four ways to get it wrong</h2>
      <ol>
        <li><b>Coupling twice.</b> An SFP transceiver usually has integrated AC-coupling capacitors, so external ones may not be needed <Cite n={9} />. If you add a second set anyway, two equal capacitors in series halve the capacitance.</li>
        <li><b>A SATA-sized part on a USB pair, or the reverse.</b> 12 nF and 100 nF are both “the coupling cap” in a library, and only one is right for each link.</li>
        <li><b>Coupling something that must not be coupled.</b> A capacitor on a MIPI D-PHY lane breaks low-power mode; on HDMI it removes the bias the sink provides. If an HDMI redriver is used in AC-coupled transmit mode, it needs 85–253 nF <i>and</i> a 499 Ω pull-down to ground on each output between the capacitor and the receptacle <Cite n={11} />.</li>
        <li><b>Tying the Ethernet centre taps together.</b> For voltage-mode PHYs, each PHY-side centre tap needs its own 0.1 µF to ground; the common-mode voltage differs between pairs and with the speed mode <Cite n={12} />.</li>
      </ol>

      <h2>Checklist</h2>
      <ol>
        <li>Check whether the interface wants a capacitor at all before placing one.</li>
        <li>Take the value from that interface's own specification, not from the last design.</li>
        <li>0402 or smaller, identical parts, symmetrically placed on both lines.</li>
        <li>Reference plane voided under the pads, at least two layers deep.</li>
        <li>Transmit side; at the connector for a cabled link, at the receiver for a chip-to-chip link.</li>
        <li>On Type-C, between the mux and the receptacle.</li>
        <li>Nothing else in series on the pair: no test points, no ferrites, no ESD parts in line unless the interface allows them.</li>
      </ol>
      <TryIt to="/interface-rules">Look up the coupling capacitor and the rest of the rules for your interface</TryIt>
    </Guide>
  );
}
