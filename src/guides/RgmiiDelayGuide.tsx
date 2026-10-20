import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function RgmiiDelayGuide() {
  return (
    <Guide
      sources={[
        { text: 'RGMII specification, Version 2.0, Hewlett-Packard, Broadcom and Marvell, 1 April 2002 (revision history, §3.3 Table 2 and notes 1 and 4, Figures 2 and 3).', url: 'https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/imx-processors/20655/1/RGMIIv2_0_final_hp.pdf' },
        { text: 'RGMII specification, Version 1.3, 10 December 2000 (§3.3 Table 2 and note 1), archived copy linked from the Linux PHY documentation.', url: 'http://web.archive.org/web/20160303212629/http://www.hp.com/rnd/pdfs/RGMIIv1_3.pdf' },
        { text: 'Linux kernel, Documentation/devicetree/bindings/net/ethernet-controller.yaml (phy-connection-type and phy-mode values, rx-/tx-internal-delay-ps, and the informative section on RGMII delays).', url: 'https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/Documentation/devicetree/bindings/net/ethernet-controller.yaml' },
        { text: 'Linux kernel, Documentation/networking/phy.rst (“(RG)MII/electrical interface considerations” and “Common problems with RGMII delay mismatch”).', url: 'https://github.com/torvalds/linux/blob/master/Documentation/networking/phy.rst' },
        { text: 'Texas Instruments DP83867IR/CR data sheet SNLS484J, revised June 2026 (§6.9 RGMII timing, §7.4.1.1.2 1000 Mb/s timing, Table 8-45 RGMIIDCTL, §9.2.2.1.1 RGMII layout guidelines).', url: 'https://www.ti.com/lit/ds/symlink/dp83867ir.pdf' },
        { text: 'Microchip KSZ9031RNX data sheet DS00002117K, 2024 (§3.9.3 RGMII pad skew registers, Tables 3-5 and 3-6, §7.1 RGMII timing).', url: 'https://ww1.microchip.com/downloads/aemDocuments/documents/UNG/ProductDocuments/DataSheets/KSZ9031RNX-Data-Sheet-DS00002117.pdf' },
        { text: 'Microsemi (now Microchip) ENT-AN1231, VSC8541 Design and Layout Guide, VPPD-04420 Revision 1.1, September 2017 (§6.1 RGMII interface clock considerations).', url: 'https://ww1.microchip.com/downloads/en/Appnotes/VPPD-04420.pdf' },
      ]}
    >
      <p>
        <b>
          RGMII sends clock and data edge-aligned, so the clock has to be delayed: before RGMII 2.0 the board adds 1.5–2.0 ns of extra clock trace delay, so the clock arrives
          1.0–2.6 ns after the data (T<sub>skewR</sub>), and since 2.0 a device may add the delay internally, which the specification calls RGMII-ID.
        </b>{' '}
        <Cite n={[1, 2]} /> In a Linux device tree, <code>phy-mode</code> (or <code>phy-connection-type</code>) records which delays the board already provides, and the driver makes
        the MAC or the PHY add the rest, so that each clock is delayed exactly once. <Cite n={[3, 4]} />
      </p>
      <p>
        This guide works through the timing, computes how long a board delay line has to be, and maps the four values <code>rgmii</code>, <code>rgmii-id</code>,{' '}
        <code>rgmii-rxid</code> and <code>rgmii-txid</code> to the hardware they describe.
      </p>

      <h2>Why the clock has to be delayed</h2>
      <p>
        RGMII carries gigabit Ethernet on four data lines per direction plus a control line and a clock. At 1 Gb/s the clock runs at 125 MHz and both edges are used: bits 3:0 travel on
        the rising edge and bits 7:4 on the falling edge. <Cite n={1} /> With an 8 ns clock cycle, each nibble is on the wire for about 4 ns.
      </p>
      <p>
        The transmitter launches clock and data at the same moment: “clock and data are generated simultaneously by the source of the signals and therefore skew between the clock and
        data is critical to proper operation.” <Cite n={1} /> If they arrive together, the receiver samples exactly where the data is changing, with no setup or hold time. Moving the clock
        edge about 2 ns later puts it near the middle of the 4 ns data window. The Linux documentation describes the delay in the same terms: it is there “to let the PHY (clock sink)
        have a large enough setup and hold time to sample the data lines correctly.” <Cite n={4} />
      </p>
      <p>Table 2 of the specification gives the numbers. The skew rows apply to the original scheme, the setup and hold rows to devices with integrated delay:</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Parameter</th>
            <th className="v">Min</th>
            <th className="v">Typ</th>
            <th className="v">Max</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>T<sub>skewT</sub>, data to clock skew at the transmitter</td>
            <td className="v">−500 ps</td>
            <td className="v">0</td>
            <td className="v">500 ps</td>
          </tr>
          <tr>
            <td>T<sub>skewR</sub>, data to clock skew at the receiver</td>
            <td className="v">1.0 ns</td>
            <td className="v">1.8 ns</td>
            <td className="v">2.6 ns</td>
          </tr>
          <tr>
            <td>T<sub>setupT</sub> / T<sub>holdT</sub>, at the transmitter, integrated delay</td>
            <td className="v">1.2 ns</td>
            <td className="v">2.0 ns</td>
            <td className="v">—</td>
          </tr>
          <tr>
            <td>T<sub>setupR</sub> / T<sub>holdR</sub>, at the receiver, integrated delay</td>
            <td className="v">1.0 ns</td>
            <td className="v">2.0 ns</td>
            <td className="v">—</td>
          </tr>
          <tr>
            <td>T<sub>cyc</sub>, clock cycle at 1 Gb/s</td>
            <td className="v">7.2 ns</td>
            <td className="v">8 ns</td>
            <td className="v">8.8 ns</td>
          </tr>
          <tr>
            <td>Rise and fall time, 20–80 %</td>
            <td className="v">—</td>
            <td className="v">—</td>
            <td className="v">0.75 ns</td>
          </tr>
        </tbody>
      </table>
      <p>
        Note 1 of the table turns the skew rows into a board rule: the PCB “will require clocks to be routed such that an additional trace delay of greater than 1.5ns and less than 2.0ns
        will be added to the associated clock signal.” <Cite n={[1, 2]} /> The two rows are consistent: a transmitter skew of −0.5 to +0.5 ns plus a board delay of 1.5 to 2.0 ns
        arrives at the receiver as 1.0 to 2.5 ns, inside the 1.0–2.6 ns window. The 2.0 ns upper limit was added in version 1.3 “to ensure minimum setup time for subsequent edges”.
        <Cite n={1} /> At 10 and 100 Mb/s the clock slows to 2.5 and 25 MHz, and the T<sub>skewR</sub> maximum (2.6 ns at gigabit) is unspecified. <Cite n={1} />
      </p>

      <h2>RGMII 1.3 and RGMII 2.0 (RGMII-ID)</h2>
      <p>
        Version 2.0 changed the timing specification “to allow transmitter to integrate delay previously allocated to PC layout”. <Cite n={1} /> Note 4 of Table 2: the setup and hold
        rows allow “implementation of a delay on TXC or RXC inside the transmitter. Devices which implement internal delay shall be referred to as RGMII-ID. Devices may offer an option
        to operate with/without internal delay and still remain compliant with this spec.” <Cite n={1} />
      </p>
      <p>
        Read strictly, the specification places the delay in the transmitter of each clock: the MAC delays TXC and the PHY delays RXC. <Cite n={[1, 7]} /> In practice PHYs can also
        delay the incoming TXC on their own receive side, so a MAC without RGMII-ID can still connect without a delay line. Microchip's VSC8541 guide describes exactly that
        option. <Cite n={7} /> Two directions and three possible places for each delay — board, MAC or PHY — are where the confusion comes from.
      </p>

      <h2>Option 1: a longer clock trace on the board</h2>
      <p>
        The original method is a “trombone”: route TXC and RXC 1.5–2.0 ns longer than their data lines. <Cite n={7} /> What counts is the difference between the clock and its own data
        group, and since a trace's delay per millimetre depends on where it runs, the length follows from the stackup. With the delay calculator's formula, t<sub>pd</sub> = √ε
        <sub>eff</sub> / <i>c</i>, and an FR-4 class laminate with εr = 4.2 (the calculator's default):
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Routing</th>
            <th className="v">ε<sub>eff</sub></th>
            <th className="v">Delay</th>
            <th className="v">Extra length for 1.5 ns</th>
            <th className="v">for 1.75 ns</th>
            <th className="v">for 2.0 ns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Stripline, εr 4.2</td>
            <td className="v">4.20</td>
            <td className="v">6.84 ps/mm (174 ps/in)</td>
            <td className="v">219 mm (8.6 in)</td>
            <td className="v">256 mm</td>
            <td className="v">293 mm (11.5 in)</td>
          </tr>
          <tr>
            <td>50 Ω microstrip: W 0.173 mm, H 0.1 mm, 35 µm copper, no solder mask</td>
            <td className="v">2.98</td>
            <td className="v">5.76 ps/mm (146 ps/in)</td>
            <td className="v">260 mm (10.3 in)</td>
            <td className="v">304 mm</td>
            <td className="v">347 mm (13.7 in)</td>
          </tr>
        </tbody>
      </table>
      <p>
        The microstrip ε<sub>eff</sub> comes from the Hammerstad–Jensen expressions in the calculator; solder mask raises it slightly and shortens the required length. Aim for the middle
        of the window, 1.75 ns, so that laminate and length tolerances keep the board delay inside 1.5–2.0 ns.
      </p>
      <TryIt to="/timing?src=stripline&len=306&lenB=50">Check a 306 mm stripline clock against a 50 mm data line (1.75 ns of skew)</TryIt>
      <TryIt to="/timing?src=microstrip&w=0.173&len=354&lenB=50">Check the same delay on 50 Ω outer-layer microstrip</TryIt>
      <p>
        Each delay line is 220–350 mm of extra copper per clock. On its own that is longer than the 6 in (152 mm) maximum TI gives for RGMII traces, and TI recommends under 2 in.{' '}
        <Cite n={5} /> The kernel binding notes that “very few PCBs make use of extra long clock lines”. <Cite n={3} />
      </p>

      <h2>Option 2: internal delay in the MAC</h2>
      <p>
        An RGMII-ID MAC delays TXC on its output. <Cite n={[1, 7]} /> Some MACs and SoCs can also delay RXC on the input, or offer pin-pad delay settings; the Linux documentation
        lists a SoC “pin pad/mux/controller” capable of configuring delays as one option when neither the MAC nor the PHY can provide them. <Cite n={4} /> Some MACs have delays that
        cannot be switched off, which restricts the <code>phy-mode</code> values the board can use (see below). <Cite n={3} />
      </p>

      <h2>Option 3: internal delay in the PHY</h2>
      <p>
        A PHY delays RXC on its output and can usually delay TXC on its input; the kernel binding records that “all PHYs which implement RGMII also implement the ability to add or not
        add the needed delays”. <Cite n={3} /> Three examples show how much the details differ:
      </p>
      <ul>
        <li>
          <b>TI DP83867:</b> each path is either aligned (no clock skew) or shifted. In shift mode the RGMIICTL register (0x0032) enables the delay and RGMIIDCTL (0x0086) sets it from
          0.25 ns to 4.00 ns in 0.25 ns steps, separately for transmit and receive. <Cite n={5} />
        </li>
        <li>
          <b>Microchip KSZ9031RNX:</b> by default it “adds 1.2ns typical delay” to RX_CLK and adds none on the transmit inputs, expecting the MAC to delay GTX_CLK. Pad skew registers
          adjust each clock, control and data pin in steps of about 0.06 ns, up to 1.38 ns on-chip delay for GTX_CLK and up to 2.58 ns for RX_CLK. <Cite n={6} />
        </li>
        <li>
          <b>Microchip VSC8541:</b> supports internal delay on RX_CLK and, so that a MAC without RGMII-ID can be connected “without the use of PCB trace delays”, on TX_CLK as well.{' '}
          <Cite n={7} />
        </li>
      </ul>
      <p>
        The KSZ9031 also shows why aggregate timing matters: Microchip asks for the whole path — PHY on-chip delay, PCB trace delay and MAC on-chip delay — to be added up when MAC and PHY
        are not both RGMII 2.0 devices. <Cite n={6} />
      </p>

      <h2>What phy-mode means in Linux</h2>
      <p>
        The Ethernet controller binding defines <code>phy-connection-type</code>, with <code>phy-mode</code> as an alias, and four RGMII values. Its informative section starts by saying
        that these values “are frequently used wrongly by developers”, and states that the property describes the board: “Device Tree describes hardware, and in this case, it describes
        the PCB between the MAC and the PHY, if the PCB implements delays or not.” <Cite n={3} />
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>
              <code>phy-mode</code>
            </th>
            <th>Delay the PCB provides (binding) <Cite n={3} /></th>
            <th>Delay the PHY inserts, when the MAC adds none (phy.rst) <Cite n={4} /></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>rgmii</code>
            </td>
            <td>RX and TX</td>
            <td>None: “it assumes that either the Ethernet MAC (if capable) or the PCB traces insert the correct 1.5-2ns delay”</td>
          </tr>
          <tr>
            <td>
              <code>rgmii-id</code>
            </td>
            <td>Neither — “the most frequent case”; id stands for internal delay</td>
            <td>Both transmit and receive</td>
          </tr>
          <tr>
            <td>
              <code>rgmii-rxid</code>
            </td>
            <td>TX only</td>
            <td>Receive only (RXD[3:0] towards the MAC)</td>
          </tr>
          <tr>
            <td>
              <code>rgmii-txid</code>
            </td>
            <td>RX only</td>
            <td>Transmit only (TXD[3:0] from the MAC)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Transmit and receive are named from the MAC: TXC runs from MAC to PHY, RXC from PHY to MAC.{' '}
        <Cite n={1} /> The two documents describe the same values from two ends. The binding says what is on the board. The PHY documentation says what the PHY must add, and that its
        values “must be understood from the perspective of the PHY device itself”. <Cite n={4} /> When the MAC adds no delay, which is the Linux default, the two readings coincide.
      </p>
      <p>
        So <code>phy-mode = "rgmii"</code> does not mean “plain RGMII, no delay anywhere”. It means the board has both delay lines. On a board with no trombones, the correct value is
        almost always <code>rgmii-id</code>; the binding warns that any other RGMII value “is probably wrong, and is unlikely to be accepted during review” without an explanation in the
        commit and the .dts file. <Cite n={3} />
      </p>

      <h2>Add the delay exactly once</h2>
      <p>The kernel documents put the division of work in writing:</p>
      <ul>
        <li>
          <b>The PHY adds it by default.</b> “By default in Linux, when using phylib/phylink, the MAC is expected to read the 'phy-mode' from Device Tree, not implement any delays, and
          pass the value to the PHY.” The PHY should be reconfigured to the needed delays, “replacing any setting performed by strapping or the bootloader”. <Cite n={3} /> The PHY
          documentation says the same: “Whenever possible, use the PHY side RGMII delay”, because PHYs offer fine delay steps, a delay held constant across temperature and voltage, and
          reusable drivers. <Cite n={4} />
        </li>
        <li>
          <b>If the MAC adds a delay, the PHY must not.</b> The MAC “must ensure that the PHY does not also implement the same delay. So it must modify the phy-mode it passes to the PHY,
          removing the delay it has added. Failure to remove the delay will result in a non-functioning link.” <Cite n={3} /> Conversely, for any mode other than <code>rgmii</code>{' '}
          the MAC driver “should make sure that the MAC-level delays are disabled”. <Cite n={4} />
        </li>
        <li>
          <b>A board delay excludes both.</b> With a MAC whose delays cannot be disabled, <code>rgmii</code> “is now invalid, it cannot be supported, since both the PCB and the MAC and
          PHY adding delays cannot result in a functional link.” <Cite n={3} />
        </li>
      </ul>
      <p>
        The arithmetic explains why doubling is as bad as omitting. Two delays of about 2 ns move the clock edge by about 4 ns, one whole nibble at 1 Gb/s, so it lands on the next data
        transition — the same place as no delay at all.
      </p>

      <h2>Choosing phy-mode</h2>
      <p>Decide from the board first, then check which chip will supply what is missing:</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Extra trace on TXC (MAC → PHY)?</th>
            <th>Extra trace on RXC (PHY → MAC)?</th>
            <th>
              <code>phy-mode</code>
            </th>
            <th>Who adds the rest (Linux default)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>No</td>
            <td>No</td>
            <td>
              <code>rgmii-id</code>
            </td>
            <td>PHY adds both delays</td>
          </tr>
          <tr>
            <td>Yes</td>
            <td>No</td>
            <td>
              <code>rgmii-rxid</code>
            </td>
            <td>PHY adds the receive delay</td>
          </tr>
          <tr>
            <td>No</td>
            <td>Yes</td>
            <td>
              <code>rgmii-txid</code>
            </td>
            <td>PHY adds the transmit delay</td>
          </tr>
          <tr>
            <td>Yes</td>
            <td>Yes</td>
            <td>
              <code>rgmii</code>
            </td>
            <td>Nobody: MAC and PHY delays off</td>
          </tr>
        </tbody>
      </table>
      <p>
        If the PHY cannot add a delay that the table asks for, the <code>phy-mode</code> stays the same, because it still describes the board. The MAC driver adds the delay and passes the
        PHY a mode without it. <Cite n={3} /> If neither the MAC nor the PHY can, the Linux documentation names two fallbacks: a SoC pad-delay setting or “a specifically designed
        serpentine” on the PCB. <Cite n={4} /> A serpentine changes the board, so the <code>phy-mode</code> changes with it.
      </p>
      <p>
        For hardware engineers the practical choice is the first row: route each clock with its data group and no extra length, match TXD[3:0] and RXD[3:0] within 11 ps (about 60
        mil) as TI requires <Cite n={5} />, and let the PHY add the delay. Microchip defines the timing groups as the clock, control line and four data lines of each direction.{' '}
        <Cite n={6} /> Check that the PHY really can delay both directions — the KSZ9031 above, for example, relies on the MAC or its pad skew
        registers for transmit. <Cite n={6} />
      </p>

      <h2>Fine-tuning: rx-internal-delay-ps and tx-internal-delay-ps</h2>
      <p>
        The binding defines <code>rx-internal-delay-ps</code> and <code>tx-internal-delay-ps</code> for controllers with configurable delays; in the MAC node, their presence means the MAC
        applies that delay. <Cite n={3} /> They are meant for small corrections: “A value of 2000ps, i.e 2ns, and a phy-mode of 'rgmii' will not be accepted by Reviewers.” In the PHY
        node the same properties are used for PHY fine-tuning; with <code>rgmii-id</code> they “should have a value near to 2000ps”, and with <code>rgmii</code> a small value can trim
        the board delay. <Cite n={3} /> Whether a value is honoured, and in which steps, depends on the driver and the part (0.25 ns on the DP83867, about 0.06 ns on the KSZ9031).{' '}
        <Cite n={[5, 6]} />
      </p>

      <h2>Symptoms of a wrong delay</h2>
      <p>The Linux PHY documentation lists the typical results of an RGMII delay mismatch <Cite n={4} />:</p>
      <ul>
        <li>transmission and reception partly work, with frequent or occasional packet loss;</li>
        <li>the MAC reports some or all received packets with FCS/CRC errors, or discards them all;</li>
        <li>the problem disappears at 10 or 100 Mb/s, “since there is enough setup/hold time in that case”.</li>
      </ul>
      <p>
        The last one is the signature. At 100 Mb/s the clock cycle is 40 ns rather than 8 ns <Cite n={1} />, so a 2 ns error is small against the data window. When a link works at
        100 Mb/s and fails at 1 Gb/s, count the delays on both clocks: board, MAC and PHY.
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>Decide where each clock's delay comes from before layout. The default is the PHY, with no trombone on the board.</li>
        <li>
          Without board delays, route TXC and RXC matched to their data groups and set <code>phy-mode = "rgmii-id"</code>.
        </li>
        <li>With board delays, make each clock 1.5–2.0 ns longer than its data, aiming at 1.75 ns, and compute the length from your stackup's delay per millimetre.</li>
        <li>
          Use <code>rgmii-rxid</code> or <code>rgmii-txid</code> only when exactly one clock has a board delay, and say so in the .dts.
        </li>
        <li>Make sure the MAC and the PHY never add the same delay, and check the PHY's defaults and strap pins against what the driver programs.</li>
        <li>If gigabit fails while 100 Mb/s works, check the delays first.</li>
      </ol>
      <p>
        The rest of the RGMII layout rules — 50 Ω lines, 11 ps matching within TXD[3:0] and within RXD[3:0], trace length and series termination — are collected on the{' '}
        <Link to="/interface-rules/rgmii">RGMII layout guidelines</Link> page.
      </p>
      <TryIt to="/interface-rules/rgmii">See every RGMII layout rule with its source</TryIt>
    </Guide>
  );
}
