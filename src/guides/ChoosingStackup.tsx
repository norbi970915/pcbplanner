import { Link } from 'react-router-dom';
import { DEFAULT_STACKUP_ID } from '../data/rigidStackupRules';
import { Cite, Guide, TryIt } from './Guide';

export default function ChoosingStackup() {
  return <Guide sources={[
    { text: 'H. W. Ott, Electromagnetic Compatibility Engineering, Wiley, 2009: reference planes and return-current paths.' },
    { text: 'E. Bogatin, Signal and Power Integrity – Simplified, 3rd ed., Prentice Hall, 2018: transmission-line geometry and impedance.' },
  ]}>
    <p>A stackup is a routing decision as well as a mechanical one. It defines which layers can carry signals, where their return currents flow, and the dielectric distances used to calculate impedance. Start with those needs, then agree the physical construction with your fabricator.</p>
    <p>This guide uses original PCBPlanner examples generated from explicit thickness budgets. Their materials and dimensions are modelling assumptions. They help compare design choices; they do not describe a stocked laminate build or guarantee manufacturing capability.</p>

    <h2>Assign signal layers and reference planes first</h2>
    <p>Give fast signals a continuous adjacent reference plane. A split, slot or missing return connection can interrupt the return path even when the trace width is correct. When a signal changes its ground reference, a nearby ground via can connect the return paths. A transition between different reference nets needs its own return-path design. <Cite n={[1, 2]} /></p>
    <table className="tbl"><thead><tr><th>Copper layers</th><th>Illustrative roles, top to bottom</th><th>Design consideration</th></tr></thead><tbody>
      <tr><td>2</td><td>Signal · Ground</td><td>Preserve the ground layer rather than cutting it up with routing. The full core separates signals from ground.</td></tr>
      <tr><td>4</td><td>Signal · Ground · Ground · Signal</td><td>Both outer routing layers have a ground reference. Route power on suitable pours or traces.</td></tr>
      <tr><td>6</td><td>Signal · Ground · Signal · Plane · Ground · Signal</td><td>An additional routing layer sits between planes. Assign the plane nets and check return paths before routing.</td></tr>
    </tbody></table>
    <p>These assignments are choices, not mandatory layer orders. In the editor, “plane” means a solid reference for the cross-section calculation; it does not check the actual copper artwork. Close dielectric spacing cannot compensate for a broken reference plane.</p>

    <h2>Separate board thickness from signal-to-plane spacing</h2>
    <p>Two boards can both be 1.6 mm thick and need very different trace widths. What matters to a particular trace is the distance to its reference plane, the material between them, copper thickness, neighbouring conductors and any coating. A thinner signal-to-plane gap generally needs a narrower trace for the same impedance. <Cite n={2} /></p>
    <p>Our examples subtract the copper from the target board thickness, then distribute the remaining dielectric. Outer copper is assumed to be 35 µm and inner copper 18 µm. The board thickness in this calculation excludes solder mask.</p>
    <p><b>Dielectric budget = board thickness − 2 × outer copper thickness − (N − 2) × inner copper thickness.</b></p>
    <p>An equal-gap example divides this budget across all N − 1 gaps. A close-outer-plane example assigns 0.100 mm to each outer gap and divides the remainder across the N − 3 inner gaps. These rules produce mirrored physical thicknesses without looking up a fabrication catalogue.</p>
    <table className="tbl"><thead><tr><th>1.6 mm example</th><th className="v">Copper budget</th><th className="v">Dielectric budget</th><th className="v">Each outer gap</th><th className="v">Each inner gap</th></tr></thead><tbody>
      <tr><td>4 layers · equal gaps</td><td className="v">0.106 mm</td><td className="v">1.494 mm</td><td className="v">0.498 mm</td><td className="v">0.498 mm</td></tr>
      <tr><td>4 layers · close outer planes</td><td className="v">0.106 mm</td><td className="v">1.494 mm</td><td className="v">0.100 mm</td><td className="v">1.294 mm</td></tr>
      <tr><td>6 layers · equal gaps</td><td className="v">0.142 mm</td><td className="v">1.458 mm</td><td className="v">0.2916 mm</td><td className="v">0.2916 mm</td></tr>
      <tr><td>6 layers · close outer planes</td><td className="v">0.142 mm</td><td className="v">1.458 mm</td><td className="v">0.100 mm</td><td className="v">0.419333… mm</td></tr>
    </tbody></table>
    <p>The copper budget counts the full physical copper thickness at each layer; it does not estimate area coverage or resin flow. A real press build may need multiple plies in a gap and different copper allowances. Exact arithmetic here is not a claim about production tolerance.</p>
    <TryIt to={'/stackup?id=' + DEFAULT_STACKUP_ID}>Inspect the original 6-layer, 1.6 mm close-outer-plane example</TryIt>

    <h2>Treat material inputs as assumptions until confirmed</h2>
    <p>The rigid examples use Dk 4.0 and Df 0.015 throughout the dielectric. Their masks are 20 µm per side, with assumed Dk 3.5 and Df 0.020. These values have no specified measurement frequency or product certification. A glass-style number alone does not determine the pressed thickness or a suitable design Dk.</p>
    <p>Replace each gap with the pressed thickness and electrical design values proposed for your actual materials and operating frequency. If a gap contains distinct plies, add them separately. The calculator can retain those layers rather than forcing different materials into one Dk. The <Link to="/guides/glass-weave-skew">glass-weave guide</Link> discusses an additional effect that a uniform dielectric cross-section does not resolve.</p>

    <h2>Use the advisor to compare routing options</h2>
    <p>Set the board-thickness range and layer count first. For controlled impedance, add the targets and the minimum widths and clearances you intend to use. The advisor solves candidate cross-sections against those inputs. An example passing these checks means its model fits your entered constraints; it does not mean a fabricator has approved the build.</p>
    <TryIt to="/stackup-advisor">Compare examples and your saved constructions in the Stackup Advisor</TryIt>
    <p>Open a promising result in the Layer Stack Manager, save a copy and adjust it to the fabricator’s proposal. In the Impedance tab, inspect both outer and inner signal layers. Confirm the final geometry in the <Link to="/impedance">impedance calculator</Link>, including mask, copper profile and the intended differential spacing.</p>

    <h2>Before routing and ordering</h2>
    <ol>
      <li>Agree the reference nets, signal layers, finished thickness and mechanical constraints.</li>
      <li>Get the proposed core/prepreg materials, pressed gaps, copper thicknesses and tolerances from your fabricator.</li>
      <li>Check that the resulting trace widths and pair clearances fit the component escapes and routing space.</li>
      <li>Review reference-plane continuity, layer changes, via stubs and any glass-weave sensitivity.</li>
      <li>Agree impedance targets and acceptance tolerances with the fabricator. Keep the approved construction with the project.</li>
    </ol>
    <p>Custom stackups stay in this browser. Export a PCBPlanner JSON backup to preserve the complete construction for another device; CAD exports provide the supported layer information for the selected region.</p>
    <TryIt to="/stackup">Create and export your own construction</TryIt>
  </Guide>;
}
