import { Cite, Guide, TryIt } from './Guide';

export default function PcieRouting() {
  return (
    <Guide
      tools={['/impedance', '/trace-loss', '/timing', '/differential-via', '/stackup']}
      sources={[
        { text: 'PCI-SIG, PCI Express Base Specification, Revision 3.0, 2010 (§4.2.2 encoding; §4.2.4.4 polarity inversion; §4.2.4.10.1 lane reversal; Table 4-18).' },
        { text: 'PCI-SIG, PCI Express Card Electromechanical (CEM) Specification, Revision 3.0, 2013 (§2.1 reference clock; §4.7 routing requirements; §6.1).' },
        { text: 'PCI-SIG, PCI Express M.2 Specification, Revision 1.1, 2016 (Tables 36, 38, 44, 46, 54, 55, 75; §6.8.2).' },
        { text: 'Texas Instruments SPRAAR7J, High-Speed Interface Layout Guidelines, rev. 2023.', url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf' },
        { text: 'Texas Instruments SNLA426, PCI Express layout application note, 2023.', url: 'https://www.ti.com/lit/pdf/snla426' },
        { text: 'Texas Instruments SNAA386, Clocking for PCIe Applications, 2023.', url: 'https://www.ti.com/lit/SNAA386' },
        { text: 'S. Krooswyk (Samtec), “Successful PCIe Interconnect Guidelines at 8, 16, and 32 GT/s,” 2021.', url: 'https://blog.samtec.com/wp-content/uploads/2021/04/04_15_2021_successful_PCIe_interconnect_guidelines.pdf' },
        { text: 'Astera Labs, “PCI Express 5.0 Architecture Channel Insertion Loss Budget.”', url: 'https://www.asteralabs.com/pci-express-5-0-architecture-channel-insertion-loss-budget/' },
        { text: 'NXP (Philips) AN10373, PCI Express PCB routing guidelines, 2005.', url: 'https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/powerquicc/2284/2/philips_PCIe_pcb_routing_guide.pdf' },
      ]}
    >
      <p>
        An M.2 NVMe carrier card is a good first high-speed project: a PCIe x4 edge connector, an M.2 Key M socket, four differential lanes each way and a reference clock. There is no
        chip to configure, but every trace carries 8 GT/s, so the layout is the whole design. This guide collects what the PCI Express specifications and public layout guides actually
        say, and applies it to a standard six-layer, 1.6 mm FR-4 board with a thin 1080 prepreg on the outer layers.
      </p>
      <p>
        The PCI-SIG specifications are available to members only; the numbers below are cited by document, section and table so you can check them against your own copy.
      </p>

      <h2>What “Gen3” means for the board</h2>
      <p>
        PCIe Gen3 runs at 8.0 GT/s with 128b/130b encoding: every 128 data bits carry a 2-bit sync header, instead of the 8b/10b encoding of Gen1 and Gen2 <Cite n={1} />. One bit
        lasts 125 ps, and the fundamental frequency of the fastest pattern (the Nyquist frequency) is 8 GT/s ÷ 2 = 4 GHz. The base specification specifies its calibration channels at
        4 GHz too <Cite n={1} />, so loss and impedance are evaluated at 4 GHz.
      </p>

      <h2>Impedance: 85 Ω, and why not 100 Ω</h2>
      <p>
        The card specification allows a data pair impedance of <b>70–100 Ω</b> at 8 GT/s, on both the add-in card and the system board <Cite n={2} />. Its own test channels are
        built from 85 Ω traces, the M.2 connector is characterised at 85 Ω <Cite n={3} />, and application notes from TI and Samtec recommend 85 Ω on add-in cards so that any card
        works in any slot <Cite n={[5, 7]} />. Some layout guides list 100 Ω or 95 Ω, but those tables are written for the PCIe ports of specific processors <Cite n={4} />. For a carrier
        card between a CEM slot and an M.2 socket, <b>design for 85 Ω differential</b>.
      </p>
      <p>On the example board, the field solver gives (spacing 1.5 × width, 1 oz outer and ½ oz inner copper, solder mask on the outside):</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Layer</th>
            <th className="v">85 Ω pair (W / S)</th>
            <th className="v">Delay</th>
            <th className="v">Loss at 4 GHz</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>L1 / L6, microstrip over 0.076 mm 1080</td>
            <td className="v">0.147 / 0.22 mm</td>
            <td className="v">5.8 ps/mm</td>
            <td className="v">0.68 dB/in</td>
          </tr>
          <tr>
            <td>L3, stripline</td>
            <td className="v">0.145 / 0.22 mm</td>
            <td className="v">6.8 ps/mm</td>
            <td className="v">0.77 dB/in</td>
          </tr>
        </tbody>
      </table>
      <p>
        The loss figures assume standard FR-4 (Df 0.015 at 1 GHz) and standard ED copper; with smoother reverse-treated foil the L1 figure drops to about 0.61 dB/in. Samtec quotes
        about 0.8 dB/in at 4 GHz for standard FR-4 <Cite n={7} />, the same order of magnitude.
      </p>
      <TryIt to="/impedance">Calculate the 85 Ω pair on your own stackup</TryIt>

      <h2>Loss and length</h2>
      <p>
        The base specification does not give one loss number; channels are judged by simulation <Cite n={1} />. Commonly quoted Gen3 budgets allocate about 6.5 dB at 4 GHz to the
        add-in card out of a total of roughly 22–23.5 dB <Cite n={[5, 8]} />. The card specification also limits the data trace delay on an add-in card to 750 ps from the edge fingers
        <Cite n={2} />. On the example board that is about 129 mm of microstrip, and 6.5 dB of loss would allow over 9 inches of trace, so on a carrier card <b>the 750 ps delay limit is the
        one that binds</b>. A carrier with 50–80 mm lanes is well inside both.
      </p>
      <TryIt to="/trace-loss">Check the loss of your lanes at 4 GHz</TryIt>

      <h2>Skew</h2>
      <ul>
        <li>
          <b>Within a pair (P to N):</b> less than 5 mil (0.127 mm) of length difference on an add-in card, 10 mil on a system board <Cite n={2} />. At 5.8 ps/mm that is under 1 ps.
          Correct a mismatch close to where it happens, for example with a small bump right after a bend, not at the far end <Cite n={[4, 5]} />.
        </li>
        <li>
          <b>Between lanes:</b> the limit is loose, 0.35 ns on an add-in card <Cite n={2} />, because every receiver deskews the lanes during link training <Cite n={1} />. Do not
          spend board space length-matching the four lanes to each other.
        </li>
      </ul>

      <h2>AC coupling capacitors</h2>
      <p>
        Each lane has series capacitors on its <b>transmit</b> pair only. For Gen3 the value must be <b>176–265 nF</b>, narrower than the 75–265 nF allowed at 2.5 and 5 GT/s{' '}
        <Cite n={[1, 3]} />. Use 0402 or smaller, with identical parts and a symmetric placement on P and N, and remove the reference plane under the pads to reduce their capacitance{' '}
        <Cite n={[4, 9]} />.
      </p>
      <p>
        On a passive carrier card, check where these capacitors already are. The card specification puts the host's transmit capacitors on the system board, and the M.2 specification
        puts a pluggable module's transmit capacitors on the module <Cite n={[2, 3]} />. A carrier that only connects the two may therefore need none; adding another pair in series
        would halve the effective value (two 220 nF in series give 110 nF, below the 176 nF minimum). Compare with the reference design of an existing passive adapter before you
        decide.
      </p>

      <h2>Reference clock and sideband signals</h2>
      <ul>
        <li>
          The reference clock is 100 MHz HCSL <Cite n={[3, 6]} />. Route it as a differential pair; the card specification's clock timing assumes nominal 100 Ω pairs{' '}
          <Cite n={2} />. The card specification's clock budget assumes at most 4 inches of reference-clock trace on the card <Cite n={2} />.
        </li>
        <li>Spread-spectrum clocking is optional and down-spread only, 0 to −0.5 % <Cite n={[1, 2]} />; the receiver handles it, the layout does not change.</li>
        <li>
          On the M.2 Key M socket (platform side): PERST# pin 50, CLKREQ# pin 52, PEWAKE# pin 54, REFCLK− pin 53, REFCLK+ pin 55. CLKREQ# and PEWAKE# are open-drain with pull-ups on
          the platform <Cite n={3} />.
        </li>
      </ul>

      <h2>Pinout traps</h2>
      <ul>
        <li>
          <b>TX and RX names swap between tables.</b> The M.2 specification names pins from each side's point of view. On the platform table, pins 49/47 are PETp0/PETn0 (the host
          transmitter); the module table calls the same pins PERp0/PERn0 <Cite n={3} />. Connect host transmit to module receive and double-check every lane.
        </li>
        <li>
          <b>P and N may be swapped</b> to avoid crossing a pair: every PCIe receiver must support polarity inversion on every lane <Cite n={[1, 2]} />.
        </li>
        <li>
          <b>Lane order may not be reversed freely.</b> Lane reversal is optional in the specification, so wire lane 0 to lane 0 unless both ends are known to support it{' '}
          <Cite n={[1, 2]} />.
        </li>
      </ul>

      <h2>Vias and reference planes</h2>
      <ul>
        <li>Keep lanes on one layer where possible; every via pair costs in the order of 0.25 dB in corner cases <Cite n={9} />.</li>
        <li>Use the same number of vias on P and N, and remove unused inner pads on signal vias <Cite n={4} />.</li>
        <li>
          Put ground stitching vias next to every signal via pair so the return current can change planes; TI asks for them symmetrically within 200 mil <Cite n={4} />.
        </li>
        <li>
          Keep via stubs short: TI recommends back-drilling stubs longer than 15 mil <Cite n={[4, 5]} />. On a 1.6 mm board, routing on the outer layers and changing to the layer
          nearest the far side keeps stubs short without back-drilling.
        </li>
        <li>Never route a lane across a split or slot in its reference plane.</li>
      </ul>
      <TryIt to="/differential-via">Check a via pair's impedance and stub resonance</TryIt>

      <h2>Power</h2>
      <p>
        The M.2 socket supplies 3.3 V ±5 % on nine pins. A Key M module may draw up to 2.5 A (peak, averaged over 100 µs), and each power contact is rated 0.5 A continuous{' '}
        <Cite n={3} />. Size the 3.3 V copper for 2.5 A and place bulk and ceramic decoupling next to the socket.
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>85 Ω differential on every lane, over a continuous ground plane.</li>
        <li>P/N matched within 5 mil; lanes not matched to each other.</li>
        <li>Data traces under 750 ps (about 129 mm of microstrip here) from the edge fingers.</li>
        <li>AC capacitors 176–265 nF on transmit pairs only, and none duplicated in series.</li>
        <li>TX and RX crossed correctly between host and module; lane order preserved.</li>
        <li>Ground stitching vias at every layer change; short via stubs.</li>
        <li>3.3 V rated for 2.5 A at the socket.</li>
      </ol>
    </Guide>
  );
}
