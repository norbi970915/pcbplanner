import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function PcieGuidelines() {
  return <Guide sources={[
    { text: 'PCI-SIG, PCI Express technology generations, signalling rate and Nyquist frequency (PCIe 3.0–5.0).', url: 'https://pcisig.com/sites/default/files/2026-01/PCI-SIG%20PCIe%207.0%20Webinar_Rev5_FINAL.pdf' },
    { text: 'Texas Instruments SNLA426, High-Speed PCB Layout for PCIe Gen 5: material loss, reference planes, vias, stubs and AC coupling capacitor layout.', url: 'https://www.ti.com/lit/an/snla426/snla426.pdf' },
    { text: 'Texas Instruments SPRAAR7J, High-Speed Interface Layout Guidelines: controlled impedance, return paths, pair spacing and via transitions.', url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf' },
    { text: 'PCI-SIG, PCI Express Base Specification overview. Apply the edition, form factor and device requirements for your actual link.', url: 'https://pcisig.com/specification-overview/pci-express-base' },
  ]}>
    <p><b>Start PCIe routing with the channel, not a single length or spacing rule.</b> Identify the generation, endpoints, connectors, reference planes and permitted loss. Then choose a controlled differential impedance, keep the return path continuous, minimise discontinuities and check the whole path at the relevant frequency. A layout rule from one device guide is not automatically a PCI-SIG requirement for every board. <Cite n={[2, 3, 4]} /></p>
    <p>This guide is a board-layout checklist for PCIe Gen3–5. The <Link to="/guides/pcie-gen3-routing">Gen3 M.2 carrier-card example</Link> gives actual stackup, delay and loss calculations for one specific channel.</p>

    <h2>What changes between Gen3, Gen4 and Gen5?</h2>
    <table className="tbl"><thead><tr><th>Generation</th><th className="v">Rate</th><th className="v">Unit interval</th><th className="v">Nyquist frequency</th></tr></thead><tbody>
      <tr><td>Gen3</td><td className="v">8 GT/s</td><td className="v">125 ps</td><td className="v">4 GHz</td></tr>
      <tr><td>Gen4</td><td className="v">16 GT/s</td><td className="v">62.5 ps</td><td className="v">8 GHz</td></tr>
      <tr><td>Gen5</td><td className="v">32 GT/s</td><td className="v">31.25 ps</td><td className="v">16 GHz</td></tr>
    </tbody></table>
    <p>These are the PCI-SIG NRZ signalling rates; the Nyquist frequency is half the symbol rate. Higher frequency makes laminate loss, copper roughness, via stubs and connector launches more significant. It does <em>not</em> turn an old fixed trace-length limit into a universal new one. <Cite n={1} /></p>

    <h2>Set the impedance from the actual channel</h2>
    <p>Choose the differential target specified for your endpoint, connector and board role, then ask the fabricator for a stackup that can build it. The commonly used 85 Ω target is appropriate for many PCIe add-in-card and connector examples, including our Gen3 M.2 case, but it is not a substitute for the applicable design guide or channel specification. Check the whole route, including package breakout, AC-coupling pads, vias and connector launch. <Cite n={[2, 4]} /></p>
    <TryIt to="/impedance">Solve the pair width and gap on your stackup</TryIt>
    <p>For routing rules, state whether a distance is edge-to-edge or centre-to-centre. Keep adjacent pairs and unrelated fast nets far enough away to control crosstalk, while preserving the pair's own gap for impedance. Our <Link to="/guides/pcb-crosstalk-3w-rule">3W spacing guide</Link> explains why a generic 3W rule is only a starting point.</p>

    <h2>Give the pair a continuous return path</h2>
    <p>Route over a solid reference plane. Do not cross a split or void without an engineered return path; the detour changes impedance and increases coupling. At a layer transition, place a nearby ground-return via that connects the relevant reference planes. If the reference changes from ground to power, a simple ground stitch may not complete the return path, so review the plane-pair decoupling and transition geometry. TI illustrates reference-plane void and via-placement effects in its Gen5 guide. <Cite n={2} /></p>
    <p>Keep pair geometry symmetric through bends, pads and transitions. Prioritise avoiding a discontinuity over forcing exact trace lengths with dense serpentines.</p>

    <h2>Budget loss across the whole channel</h2>
    <p>At the generation's Nyquist frequency, count board traces on both ends, connectors, packages, AC-coupling pads and vias. A board calculator can estimate trace conductor and dielectric loss, but it cannot account for every connector or package. Obtain S-parameters or models for these parts and check the channel with the endpoint's compliance method when margin is tight. TI's Gen5 note treats laminate, humidity, temperature and copper construction as material contributors. <Cite n={2} /></p>
    <TryIt to="/trace-loss">Estimate trace loss at 4, 8 or 16 GHz</TryIt>

    <h2>Use vias deliberately and control stubs</h2>
    <p>Each signal via changes impedance; an unused barrel beyond the signal layer is a stub. Its resonance moves lower as it gets longer, so a through-via transition that is acceptable at Gen3 may be poor at Gen5. Keep layer changes few, choose the exit layer with stub length in mind and consider back-drilling where the channel analysis requires it. Pair the signal transition with a suitable return via and check that antipads do not cut a narrow corridor through the reference plane. <Cite n={2} /></p>
    <TryIt to="/differential-via">Estimate differential-via impedance and stub resonance</TryIt>

    <h2>Place AC coupling on the transmitter pair</h2>
    <p>Each PCIe transmitter lane needs series AC-coupling capacitors. Use the value range and placement required by the generation, topology and component documentation; there is no one value to copy across all generations. Place both capacitors symmetrically and avoid large pads or long necks that form a local impedance step. TI's Gen5 guidance discusses pad size, nearby reference-plane voiding and placement relative to the receiver or connector for its channel. <Cite n={2} /></p>
    <p>The capacitors on a connector board may already exist on the other side of the connector. Confirm which side owns the transmitter and avoid duplicating a coupling pair. The <Link to="/guides/ac-coupling-capacitors">AC-coupling guide</Link> separates interface-specific values and placement.</p>

    <h2>Check skew against the endpoint requirement</h2>
    <p>Match the positive and negative traces of each pair within the applicable device or form-factor limit. Use <em>propagation delay</em> on the actual layers rather than assuming that equal millimetres always mean equal delay. Lane-to-lane skew is a different requirement; the receiver can deskew lanes, so do not add long meanders merely to make every lane identical. The <Link to="/guides/pcie-gen3-routing">Gen3 carrier example</Link> shows both checks for a real form factor. <Cite n={4} /></p>
    <TryIt to="/timing">Convert skew allowance into route length</TryIt>

    <h2>Before sending the board out</h2>
    <ol>
      <li>Record the PCIe generation, endpoint and connector documents that set impedance, AC coupling, skew and channel limits.</li>
      <li>Confirm the fabricator's final stackup, target pair geometry, copper profile and controlled-impedance tolerance.</li>
      <li>Check reference planes, return vias, pair-to-pair spacing and transitions in the routed board.</li>
      <li>Include trace, connector, package and via effects in the loss or S-parameter check at the relevant rate.</li>
      <li>Review the finished channel with the device vendor's required simulation or compliance flow where applicable.</li>
    </ol>
    <TryIt to="/interface-rules">Open the PCIe interface-rule checker</TryIt>
  </Guide>;
}
