import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function PthHoleGuide() {
  return <Guide sources={[
    { text: 'PCB 3D, How to calculate PTH hole and pad diameter sizes according to IPC-7251, IPC-2222 and IPC-2221 standards?: hole over lead by level, 0.05 mm annular ring, 0.6/0.5/0.4 mm fabrication allowance and the 0.55 mm lead example.', url: 'https://www.pcb-3d.com/tutorials/how-to-calculate-pth-hole-and-pad-diameter-sizes-according-to-ipc-7251-ipc-2222-and-ipc-2221-standards/' },
    { text: 'Z. Peterson, PCB Via Size and Pad Size Guidelines, Altium, January 2022 (updated July 2025): L = a + 2b + c, IPC-2221 fabrication allowances 16/10/8 mil, IPC-2221 and IPC-6012 annular ring by class.', url: 'https://resources.altium.com/p/pcb-size-and-pad-size-guidelines' },
    { text: 'R. Miller (NCAB Group), Fresh PCB Concepts: How Large Does That Pad Really Need to Be?, I-Connect007, 4 October 2022: drill versus finished hole, Table 9-1 Level B and its copper and layer-count notes, a Class 3 land example.', url: 'https://iconnect007.com/article/133540/fresh-pcb-concepts-how-large-does-that-pad-really-need-to-be/133543/pcb' },
    { text: 'T. Hausherr, IPC-7251 & 3-Tier PTH Pad Stack Obsolete, PCB Libraries forum, 5 November 2014: IPC-7251 was never published; through-hole content moved to IPC-7351C.', url: 'https://www.pcblibraries.com/forum/printer_friendly_posts.asp?TID=1463' },
    { text: 'T. Hausherr and others, Proportional Through-hole Padstacks, PCB Libraries forum, 2012: 0.2 mm nominal lead-to-hole value from the IPC-2222 chart, and a proportional thermal-relief convention.', url: 'https://www.pcblibraries.com/forum/printer_friendly_posts.asp?TID=90' },
    { text: 'PCBPlanner Through-Hole Padstack Calculator, Method: implemented allowances, IPC-2221 §9.1.1 land equation, IPC-2222 §9.1.2 thermal webs, IPC-7251 padstack chart values for thermal relief and antipad, and unverified defaults.', url: 'https://www.pcbplanner.com/padstack#method' },
  ]}>
    <p><b>Make the finished (plated) hole the maximum lead diameter plus 0.25 mm at density Level A, 0.20 mm at Level B or 0.15 mm at Level C. Make the pad the finished hole plus twice the minimum annular ring of 0.05 mm plus a fabrication allowance of 0.6, 0.5 or 0.4 mm.</b> A 1.0 mm round lead at Level B therefore gets a 1.20 mm hole and a 1.80 mm pad. <Cite n={[1, 6]} /> These are the rules the Through-Hole Padstack calculator applies. This guide shows where each number comes from, works three common leads, and covers the drilled hole, inner layers and plane connections.</p>

    <h2>The two equations</h2>
    <p>The equations calculate the dimensions after the design allowances have been chosen. They do not determine the correct density level, annular ring or fabrication allowance for a particular process. The preset values below and your entered overrides remain separate inputs to that calculation.</p>
    <div className="eq">Hole = <i>d</i><sub>lead,max</sub> + hole allowance &nbsp;&nbsp; Pad = <i>a</i> + 2<i>b</i> + <i>c</i></div>
    <p>Here <i>d</i><sub>lead,max</sub> is the largest lead diameter on the component drawing, not the nominal one. In the pad equation, <i>a</i> is the hole, <i>b</i> the minimum annular ring and <i>c</i> the fabrication allowance. IPC-2221 defines <i>a</i> as the maximum finished hole on external layers and the drilled hole on internal layers. <Cite n={[2, 3]} /> The fabrication allowance is a margin for the fabricator's process tolerances, chosen by supplier capability, so that the ring left at the worst point is still at least <i>b</i>. <Cite n={3} /></p>
    <table className="tbl"><thead><tr><th>Value used by the calculator, mm</th><th className="v">Level A</th><th className="v">Level B</th><th className="v">Level C</th></tr></thead><tbody>
      <tr><td>Hole over maximum lead</td><td className="v">0.25</td><td className="v">0.20</td><td className="v">0.15</td></tr>
      <tr><td>Fabrication allowance, IPC-7251 basis (default)</td><td className="v">0.60</td><td className="v">0.50</td><td className="v">0.40</td></tr>
      <tr><td>Fabrication allowance, IPC-2221 Table 9-1 basis</td><td className="v">0.40</td><td className="v">0.25</td><td className="v">0.20</td></tr>
      <tr><td>Minimum annular ring, external / internal</td><td className="v" colSpan={3}>0.05 / 0.03</td></tr>
    </tbody></table>
    <p>Level A gives the most clearance and copper (low density); Level C gives the least (high density). The calculator rounds the hole, pads and thermal relief up to 0.05 mm by default. <Cite n={6} /></p>

    <h2>Where the numbers come from</h2>
    <p>The hole allowances are the IPC-2222 values quoted by PCB 3D. <Cite n={1} /> Tom Hausherr gives the same 0.2 mm (8 mil) as the nominal lead-to-hole value of the IPC-2222 chart. <Cite n={5} /> The 0.05 mm minimum annular ring is the IPC-2221 external value (2 mil). <Cite n={[1, 2]} /> The calculator's 0.03 mm internal ring is from IPC-2221 (1998) Table 9-2; Altium lists 1 mil (0.025 mm). <Cite n={[2, 6]} /></p>
    <p>The sources disagree on the fabrication allowance. PCB 3D gives 0.6, 0.5 and 0.4 mm and calls them IPC-2221 values. <Cite n={1} /> Altium gives the IPC-2221 allowances as 16, 10 and 8 mil (0.4, 0.25 and 0.2 mm), and NCAB, which names them as IPC-2221 Table 9-1, quotes 0.00984 in (0.25 mm) for Level B. <Cite n={[2, 3]} /> The calculator offers both. Its default, labelled IPC-7251, uses 0.6/0.5/0.4 mm and reproduces the PCB 3D example. The IPC-2221 option uses 0.4/0.25/0.2 mm. It adds NCAB’s two IPC-2221 rules: 0.05 mm (0.00197 in) per ounce of copper above 1 oz, and another 0.05 mm, once, above eight layers. <Cite n={[3, 6]} /> Altium’s footnote gives the same two additions as 20 mil, ten times NCAB’s figure; the calculator follows NCAB, whose 0.00197 in matches the scale of the 8–16 mil allowances. <Cite n={2} /></p>
    <p>IPC-7251 itself was never released. The IPC land pattern committee stopped work on it on 1 October 2014 and moved through-hole patterns into IPC-7351C. <Cite n={4} /> Values labelled IPC-7251 in libraries and calculators, including this one, come from its draft and the charts built on it.</p>
    <p>As a check, PCB 3D's 0.55 mm lead gives holes of 0.80, 0.75 and 0.70 mm and pads of 1.50, 1.35 and 1.20 mm at Levels A, B and C. <Cite n={1} /> The calculator returns the same values, and its unit tests check them.</p>
    <TryIt to="/padstack?ld=0.55">Check the 0.55 mm example in the Padstack calculator</TryIt>

    <h2>Worked examples: 0.64 mm square pin, 0.8 mm and 1.0 mm leads</h2>
    <p>Each lead was run through the calculator's code at its defaults: IPC-7251 allowance, zero hole tolerance and rounding to 0.05 mm. The annular ring shown is the nominal (pad − hole)/2. In every row the worst-case external ring, after the fabrication allowance is used up, is 0.05 mm.</p>
    <table className="tbl"><thead><tr><th>Lead (maximum)</th><th>Level</th><th className="v">Finished hole, mm</th><th className="v">Outer pad, mm</th><th className="v">Nominal ring, mm</th></tr></thead><tbody>
      <tr><td>0.64 × 0.64 mm square (diagonal 0.905 mm)</td><td>A</td><td className="v">1.20</td><td className="v">1.90</td><td className="v">0.35</td></tr>
      <tr><td></td><td>B</td><td className="v">1.15</td><td className="v">1.75</td><td className="v">0.30</td></tr>
      <tr><td></td><td>C</td><td className="v">1.10</td><td className="v">1.60</td><td className="v">0.25</td></tr>
      <tr><td>0.8 mm round</td><td>A</td><td className="v">1.05</td><td className="v">1.75</td><td className="v">0.35</td></tr>
      <tr><td></td><td>B</td><td className="v">1.00</td><td className="v">1.60</td><td className="v">0.30</td></tr>
      <tr><td></td><td>C</td><td className="v">0.95</td><td className="v">1.45</td><td className="v">0.25</td></tr>
      <tr><td>1.0 mm round</td><td>A</td><td className="v">1.25</td><td className="v">1.95</td><td className="v">0.35</td></tr>
      <tr><td></td><td>B</td><td className="v">1.20</td><td className="v">1.80</td><td className="v">0.30</td></tr>
      <tr><td></td><td>C</td><td className="v">1.15</td><td className="v">1.65</td><td className="v">0.25</td></tr>
    </tbody></table>
    <p>With the IPC-2221 allowance instead, the outer pads at Level B are 1.50 mm for the square pin, 1.35 mm for the 0.8 mm lead and 1.55 mm for the 1.0 mm lead.</p>
    <h3>Square and rectangular leads use the diagonal</h3>
    <p>A drilled hole is round, so the corners of a square or rectangular lead must clear it. The calculator therefore sizes the hole from the lead diagonal √(<i>W</i><sup>2</sup> + <i>T</i><sup>2</sup>). <Cite n={6} /> For a 0.64 mm square pin, such as a 2.54 mm header pin, that is 0.905 mm, and the Level B hole is 1.15 mm, not 0.85 mm. Take <i>W</i> and <i>T</i> as maxima from the connector drawing. At 2.54 mm pitch the Level A, B and C pads leave 0.64, 0.79 and 0.94 mm of space between adjacent pads.</p>
    <TryIt to="/padstack?lead=rect">Load the 0.64 mm square pin at Level B</TryIt>
    <TryIt to="/padstack?ld=0.8">Load the 0.8 mm round lead</TryIt>
    <TryIt to="/padstack?ld=1">Load the 1.0 mm round lead</TryIt>

    <h2>Finished hole, drilled hole and hole tolerance</h2>
    <p>The sizes above are finished holes, after plating. The fabricator drills larger to leave room for the barrel copper. NCAB gives the drill as typically 0.004 to 0.006 in (0.10 to 0.15 mm) larger than the finished hole, depending on the finish, and 0.004 in as enough for an electroless finish such as ENIG. <Cite n={3} /> The calculator assumes a 0.10 mm drill oversize. It is an editable default, not an IPC value; enter your fabricator's figure. <Cite n={6} /></p>
    <p>IPC-2221 sizes the outer land from the maximum finished hole, so a plus tolerance on the hole adds to the pad. <Cite n={[2, 3]} /> The calculator's default tolerance is zero, which matches the IPC-7251 charts. <Cite n={6} /> For the 1.0 mm lead at Level B with the IPC-2221 allowance and a +0.08 mm hole tolerance, the code gives:</p>
    <table className="tbl"><thead><tr><th>Quantity</th><th className="v">Tolerance 0</th><th className="v">Tolerance +0.08 mm</th></tr></thead><tbody>
      <tr><td>Finished hole / maximum finished hole</td><td className="v">1.20 / 1.20 mm</td><td className="v">1.20 / 1.28 mm</td></tr>
      <tr><td>Outer pad</td><td className="v">1.55 mm</td><td className="v">1.65 mm</td></tr>
      <tr><td>Inner pad (from the drilled hole: 1.30 mm, or 1.38 mm with the tolerance)</td><td className="v">1.65 mm</td><td className="v">1.70 mm</td></tr>
      <tr><td>Worst-case external ring</td><td className="v">0.050 mm</td><td className="v">0.060 mm</td></tr>
      <tr><td>Worst-case internal ring</td><td className="v">0.050 mm</td><td className="v">0.035 mm</td></tr>
    </tbody></table>
    <p>The worst-case rings are above 0.05 and 0.03 mm because the pads are rounded up to 0.05 mm.</p>
    <TryIt to="/padstack?ld=1&basis=ipc2221&tol=0.08">Load the 1.0 mm lead with IPC-2221 allowance and +0.08 mm tolerance</TryIt>

    <h2>Inner-layer pads</h2>
    <p>On internal layers IPC-2221 uses the drilled hole, which is larger than the finished hole, with the 0.03 mm internal ring. The IPC-7251 padstack default repeats the outer land on inner layers. The calculator reports the larger of the two. <Cite n={6} /> For the 1.0 mm lead at Level B with the default 0.10 mm drill oversize, the IPC-2221 minimum is 1.30 + 2 × 0.03 + 0.5 = 1.86 mm. Rounded up, that is 1.90 mm, so the inner pad is 0.10 mm larger than the 1.80 mm outer pad.</p>

    <h2>Thermal relief and antipad on plane layers</h2>
    <p>Where a pin connects to a plane, the calculator draws a thermal relief. Its inner diameter (ID) is the finished hole plus 0.60, 0.40 or 0.30 mm, and its outer diameter (OD) the hole plus 1.00, 0.70 or 0.50 mm, at Levels A, B and C. The antipad on unconnected planes equals the thermal OD. These values come from the IPC-7251 padstack charts published by PCB Matrix. They are a library convention: the IPC-2221 and IPC-2222 text leaves thermal geometry to the designer. <Cite n={6} /></p>
    <p>The spokes follow the rule usually cited from IPC-2222 §9.1.2: their total width is 60 % of the land diameter, split among the spokes and rounded up to 0.05 mm, and the combined web on one hole, over all connected planes, should not exceed 4.0 mm for 1 oz copper or 2.0 mm for 2 oz. <Cite n={6} /> IPC-2222 is not freely available and no free document we found states these figures, so treat them as the calculator’s assumption and check them against the standard or your assembler’s rule. For the 1.0 mm lead with four spokes on two planes at 1 oz:</p>
    <table className="tbl"><thead><tr><th>1.0 mm lead, mm</th><th className="v">Level A</th><th className="v">Level B</th><th className="v">Level C</th></tr></thead><tbody>
      <tr><td>Thermal ID</td><td className="v">1.85</td><td className="v">1.60</td><td className="v">1.45</td></tr>
      <tr><td>Thermal OD = antipad</td><td className="v">2.25</td><td className="v">1.90</td><td className="v">1.65</td></tr>
      <tr><td>Plane-to-drill gap, (antipad − drilled hole)/2</td><td className="v">0.45</td><td className="v">0.30</td><td className="v">0.20</td></tr>
      <tr><td>Spoke width (4 spokes)</td><td className="v">0.30</td><td className="v">0.30</td><td className="v">0.25</td></tr>
      <tr><td>Total web, 2 planes</td><td className="v">2.4</td><td className="v">2.4</td><td className="v">2.0</td></tr>
    </tbody></table>
    <p>All three are within the 4.0 mm guideline. The same Level B pin on four planes of 2 oz copper has a 4.8 mm total web against a 2.0 mm guideline, and the calculator warns that the hole may be hard to solder. Use fewer or narrower spokes, or connect fewer planes.</p>
    <TryIt to="/padstack?ld=1&oz=2&planes=4">See the web-width warning for four 2 oz planes</TryIt>
    <p>Other libraries use different conventions. Hausherr's proportional padstacks set the thermal ID 0.5 mm larger than the hole, the OD equal to the antipad, and the spoke width to 75 % of the antipad divided by four. <Cite n={5} /> If your fabricator or assembler has a thermal-relief rule, use it.</p>

    <h2>Annular ring by IPC class</h2>
    <p>The 0.05 mm ring is a design minimum. Whether a finished board passes is decided by IPC-6012 for the class in the procurement documents. <Cite n={3} /> IPC-6012 is not openly available, so the figures here are from secondary summaries. Altium summarises Class 3 as 2 mil (0.05 mm) external and 1 mil (0.025 mm) internal. For Class 2 it lists external breakout of less than 90° and internal breakout of up to 90° as acceptable. <Cite n={2} /> NCAB's Class 3 example uses the same 0.002 in and 0.001 in. <Cite n={3} /> With its default allowances, the calculator keeps a 0.05 mm external and 0.03 mm internal ring at the worst case. That meets these Class 3 figures as long as the fabrication allowance covers your fabricator's real drill and registration tolerance. Confirm the class and the fabricator's capability before relying on it.</p>

    <h2>What the calculator does not check</h2>
    <ul>
      <li>A maximum hole size relative to the minimum lead. IPC-2222 also limits how much larger the hole may be than the lead. <Cite n={6} /></li>
      <li>Rectangular lands for rectangular leads. It draws square lands at the calculated minimum size; a longer land is your choice. <Cite n={6} /></li>
      <li>Non-plated holes, press-fit pins and the solder fill of the barrel.</li>
    </ul>

    <h2>Checklist</h2>
    <ol>
      <li>Take the maximum lead diameter from the component drawing. For a square or rectangular lead, use the diagonal of the maximum width and thickness.</li>
      <li>Choose the density level. Level A gives the most clearance and copper, Level C the least.</li>
      <li>Finished hole = maximum lead + 0.25, 0.20 or 0.15 mm, rounded up to the fabricator's drill step.</li>
      <li>Ask the fabricator for the drill oversize and the plus tolerance of the finished hole, and enter both.</li>
      <li>Pad = hole + 2 × 0.05 mm + fabrication allowance. Check that the worst-case ring is at least 0.05 mm outside and 0.03 mm inside.</li>
      <li>Check the space between adjacent pads at the part's pitch.</li>
      <li>On plane layers, check the thermal relief, the total web against the copper weight, and the antipad clearance to the drilled hole.</li>
      <li>State the finished hole sizes and the IPC class on the fabrication drawing.</li>
    </ol>
    <TryIt to="/padstack">Open the Through-Hole Padstack calculator</TryIt>
    <p>Vias are sized differently: no lead goes through them, so current, voltage drop and aspect ratio set the hole. See the <Link to="/guides/pcb-via-current-capacity">via current guide</Link> for worked examples.</p>
    <TryIt to="/via">Size a via in the Via Calculator</TryIt>
  </Guide>;
}
