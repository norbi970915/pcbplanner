import { Link } from 'react-router-dom';
import { CrossSection } from '../components/CrossSection';
import { Cite, Guide, TryIt } from './Guide';

const example = '/impedance?type=stripline&mode=diff&coupling=edge&w=0.15&etch=0&t=0.035&s=0.15&h=0.1&h2=0.1&er=4&er2=4&mat=custom&mat2=custom&dl=&dl2=&cpw=0&target=65&acc=high';

export default function ResinRichLayer() {
  return <Guide sources={[
    { text: 'A. Staniforth and M. Gaudion, The Effect of Etch Taper, Prepreg and Resin Flow on the Value of the Differential Impedance, application note AP148 (2002), pp. 2-3: lamination, resin flow and a microsection photograph. The numerical tables describe different geometries from our worked example.', url: 'https://www.polarinstruments.com/support/cits/AP148.pdf' },
    { text: 'Application note AP8518, Modeling Impedance Structures with a Planar Resin Layer: the flat-layer construction and the warning about resistance offsets when correlating TDR measurements.', url: 'https://www.polarinstruments.com/support/cits/AP8518.html' },
    { text: 'Isola, Chandler Johann Schumacher Laboratory, Test Capabilities (February 2021), pp. 7-8: reported Dk/Df reflect both glass and resin and depend on resin content; measurement methods and field direction.', url: 'https://www.isola-group.com/wp-content/uploads/JSL_Test_Cap_2-2021-1.pdf' },
    { text: 'M. Gaudion and J. A. Staniforth, Impedance Modelling on Multiple Dielectric Builds, Circuit World 30(2), 2004, pp. 12-19, section 3.3: capacitance with dielectric and air, and the corresponding impedance relationship.', url: 'https://www.polarinstruments.com/support/cits/Gaudion_CW_2004_30.pdf' },
    { text: 'PCB Planner impedance calculator: our finite-volume implementation, model definitions and numerical checks. Worked-example values below were calculated using High mesh accuracy; they are not laboratory measurements.', url: '/impedance' },
  ]}>
    <p><b>The material beside an internal trace need not have the same dielectric constant as the laminate below it.</b> When prepreg is pressed over etched copper, resin fills the spaces left by etching. The resulting local mix of resin and glass can differ from the bulk material quoted in a datasheet <Cite n={1} />. A resin-rich layer model makes that difference explicit instead of hiding it inside one adjusted Dk.</p>
    <p>This guide explains the flat-layer option in the <Link to="/impedance">impedance calculator</Link>, defines its dimensions and gives an example you can reproduce. You supply the region's Dk and thickness; the calculator does not predict either from a glass style or a resin percentage.</p>

    <h2>Three different descriptions of the dielectric</h2>
    <p>A bulk model gives an entire core or prepreg ply one Dk. That is a useful starting point, but it averages over the material's internal structure. Manufacturer test data describe a glass/resin composite, with results that depend on construction and measurement conditions <Cite n={3} />.</p>
    <p>A local resin pocket describes a lower-glass region between particular traces. A planar resin layer instead assigns a separate Dk to a flat band across the signal layer <Cite n={[1, 2]} />. PCB Planner implements the planar case. It does not claim that every manufactured cross-section contains a perfectly flat, pure-resin film.</p>
    <p>Glass-weave skew is another question: it concerns the different delays accumulated by two traces as they pass over different yarn and resin positions along a route. A uniform cross-section does not describe that longitudinal variation. See the <Link to="/guides/glass-weave-skew">glass-weave skew guide</Link> for that model.</p>

    <h2>Exactly where the resin band goes</h2>
    <p>The lower surface of the trace remains H above the lower ground plane. Copper thickness is T. H2 is the distance from the trace top to the upper ground plane, or to the cover surface for embedded microstrip. The optional input R is only the resin thickness <i>above the copper top</i>.</p>
    <CrossSection spec={{type:'stripline',diff:true,w:0.15,wTop:0.15,t:0.035,s:0.15,h:0.1,h2:0.1,er:4,er2:4,mask:false,cpw:false,gap:0.2,resin:{above:0.02,er:3.2}}} unitLabel="mm" toUnit={v=>v} />
    <p className="eq">Resin-band height = T + R; remaining upper dielectric height = H2 - R</p>
    <p>These are geometry definitions for this implementation. The band starts at the copper bottom and fills the dielectric beside the copper as well as the extra height R. It replaces the original material there. H, H2 and the ground-plane positions stay unchanged; adding resin does not make the board thicker.</p>
    <p><b>R = 0 does not turn the model off.</b> It leaves a band of height T beside the copper, with no extra resin above it. Use the checkbox to return to the original composite-material model. R may reach H2, in which case the band replaces all of the upper dielectric. With stacked upper plies, the same boundary cuts through whichever plies it reaches.</p>

    <h2>A worked comparison with assumed materials</h2>
    <p>The following dimensions and Dk values are deliberately chosen example inputs, not a proposed production stackup or a named material's properties. Both rectangular traces are 0.15 mm wide, separated by a 0.15 mm copper gap, with T = 0.035 mm. Each outer copper face is 0.10 mm from its ground plane. Lower and upper composites have assumed Dk = 4.0; the resin region has assumed Dk = 3.2. The geometry and material values are held fixed between cases except for the stated band.</p>
    <table className="tbl"><thead><tr><th>Model</th><th>R above copper</th><th>Differential impedance</th></tr></thead><tbody>
      <tr><td>Composite throughout; resin option off</td><td>Not applicable</td><td>64.07 Ω</td></tr>
      <tr><td>Resin beside the copper only</td><td>0 mm</td><td>65.00 Ω</td></tr>
      <tr><td>Resin beside and above the copper</td><td>0.020 mm</td><td>66.12 Ω</td></tr>
    </tbody></table>
    <p>These are our field-solver results at High accuracy, rounded to two decimal places <Cite n={5} />. The last case is about 2.06 Ω, or 3.2 %, above the original. That change belongs to these assumptions; it is not a correction to add to every differential pair. At Normal accuracy the first and last results are 63.80 and 65.84 Ω, illustrating why mesh sensitivity should be checked before interpreting a small difference.</p>
    <TryIt to={example + '&resin=0&resinDk=0&resinAbove=0'}>Open the composite baseline</TryIt>
    <TryIt to={example + '&resin=1&resinDk=3.2&resinAbove=0'}>Model resin beside the copper, with R = 0</TryIt>
    <TryIt to={example + '&resin=1&resinDk=3.2&resinAbove=0.02'}>Add the 0.020 mm band above the copper</TryIt>
    <p>To compare a different design, save the composite case as A using the comparison control, enable the layer and enter its properties, then compare the changed inputs and results. Save to a project if you want to reopen the setup later.</p>

    <h2>Why the impedance changes</h2>
    <p>The solver assigns the entered permittivity to each dielectric region and calculates capacitance from the electrostatic field. It repeats the calculation with the dielectric replaced by air. For a single line, or for each differential mode, the quasi-static relationship is <Cite n={4} />:</p>
    <p className="eq">Z = 1 / (c √(C C<sub>air</sub>)); Z<sub>diff</sub> = 2 Z<sub>odd</sub></p>
    <p>For this comparison the conductors do not move, so the air calculation is unchanged. Replacing a region by a lower Dk reduces its capacitive loading and raises the corresponding impedance. How much it changes depends on where the field energy lies. The calculator therefore solves the layered cross-section; it does not substitute a thickness-weighted average Dk or add a fixed percentage.</p>

    <h2>What to ask the fabricator</h2>
    <ul>
      <li>The finished copper cross-section, including etch taper, and the pressed copper-to-plane clearances.</li>
      <li>Whether a separate resin-rich region is justified for this construction, and how its thickness is measured.</li>
      <li>A suitable local Dk at the frequency of interest, with its source and whether it includes any filler or remaining glass.</li>
      <li>Which dimensions and material values their impedance prediction and coupon measurements actually represent.</li>
    </ul>
    <p>A resin percentage for the whole ply does not by itself specify the Dk or thickness of this local band. The material-library Dk is a composite value <Cite n={3} />. If regional data are unavailable, vary explicit assumptions to see how sensitive your design is and retain the fabricator's approved stackup for fabrication. The <Link to="/guides/prepreg-glass-styles">prepreg guide</Link> explains the difference between glass style, resin content and finished thickness.</p>

    <h2>Limits and checks before using the result</h2>
    <p>The option supports single-ended and edge-coupled embedded microstrip or stripline. The band is uniform across the section; it does not calculate local pockets, resin flow, individual fibres, lower-side resin films, registration error or weave-induced skew. Surface microstrip and broadside pairs use their existing models without this option.</p>
    <p>Width and spacing targeting keep the resin band in place. A height sweep scales all dielectric clearances, including R, while keeping T fixed. A Dk sweep scales every dielectric, including the resin region. The fabrication corner check uses those same rules; it does not estimate an independent resin-process tolerance.</p>
    <p>Our automated checks cover equal-Dk limits, mesh refinement, target solving and a wide-strip limit derived from capacitors in series and parallel <Cite n={5} />. Those checks establish numerical consistency, not an accuracy percentage against fabricated resin-rich boards. The calculator's separate coated-microstrip validation does not establish accuracy for this feature.</p>
    <p>When correlating a coupon measurement, account for the apparent TDR impedance rise caused by conductor resistance before adjusting Dk. Otherwise a fitted dielectric value can compensate for the wrong effect <Cite n={2} />. Final dimensions and impedance limits need agreement with the fabricator.</p>
  </Guide>;
}
