import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function GlassWeaveSkew() {
  return (
    <Guide
      sources={[
        {
          text: 'L. Simonovich, Practical Fiber Weave Effect Modeling, white paper, issue 2, LAMSIM Enterprises, 10 January 2011: Equation 1 (delay from Dk), the summary of Intel’s measurements (p. 5), Figure 4 and 5 (106 and 7628 Dk), Equation 6 (skew resonance), the PCIe CEM Rev. 2.0 budget (p. 12) and the conclusions (p. 23).',
          url: 'https://smtnet.com/library/files/upload/Practical_Fiber_Weave_Modeling.pdf',
        },
        {
          text: 'J. Loyer, R. Kunze, X. Ye, “Fiber Weave Effect: Practical Impact Analysis and Mitigation Strategies,” DesignCon 2007. Not publicly available; its measured statistics and mitigations are quoted here as summarised in sources 1 and 3.',
        },
        {
          text: 'B. Simonovich, “Bert’s Practical Design Notes: Fiber Weave-Induced Timing Skew,” I-Connect007 Design007, 17 September 2011: 10° routing and panel rotation, Isola FR408HR style substitutions, PCIe Gen2 eye closure against length.',
          url: 'https://iconnect007.com/article/61693/berts-practical-design-notes-fiber-weaveinduced-timing-skew/61696/design',
        },
        {
          text: 'Texas Instruments SNLA426, High-Speed PCB Layout for PCIe Gen 5 (June 2023), §8 PCB Grain and Fiber Weave Selection, Figures 8-1 and 8-2.',
          url: 'https://www.ti.com/lit/pdf/snla426',
        },
        {
          text: 'A. Manukovsky (Intel), Y. Shlepnev (Simberian), S. Mordooch, “Evaluation of Delay Uncertainty in PCB Interconnects Due to Fiber Weave Effect,” arXiv:2210.05779, October 2022: Table 1, Sections II and V, Figure 14.',
          url: 'https://arxiv.org/abs/2210.05779',
        },
        {
          text: 'R. Dudek, J. Kuhn, P. Goldman, “Opening Eyes on Fiber Weave and CAF,” IPC technical paper, 2009: traditional against spread 1080 fabric, finite-element and HyperLynx skew.',
          url: 'https://www.electronics.org/system/files/technical_resource/E8%26S06_03.pdf',
        },
        {
          text: 'Isola, Glass Fabric (April 2022): p. 2 style table (warp and fill counts), p. 3 definitions of spread glass and square weave, p. 5 standard and spread 106.',
          url: 'https://www.isola-group.com/wp-content/uploads/Isola-Glass-Fabric-04_2022.pdf',
        },
      ]}
    >
      <p>
        <b>Glass-weave skew is the delay difference between the two traces of a differential pair when one runs over glass yarn and the other over resin. In Intel’s measurements
        the worst case was about 16 ps per inch (0.63 ps/mm), against a PCIe intra-pair routing rule of 5 mil, which is under 1 ps <Cite n={[1, 2]} />. At 16 GT/s and above, a few
        centimetres of unlucky alignment can use the whole skew budget, so the fix is the laminate and the routing angle, not length tuning.</b> This guide gives the formula, the
        length at which weave skew alone reaches a typical budget at each data rate, a worked PCIe Gen 4 example, and what each mitigation is worth according to published data.
      </p>
      <p>
        For what the glass style numbers mean and how resin content sets a ply’s Dk, see the <Link to="/guides/prepreg-glass-styles">prepreg glass styles guide</Link>.
      </p>

      <h2>Where the skew comes from</h2>
      <p>
        E-glass has a dielectric constant of about 6 and epoxy about 3 <Cite n={4} />. A laminate is a woven glass fabric filled with resin, so the local Dk under a trace depends on
        whether it runs along a yarn, between yarns or over a crossing. The higher the Dk, the slower the signal, so the trace over glass arrives later than the trace over resin{' '}
        <Cite n={1} />. TI notes that the effect shows up in the differential S-parameters from about 2 GHz, that it varies from board to board, and that this variance makes it hard to
        diagnose <Cite n={4} />.
      </p>
      <p>
        Skew between D+ and D− turns part of the differential signal into common mode. That closes the eye at the receiver and adds to EMI <Cite n={[1, 3]} />.
      </p>

      <h2>The formula</h2>
      <p className="eq">
        Δt / L = (√Dk<sub>max</sub> − √Dk<sub>min</sub>) / c
      </p>
      <p>
        This follows from the delay of a line, t<sub>pd</sub> = √Dk / c <Cite n={1} />, applied to two traces that see different Dk over the same length L. With c in the units used here,
        1 / c = 3.336 ps/mm (84.7 ps/in). For a stripline, Dk is the laminate value; on a microstrip it is the effective Dk of laminate, mask and air <Cite n={1} />, so less of the field sees the weave.
      </p>
      <p>
        <b>Which Dk values to use.</b> Simonovich proposes taking the lowest-Dk prepreg of a material family (106, the most resin-rich) as Dk<sub>min</sub> and the highest (7628, the
        most glass-rich) as Dk<sub>max</sub>, from the laminate maker’s tables <Cite n={1} />. Across the material families he analysed, the mean difference was 0.72 with a 3-sigma
        tolerance of 0.09, so at most about 0.81, which agrees with the 0.8 Intel derived from its measurements <Cite n={1} />. His FR-4 example uses Dk<sub>min</sub> = 3.30 and
        Dk<sub>max</sub> = 4.02 <Cite n={1} />:
      </p>
      <p className="eq">(√4.02 − √3.30) × 3.336 ps/mm = 0.628 ps/mm = 16.0 ps/in</p>
      <p>
        That matches the measurements. Intel compiled more than 58,000 TDR and TDT measurements on hundreds of test boards from different laminates and fabricators. The mean
        differential skew was 3.85 ps/in with a standard deviation of 4.15 ps/in, so 99.7 % of values were within 16.3 ps/in, and Intel set its cut-off at 15 ps/in <Cite n={[1, 2]} />.
        The mean is small; the problem is the tail.
      </p>
      <TryIt to="/timing?src=stripline&er=3.3">Delay per mm at Dk 3.30 in the Propagation Delay tool</TryIt>
      <TryIt to="/timing?src=stripline&er=4.02">The same at Dk 4.02: the difference is the worst-case skew per mm</TryIt>

      <h2>It shows up as a notch in insertion loss</h2>
      <p>
        A pair with a total skew Δt has a null in its differential insertion loss at f<sub>0</sub> = 1 / (2 × Δt), with odd harmonics above it <Cite n={1} />. Simonovich’s simulation of
        8.6 in at Dk 3.30 / 4.02 put the null at 3.6 GHz, with harmonics at 10.8 and 18 GHz <Cite n={1} />; the formula above gives 137 ps over that length and 3.64 GHz. Note what the
        formula implies: when the skew reaches one unit interval (UI), the null lands exactly on the Nyquist frequency, 1 / (2 × UI). In the PCIe Gen 2 simulation of the I-Connect007
        article, at 16 ps/in the eye started to degrade at 5.6 in and was fully closed at 12.7 in, where the null reached the 2.5 GHz Nyquist frequency <Cite n={3} />.
      </p>

      <h2>How long a pair can be at each data rate</h2>
      <p>
        Simonovich budgets 0.21 UI for intra-pair skew in his PCIe CEM Rev. 2.0 case study, taken from the PCIe external cabling specification, and concludes it is a reasonable
        figure <Cite n={1} />. The table applies that budget to faster rates. It is a planning number, not a specification: your receiver and channel decide the real margin.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Data rate (NRZ)</th>
            <th className="v">UI</th>
            <th className="v">0.21 UI</th>
            <th className="v">Length at 0.628 ps/mm (worst case)</th>
            <th className="v">Length at 0.099 ps/mm (spread glass)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>5 GT/s (PCIe Gen 2)</td><td className="v">200 ps</td><td className="v">42 ps</td><td className="v">67 mm (2.6 in)</td><td className="v">423 mm (16.7 in)</td></tr>
          <tr><td>8 GT/s (PCIe Gen 3)</td><td className="v">125 ps</td><td className="v">26 ps</td><td className="v">42 mm (1.6 in)</td><td className="v">265 mm (10.4 in)</td></tr>
          <tr><td>16 GT/s (PCIe Gen 4)</td><td className="v">62.5 ps</td><td className="v">13 ps</td><td className="v">21 mm (0.8 in)</td><td className="v">132 mm (5.2 in)</td></tr>
          <tr><td>32 GT/s (PCIe Gen 5)</td><td className="v">31.25 ps</td><td className="v">6.6 ps</td><td className="v">10 mm (0.4 in)</td><td className="v">66 mm (2.6 in)</td></tr>
        </tbody>
      </table>
      <p>
        The 5 GT/s row reproduces Simonovich’s result that a pair can exceed 42 ps after only 2.6 in <Cite n={1} />. The spread-glass column uses the worst-case skew that Dudek, Kuhn and
        Goldman predicted for a 100 Ω pair on spread 1080 fabric in a low-loss resin, 2.52 ps/in, against 13.8 ps/in for the traditional weave of the same style <Cite n={6} />. The worst
        case is a statistical tail: as Simonovich puts it, a design over the length does not have to fail, but if you build enough boards, some will degrade <Cite n={1} />.
      </p>

      <h2>Worked example: a 60 mm PCIe Gen 4 pair</h2>
      <p>
        A 60 mm (2.4 in) stripline pair at 16 GT/s, routed straight along the board edge, so parallel to the weave:
      </p>
      <ul>
        <li>
          <b>Traditional weave, worst case:</b> 60 × 0.628 = 37.7 ps of skew, 0.60 UI at 62.5 ps. The null sits at 1 / (2 × 37.7 ps) = 13.3 GHz, 1.7 times the 8 GHz Nyquist frequency.
          Most boards will be far better than this (the mean is a quarter of the tail), but a fraction of a production run will not.
        </li>
        <li>
          <b>Spread glass, worst case:</b> 60 × 0.099 = 6.0 ps, 0.095 UI, with the null near 84 GHz, out of the band that matters.
        </li>
        <li>
          <b>The routing rule:</b> the PCIe CEM intra-pair limit of 5 mil on an add-in card <Cite n={1} /> is 0.127 mm, which at 6–7 ps/mm is under 1 ps. Matching the lengths to 5 mil
          does nothing about 38 ps of weave skew, and since the weave skew depends on where the traces happen to fall on the glass <Cite n={1} />, you cannot predict it at layout time
          and tune it out.
        </li>
      </ul>
      <TryIt to="/interface-rules">Check the skew and length rules for PCIe and other interfaces</TryIt>

      <h2>Choosing the glass</h2>
      <p>
        The weave pitch is the spacing of the yarns, 25.4 mm divided by the count per inch. These are the counts from Isola’s style table <Cite n={7} />:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Style</th>
            <th className="v">Warp × fill count (ends/in)</th>
            <th className="v">Pitch, warp × fill</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1035</td><td className="v">66 × 68</td><td className="v">0.385 × 0.374 mm</td><td>Square</td></tr>
          <tr><td>1067</td><td className="v">70 × 70</td><td className="v">0.363 × 0.363 mm</td><td>Square</td></tr>
          <tr><td>106</td><td className="v">56 × 56</td><td className="v">0.454 × 0.454 mm</td><td>Square, open</td></tr>
          <tr><td>1078</td><td className="v">54 × 54</td><td className="v">0.470 × 0.470 mm</td><td>Square</td></tr>
          <tr><td>1086</td><td className="v">60 × 60</td><td className="v">0.423 × 0.423 mm</td><td>Square</td></tr>
          <tr><td>1080</td><td className="v">60 × 47</td><td className="v">0.423 × 0.540 mm</td><td>Unbalanced</td></tr>
          <tr><td>3313</td><td className="v">61 × 62</td><td className="v">0.416 × 0.410 mm</td><td>Square</td></tr>
          <tr><td>2116</td><td className="v">60 × 58</td><td className="v">0.423 × 0.438 mm</td><td>Near square</td></tr>
          <tr><td>7628</td><td className="v">44 × 31</td><td className="v">0.577 × 0.819 mm</td><td>Unbalanced, coarse</td></tr>
        </tbody>
      </table>
      <p>
        A pitch of about 0.4 mm is the same order as the spacing of a differential pair, which is why the position of a pair on the weave matters. Isola calls a fabric with balanced
        counts a square weave, and spread glass a fabric whose yarns have been spread out; its photographs of 106 show the open windows between yarns narrowing when the glass is
        spread, and it describes spread glass in both directions as the current industry standard <Cite n={7} />.
      </p>
      <p>What the published data says about the choice:</p>
      <ul>
        <li>
          <b>Spread against traditional weave of the same style:</b> 2.52 against 13.8 ps/in predicted worst case for 1080 in a low-loss resin, and a measured range of laminate Dk
          across trace positions of 0.14 against 0.50 <Cite n={6} />. This is the largest single improvement in the data.
        </li>
        <li>
          <b>Style substitutions:</b> for Isola FR408HR, the I-Connect007 article suggests 1086 in place of 1080, 1067 in place of 106, and two plies of 3313 in place of one 7628{' '}
          <Cite n={3} />. Each swaps an open or unbalanced weave for a tighter, square one of similar thickness.
        </li>
        <li>
          <b>Style still matters within a model:</b> Manukovsky, Shlepnev and Mordooch simulated 4 mil traces 4 mil apart over a 4 mil laminate (glass Dk 6, resin 3.5) for four styles.
          With the pair at a random position, the skew exceeded 3 ps/in in about 44 % of cases for 1078, 66 % for 1080 and 76 % for 3313, and only 1035 stayed under that limit{' '}
          <Cite n={5} />. They also note that wider traces average the dielectric and see less variation, so the result depends on the trace geometry <Cite n={5} />.
        </li>
        <li>
          <b>Resin and glass Dk:</b> the bigger the difference between them, the bigger the skew. With a traditional weave, the FR-4 resin in Dudek’s study gave less skew than the
          low-loss resin (9.71 against 13.8 ps/in predicted), because its Dk is closer to that of the glass <Cite n={6} />. Low-loss materials therefore need the glass choice more, not less.
        </li>
      </ul>

      <h2>Routing at an angle</h2>
      <p>
        If a pair runs at an angle to the weave, each trace crosses yarns and gaps in turn and both see the same average Dk. TI describes two ways <Cite n={4} />:
      </p>
      <ul>
        <li>
          <b>Rotate the image.</b> The whole signal layer is rotated 10° to 35° relative to the weave. The fabricator can do this without any change to your layout data.
        </li>
        <li>
          <b>Zig-zag routing.</b> The pair is routed in a zig-zag across the board instead of straight along x or y.
        </li>
      </ul>
      <p>
        Intel’s paper proposed 10° for long traces, or a 10° panel rotation <Cite n={[2, 3]} />. Both work, but the I-Connect007 article calls them a hassle to implement and expensive{' '}
        <Cite n={3} />. A rotated image generally fits fewer boards on a production panel, so ask the fabricator before relying on it.
      </p>
      <p>
        The angle needed is small because of the pitch. A trace at angle θ moves sideways by one weave pitch every p / tan θ along its length. For a 0.423 mm pitch (1080 warp, 1086,
        2116) that is every 2.4 mm at 10° and every 1.6 mm at 15°, so a 60 mm pair crosses about 25 and 38 yarns and averages them out. For the 0.819 mm fill pitch of 7628 it is every
        4.6 mm at 10°. This is geometry, not a measured result: it shows why a few degrees are enough on a long run and why short straight segments are not the concern.
      </p>

      <h2>A checklist</h2>
      <ol>
        <li>Work out the skew budget for each fast interface. At 8 GT/s and above, assume weave skew can use most of it on long straight pairs.</li>
        <li>Specify spread glass for the layers under fast pairs and ask the fabricator which glass styles its stackup uses; prefer square weaves such as 1035, 1067, 1078, 1086 and 3313 over 106, 1080 and 7628.</li>
        <li>Keep long pairs off the 0° and 90° axes where the layout allows, or ask the fabricator to rotate the image of those layers by 10° or more.</li>
        <li>Match lengths to the interface rule, but do not count on length tuning to remove weave skew.</li>
        <li>For PCIe Gen 4 and Gen 5, low-loss laminates, and pairs longer than a few centimetres, simulate the channel with Dk<sub>min</sub> and Dk<sub>max</sub> as Simonovich describes <Cite n={1} />.</li>
      </ol>
      <TryIt to="/stackup">Build the stackup ply by ply and note the glass style of each layer</TryIt>
      <TryIt to="/impedance">Size the pair in the impedance calculator</TryIt>
    </Guide>
  );
}
