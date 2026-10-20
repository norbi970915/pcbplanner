import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function ViaStubGuide() {
  return (
    <Guide
      sources={[
        {
          text: 'B. Simonovich, “Via Stubs – Are They All Bad?”, Signal Integrity Journal, 10 March 2017: quarter-wave null, first null at the 7th harmonic of the Nyquist frequency, effective Dk 6.16 against a bulk Dk of 3.65, 5–10 mil back-drill residue, 270 mil and 65 mil measured channels, 5 mil against 12 mil stubs at 28 Gb/s.',
          url: 'https://www.signalintegrityjournal.com/blogs/7-voice-of-the-experts-signal-integrity/post/355-via-stubs-are-they-all-bad',
        },
        {
          text: 'Texas Instruments SNLA426, High-Speed PCB Layout for PCIe Gen 5 (June 2023), §21 Via Stubs, §22 Via Pads, §23 Via Discontinuity Mitigation (29 GHz bandwidth and the 51–54 mil quarter wave), §24 Back-Drill Stubs.',
          url: 'https://www.ti.com/lit/pdf/snla426',
        },
        {
          text: 'Texas Instruments SPRAAR7J, High-Speed Interface Layout Guidelines (November 2018, revised February 2023), §3.5 Connectors and Receptacles, §3.6 Via Discontinuity Mitigation, §3.7 Back-Drill Stubs, §3.8 Anti-Pad Diameter, Figures 3-4 to 3-6.',
          url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf',
        },
        {
          text: 'Texas Instruments SLLA414A, High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (August 2025, revised January 2026), §4.5 Via Discontinuity Mitigation, §4.6 Back-Drill Stubs, §4.8 Anti-Pad Diameter.',
          url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        },
        {
          text: 'S. Krooswyk, Samtec gEEk spEEk, Successful PCIe Interconnect Guidelines at 8, 16 and 32 GT/s (April 2021): slides “Via Design Considerations: Impedance”, “Stub vs. Xtalk” and “Placement”.',
          url: 'https://blog.samtec.com/wp-content/uploads/2021/04/04_15_2021_successful_PCIe_interconnect_guidelines.pdf',
        },
        {
          text: 'Texas Instruments SLAAE45, Layout Guidelines of PCIe Gen 4.0 Application With the TMUXHS4412 Multiplexer (September 2021), Table 2-1 and §2.3 Vias, Stub, and ESD/EMI Layout Guidelines.',
          url: 'https://www.ti.com/lit/pdf/slaae45',
        },
        {
          text: 'Sierra Circuits, What is Back Drilling in PCB Design and Manufacturing? (29 December 2020): residual stub, Table 1 back-drill clearances and controlled-depth tolerance, cost, alternatives.',
          url: 'https://www.protoexpress.com/blog/back-drilling-pcb-design-and-manufacturing/',
        },
        { text: 'pcbplanner Differential Via, Method: the stub quarter-wave resonance c / (4 · L_stub · √εr).', url: '/differential-via#method' },
        { text: 'pcbplanner Interface Rules: Nyquist frequency and via rules per interface, each with the document it was taken from.', url: '/interface-rules' },
      ]}
    >
      <p>
        <b>The unused part of a through via below the layer where the signal leaves is an open-ended stub, and it resonates where it is a quarter wavelength long, at
        f ≈ c / (4 · L · √εeff), cutting a notch into the insertion loss of the channel.</b> Keep that notch well above the signal's Nyquist frequency – this guide uses
        Simonovich's rule of putting the first null at seven times the Nyquist frequency or higher <Cite n={1} /> – and where the stub is too long, back-drill it, use blind
        vias, or leave the via on the layer nearest the far side of the board.
      </p>
      <p>
        The sections below give the formula and its uncertain input, a worked example on a 1.6 mm six-layer board, the longest stub per interface, and what the TI, Samtec and
        fabricator documents say about the 15 mil rule and back-drilling. All numbers come from the same formula as the{' '}
        <Link to="/differential-via">Differential Via</Link> tool.
      </p>

      <h2>Why a via stub resonates</h2>
      <p>
        A signal that changes layer through a plated through hole uses only the part of the barrel between the two layers it connects. The rest of the barrel, down to the far
        surface of the board, is a short transmission line with an open end. The wave that runs into it is reflected at the open end and returns to the junction. When the round
        trip through the stub equals half a cycle, the returning wave cancels the through signal, and the insertion loss shows a deep null at that frequency. <Cite n={1} />
      </p>
      <p>
        Longer stubs resonate at lower frequencies and increase insertion loss; TI notes that in most cases the stub portion of a via degrades the signal more than the part
        that carries it. <Cite n={[3, 4]} /> Samtec's dense-BGA comparison shows the effect: the differential insertion loss of a via with a stub of about 60 mil falls away
        steeply above about 10 GHz, while the same via with a stub of about 10 mil stays within about 1.3 dB up to 30 GHz. <Cite n={5} />
      </p>

      <h2>The formula and which εr to use</h2>
      <p>f<sub>stub</sub> = c / (4 × L<sub>stub</sub> × √εr)</p>
      <p>
        This is the quarter-wave condition, with c the speed of light and L<sub>stub</sub> the length of unused barrel. It is the expression the Differential Via tool uses for its
        stub line, with the laminate εr you enter. <Cite n={[1, 8]} /> It assumes that the stub behaves as a uniform open line in a homogeneous dielectric, and it ignores the
        loading of the pads, the antipads and the planes the barrel passes through.
      </p>
      <p>
        That loading is the uncertain part. For a backplane with a measured null, Simonovich found an effective Dk of 6.16, against a published bulk Dk of 3.65 for the
        laminate. He attributes the difference to the via pad capacitance and to anisotropy: data sheets give the dielectric constant measured perpendicular to the laminate,
        glass-reinforced laminates are 15–25 % anisotropic, and in an earlier study the in-plane Dk had to be 18 % higher to match measurement. <Cite n={1} /> A ratio of 6.16 /
        3.65 lowers the resonance by 23 %. This guide therefore gives two values: the laminate εr of 4.2 (the tool default), and a pessimistic εeff of 7.1, which is 4.2 scaled
        by the same ratio.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">Stub length</th>
            <th className="v">f<sub>stub</sub>, εr = 4.2</th>
            <th className="v">f<sub>stub</sub>, εeff = 7.1</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">10 mil (0.254 mm)</td><td className="v">144 GHz</td><td className="v">111 GHz</td></tr>
          <tr><td className="v">15 mil (0.381 mm)</td><td className="v">96.0 GHz</td><td className="v">73.8 GHz</td></tr>
          <tr><td className="v">50 mil (1.27 mm)</td><td className="v">28.8 GHz</td><td className="v">22.1 GHz</td></tr>
          <tr><td className="v">80 mil (2.03 mm)</td><td className="v">18.0 GHz</td><td className="v">13.8 GHz</td></tr>
        </tbody>
      </table>
      <p>
        As a check, TI's Gen5 note works the same calculation backwards: a 12 ps edge needs about 29 GHz of bandwidth, and the quarter wavelength at 29 GHz is about 54 mil in
        Megtron 6 (εr ≈ 3.4) and about 51 mil in FR-4 (εr ≈ 4.2). <Cite n={2} /> The formula above gives 55.2 mil and 49.6 mil, within 3 % of TI's figures.
      </p>

      <h2>How much margin: the 7 × Nyquist rule</h2>
      <p>L<sub>max</sub> = c / (4 × 7 × f<sub>N</sub> × √εr)</p>
      <p>
        Simonovich aims for an interconnect bandwidth of five times the Nyquist frequency f<sub>N</sub>. Because the quarter-wave null acts as a notch filter, he places the first
        null at the 7th harmonic of the Nyquist frequency or higher, which keeps the 5th harmonic intact. <Cite n={1} /> Solving the quarter-wave formula for that frequency gives
        the longest stub above. He also reports that the rule is conservative for NRZ: in a 28 Gb/s simulation, 12 mil stubs closed the eye height by only 17 mV (1.5 %) more
        than 5 mil stubs, with no extra jitter. Rules of thumb like this one help with planning, but they should never be used to sign off a high-speed design. <Cite n={1} />
      </p>
      <p>The other published criteria differ, in both directions:</p>
      <ul>
        <li>
          TI's Gen5 note keeps a stub that is not back-drilled shorter than a quarter wavelength at the 29 GHz bandwidth of a 12 ps edge, which is 1.8 times the 16 GHz Gen5
          Nyquist frequency. <Cite n={2} />
        </li>
        <li>
          Samtec rates stubs up to 80 mil as no problem at PCIe Gen3 for a 10/20/30 mil drill/pad/antipad via without optimisation, says optimisation may help from 50 mil at Gen4, and expects every via to be simulated at Gen5. <Cite n={5} />
          At εr 4.2, 80 mil resonates at 4.5 times the Gen3 Nyquist frequency, and 50 mil at 3.6 times the Gen4 one.
        </li>
        <li>TI's general layout guides set one fixed limit for every interface: keep via stubs under 15 mil, and back-drill longer ones. <Cite n={[2, 3, 4, 6]} /></li>
      </ul>

      <h2>Worked example: a 1.6 mm six-layer board</h2>
      <p>
        The example uses the 1.6 mm six-layer “1080 prepreg · core 0.1/0.7 mm” stackup from the site's library: L1, 0.076 mm 1080 prepreg, L2, 0.10 mm core, L3, then 7628
        prepreg, a 0.7 mm core and 7628 prepreg, then L4, 0.10 mm core, L5, 1080 prepreg and L6, 1.6044 mm from copper to copper. With L2 and L5 as ground, L1, L3, L4 and L6
        are signal layers (S-G-S-S-G-S). A pair enters at L1, for example from a BGA ball or a surface-mount connector, and leaves on L3, L4 or L6. The stub is the barrel from the
        far side of the exit-layer copper to the outer surface of L6.
      </p>
      <TryIt to="/stackup?id=std-6l-16-1080-3">Open the six-layer stackup in the Stackup tool</TryIt>
      <table className="tbl">
        <thead>
          <tr>
            <th>Exit layer</th>
            <th className="v">Via used</th>
            <th className="v">Stub</th>
            <th className="v">f<sub>stub</sub>, εr = 4.2</th>
            <th className="v">f<sub>stub</sub>, εeff = 7.1</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>L3</td><td className="v">0.2418 mm</td><td className="v">1.3626 mm (53.6 mil)</td><td className="v">26.8 GHz</td><td className="v">20.6 GHz</td></tr>
          <tr><td>L4</td><td className="v">1.3778 mm</td><td className="v">0.2266 mm (8.9 mil)</td><td className="v">161 GHz</td><td className="v">124 GHz</td></tr>
          <tr><td>L6</td><td className="v">1.6044 mm</td><td className="v">none</td><td className="v">–</td><td className="v">–</td></tr>
        </tbody>
      </table>
      <p>
        L3 is the inner layer closest to the top, so a pair from L1 to L3 leaves almost the whole barrel unused. At εr 4.2 its null at 26.8 GHz is 6.7 times the Gen3 Nyquist
        frequency – just short of the 7 × rule, but well inside Samtec's 80 mil. At Gen4 it is only 3.4 times the Nyquist frequency, and at Gen5 the null sits below TI's 29 GHz,
        so for Gen4 and Gen5 this transition needs back-drilling or a different layer. With εeff 7.1 the margins shrink to 5.2, 2.6 and 1.3 times.
      </p>
      <p>
        L4 sits next to the far side, so its stub of 8.9 mil is already under TI's 15 mil without back-drilling, and its null stays above 7 × Nyquist even for Gen5 (10.1 times
        at εr 4.2, 7.8 times at εeff 7.1). L6 uses the whole barrel and has no stub, but puts the pair on an outer layer. The rule is symmetrical: a pair entering from the
        bottom and leaving on L3 has the short stub instead.
      </p>
      <TryIt to="/differential-via?len=0.24&stub=1.36">Load the L1 → L3 transition (1.36 mm stub, 26.9 GHz)</TryIt>
      <TryIt to="/differential-via?len=1.38&stub=0.23">Load the L1 → L4 transition (0.23 mm stub, 159 GHz)</TryIt>
      <TryIt to="/differential-via?stub=0">Load the L1 → L6 transition (no stub)</TryIt>
      <p>
        The rounded inputs give 26.9 GHz and 159 GHz in the tool. To see the pessimistic case, enter εr = 7.1; the tool then reports 20.7 GHz for the L3 stub, but it also
        uses that εr for the via impedance, so read only the stub line from that run.
      </p>
      <TryIt to="/differential-via?len=0.24&stub=1.36&er=7.1">Load the L1 → L3 stub with εeff = 7.1</TryIt>

      <h2>The longest stub per interface</h2>
      <p>
        The Nyquist frequencies below are those of the <Link to="/interface-rules">Interface Rules</Link> data, half the NRZ line rate. <Cite n={9} /> The last two rows are the
        10 Gb/s and 28 Gb/s NRZ channels of Simonovich's article. L<sub>max</sub> follows from the 7 × Nyquist rule; the last column quotes the via rule that the Interface Rules
        tool shows, with the document it comes from.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Interface</th>
            <th className="v">f<sub>N</sub></th>
            <th className="v">7 × f<sub>N</sub></th>
            <th className="v">L<sub>max</sub>, εr = 4.2</th>
            <th className="v">L<sub>max</sub>, εeff = 7.1</th>
            <th>Published via rule</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>PCIe Gen3 (8 GT/s)</td><td className="v">4 GHz</td><td className="v">28 GHz</td><td className="v">1.31 mm (51 mil)</td><td className="v">1.00 mm (40 mil)</td><td>TI: under 15 mil, longer stubs back-drilled <Cite n={6} />; Samtec: up to 80 mil no problem <Cite n={5} /></td></tr>
          <tr><td>PCIe Gen4 (16 GT/s)</td><td className="v">8 GHz</td><td className="v">56 GHz</td><td className="v">0.65 mm (26 mil)</td><td className="v">0.50 mm (20 mil)</td><td>TI: under 15 mil <Cite n={6} />; Samtec: optimisation may help from 50 mil <Cite n={5} /></td></tr>
          <tr><td>PCIe Gen5 (32 GT/s)</td><td className="v">16 GHz</td><td className="v">112 GHz</td><td className="v">0.33 mm (13 mil)</td><td className="v">0.25 mm (10 mil)</td><td>TI: back-drill stubs over 15 mil <Cite n={2} />; Samtec: simulate every via <Cite n={5} /></td></tr>
          <tr><td>USB 3.2 Gen 1 (5 Gb/s)</td><td className="v">2.5 GHz</td><td className="v">17.5 GHz</td><td className="v">2.09 mm (82 mil)</td><td className="v">1.61 mm (63 mil)</td><td>TI: under 15 mil or back-drill <Cite n={4} /></td></tr>
          <tr><td>USB 3.2 Gen 2 (10 Gb/s)</td><td className="v">5 GHz</td><td className="v">35 GHz</td><td className="v">1.05 mm (41 mil)</td><td className="v">0.80 mm (32 mil)</td><td>TI: under 15 mil or back-drill <Cite n={4} /></td></tr>
          <tr><td>DisplayPort HBR3 (8.1 Gb/s)</td><td className="v">4.05 GHz</td><td className="v">28.4 GHz</td><td className="v">1.29 mm (51 mil)</td><td className="v">0.99 mm (39 mil)</td><td>TI: under 15 mil or back-drilled <Cite n={4} /></td></tr>
          <tr><td>HDMI 2.0 (6 Gb/s)</td><td className="v">3 GHz</td><td className="v">21 GHz</td><td className="v">1.74 mm (69 mil)</td><td className="v">1.34 mm (53 mil)</td><td>TI: under 15 mil <Cite n={4} /></td></tr>
          <tr><td>SATA 3.0 (6 Gb/s)</td><td className="v">3 GHz</td><td className="v">21 GHz</td><td className="v">1.74 mm (69 mil)</td><td className="v">1.34 mm (53 mil)</td><td>TI: under 15 mil, longer stubs back-drilled <Cite n={3} /></td></tr>
          <tr><td>10 Gb/s NRZ backplane</td><td className="v">5 GHz</td><td className="v">35 GHz</td><td className="v">1.05 mm (41 mil)</td><td className="v">0.80 mm (32 mil)</td><td>Eyes simulated from measured S-parameters: closed with about 270 mil stubs, open with about 65 mil <Cite n={1} /></td></tr>
          <tr><td>28 Gb/s NRZ</td><td className="v">14 GHz</td><td className="v">98 GHz</td><td className="v">0.37 mm (15 mil)</td><td className="v">0.29 mm (11 mil)</td><td>Simonovich: about 12 mil with his Dkeff of 6.16 <Cite n={1} /></td></tr>
        </tbody>
      </table>
      <p>
        TI's 15 mil puts the null at 96 GHz at εr 4.2: inside the 7 × rule for every interface in the table except PCIe Gen5 and 28 Gb/s, where it reaches 6.0 and 6.9 times the
        Nyquist frequency. The 65 mil channel whose simulated eye was open at 10 Gb/s is longer than the 7 × rule allows, which is consistent with Simonovich's note that the rule is
        conservative for NRZ. <Cite n={1} /> For PCIe Gen5 the rule and TI's 15 mil agree on the practical answer: short stubs by layer choice or back-drilling, and simulation of the
        actual via. <Cite n={[2, 5]} />
      </p>
      <TryIt to="/interface-rules?ifid=pcie-gen5">Check the PCIe Gen5 via and stub rules</TryIt>

      <h2>Back-drilling</h2>
      <p>
        Back-drilling removes the plating of the stub section after the board has been plated, with a drill bit slightly larger than the one that made the original hole. TI asks
        for it wherever a via transition leaves a stub longer than 15 mil, to reduce insertion loss and keep the stub from resonating. <Cite n={[2, 3, 4]} /> Because it is a
        controlled-depth drilling step, the stub is never removed entirely:
      </p>
      <ul>
        <li>Simonovich puts the shortest practical back-drilled stub at 5 to 10 mil. <Cite n={1} /></li>
        <li>Sierra Circuits says the back-drill should bring the stub down to 10 mil, and that 2 to 3 mil stubs may be possible on the latest drilling equipment; check with your manufacturer. <Cite n={7} /></li>
        <li>Its recommended values: controlled-depth tolerance ±2 mil, back-drill 8 mil larger than the primary drill (10 mil preferred), 10 mil from back-drill to copper and 6 mil between back-drills. <Cite n={7} /></li>
        <li>Cost rises with the number of back-drilled vias and as the allowed residual stub gets shorter. <Cite n={7} /></li>
      </ul>
      <p>
        A residual stub of 10 mil resonates at 144 GHz at εr 4.2, above the 112 GHz that the 7 × rule asks for at PCIe Gen5, and at 111 GHz with εeff 7.1, just at that
        limit. The larger back-drill hole also needs its
        clearance on every layer it passes through, so plan antipads and nearby traces for the back-drill diameter rather than the finished hole.
      </p>

      <h2>Alternatives to back-drilling</h2>
      <ul>
        <li>
          <b>Choose the exit layer.</b> TI's example compares a via from L1 to L3, which leaves a stub from L3 to L10 that should be back-drilled, with one from L1 to L8
          (stub of 15 mil or less). <Cite n={3} /> In the six-layer example, moving the pair from L3 to L4 shortens the stub from 53.6 mil to 8.9 mil. Through vias that run from the top to the bottom
          layer have no stub at all. <Cite n={1} />
        </li>
        <li>
          <b>Route on the outer layers.</b> TI's Gen5 note recommends routing high-speed traces on the top or bottom layer only, and back-drilling when vias are
          needed. <Cite n={2} /> For a through-hole receptacle, TI connects the pair on the bottom layer so that the pin is part of the signal path instead of a
          stub. <Cite n={3} />
        </li>
        <li>
          <b>Blind, buried and laser-drilled vias</b> do not leave a stub beyond the layers they connect. Simonovich and Sierra Circuits both list them as alternatives; Sierra
          Circuits adds that they are not always viable for manufacturing or cost reasons. <Cite n={[1, 7]} />
        </li>
        <li>
          <b>Via-in-pad is not a stub fix.</b> TI recommends via-in-pad instead of a via in an extended pad because it reduces the pad inductance. <Cite n={2} /> It changes where
          the via sits, not how much barrel remains below the exit layer.
        </li>
        <li>
          <b>Remove unused pads and enlarge antipads.</b> TI does not permit non-functional pads on high-speed vias. <Cite n={[2, 3, 4]} /> Its general layout guides ask for antipads as
          large as possible on every layer (30 mil gives significant benefit) to reduce the via capacitance. <Cite n={[3, 4]} /> TI's PCIe Gen 5 note gives 10/20/40 mil
          drill/pad/antipad and optimises the antipad by simulation. <Cite n={2} /> Pad capacitance is one reason the effective εr of a stub exceeds the laminate value. <Cite n={1} />
        </li>
      </ul>
      <p>
        Shorter is not automatically better in a dense BGA field. TI and Samtec both note that a short stub reflects less but couples more crosstalk into neighbouring vias, so
        a long-stub and a short-stub breakout should be compared by simulation, including crosstalk, when back-drilling is not possible. <Cite n={[2, 5]} />
      </p>

      <h2>Checklist</h2>
      <ol>
        <li>For every layer change, measure the stub from the exit layer to the far end of the barrel, using the fabricator's stackup.</li>
        <li>Calculate f<sub>stub</sub> = c / (4 × L × √εr) with the laminate εr, and again with a value about 70 % higher as the pessimistic case.</li>
        <li>Compare with the Nyquist frequency of the interface: aim for seven times; TI's 15 mil and the interface rules give the vendor limits.</li>
        <li>If the stub is too long, first move the pair to the layer nearest the far side, then consider blind vias or back-drilling.</li>
        <li>For back-drilling, agree the residual stub, depth tolerance and back-drill clearance with the fabricator before routing.</li>
        <li>At PCIe Gen5 and similar rates, simulate the actual via, including crosstalk; do not sign off on a rule of thumb.</li>
      </ol>
      <p>
        For the rest of a PCIe channel, see the <Link to="/guides/pcie-routing-guidelines">PCIe routing guidelines</Link> and the{' '}
        <Link to="/guides/pcie-gen3-routing">Gen3 carrier-card case study</Link>; for choosing the layer order that decides the stub lengths, see{' '}
        <Link to="/guides/choosing-a-pcb-stackup">how to choose a PCB stackup</Link>.
      </p>
    </Guide>
  );
}
