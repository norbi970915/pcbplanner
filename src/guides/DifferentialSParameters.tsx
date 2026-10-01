import { Cite, Guide, TryIt } from './Guide';

export default function DifferentialSParameters() {
  return <Guide sources={[
    { text: 'IBIS Open Forum, Touchstone File Format Specification, version 2.1: four-port matrix order, reference impedances, mixed-mode waves and Appendix A.', url: 'https://ibis.org/touchstone_ver2.1/touchstone_ver2_1.pdf' },
    { text: 'Keysight, Balanced Measurements: response/stimulus notation, differential and common modes, and port mapping.', url: 'https://helpfiles.keysight.com/csg/NA520xA/S1_Settings/Balanced_Measurements.htm' },
  ]}>
    <p><b>A four-port file needs a port map before its differential response is meaningful.</b> The extension .s4p tells you that there are four ports. It does not tell you which two belong to the input pair, which two belong to the output pair, or which conductor is positive. <Cite n={[1, 2]} /></p>
    <h2>Start with the single-ended port numbering</h2>
    <p>Use the model supplier’s diagram. For the worked example here, input pair 1 is ports 1 (+) and 2 (−), and output pair 2 is ports 3 (+) and 4 (−). The two conductors run 1→3 and 2→4. Select “1–2 in, 3–4 out” in the viewer. A different common convention runs 1→2 and 3→4, with input pair (1,3) and output pair (2,4). The viewer supports both.</p>
    <p>Single-ended S31 describes response at port 3 to stimulus at port 1, with the other ports terminated in their reference impedances. Differential excitation drives both input conductors with opposite phase. Combining the appropriate responses produces the mixed-mode result. <Cite n={2} /></p>
    <h2>Read the two letters as output mode, then input mode</h2>
    <table className="tbl"><thead><tr><th>Parameter</th><th>Meaning</th><th>What to inspect</th></tr></thead><tbody>
      <tr><td>SDD21</td><td>Differential output from differential input</td><td>Differential forward transmission</td></tr>
      <tr><td>SDD11</td><td>Differential reflection at input pair</td><td>Differential return loss</td></tr>
      <tr><td>SCD21</td><td>Common-mode output from differential input</td><td>Differential-to-common mode conversion</td></tr>
      <tr><td>SDC21</td><td>Differential output from common-mode input</td><td>Common-to-differential mode conversion</td></tr>
      <tr><td>SCC21</td><td>Common-mode output from common-mode input</td><td>Common-mode transmission</td></tr>
    </tbody></table>
    <p>The first number is the responding pair, and the second is the stimulated pair. SCD21 and SDC21 therefore describe different excitations; their labels are not interchangeable. <Cite n={2} /></p>
    <h2>Convert complex waves, not dB magnitudes</h2>
    <p>For the example port mapping and equal real references within each pair, the transformation gives:</p>
    <div className="eq">SDD21 = ½(S31 − S32 − S41 + S42)</div>
    <div className="eq">SCD21 = ½(S31 − S32 + S41 − S42)</div>
    <p>These additions operate on complex numbers. Combine real/imaginary values, or convert magnitude/phase to complex form first; only then calculate 20 log<sub>10</sub>|S|. Averaging two plotted dB traces loses the phase information needed for cancellation. <Cite n={1} /></p>
    <h2>A downloadable example with known results</h2>
    <p>The <a href="/examples/differential-demo.s4p" download>synthetic differential-channel S4P file</a> contains two uncoupled paths with transmission magnitudes 0.8 and 0.6, each delayed by 100 ps. Every single-ended port has a reflection magnitude of 0.1; cross-path terms are zero. This is an illustrative reciprocal, passive network for testing the mathematics, not a measured connector or a compliance model.</p>
    <p>Since the paths have the same phase, differential transmission is (0.8 + 0.6)/2 = 0.7, while differential-to-common conversion is (0.8 − 0.6)/2 = 0.1. At 1 GHz, both transmitted modes have −36° phase from the entered delay:</p>
    <table className="tbl"><thead><tr><th>Result with the correct pairing</th><th className="v">Expected value</th></tr></thead><tbody>
      <tr><td>SDD21 magnitude / plotted dB</td><td className="v">0.7 / −3.098 dB</td></tr>
      <tr><td>Differential insertion loss</td><td className="v">+3.098 dB</td></tr>
      <tr><td>SDD11 magnitude / return loss</td><td className="v">0.1 / +20 dB</td></tr>
      <tr><td>SCD21 magnitude / plotted dB</td><td className="v">0.1 / −20 dB</td></tr>
      <tr><td>SDD21 group delay</td><td className="v">100 ps</td></tr>
    </tbody></table>
    <TryIt to="/s-parameter-viewer?view=mm&conv=13&f=1">Open the viewer, choose the downloaded file and inspect the mixed-mode results</TryIt>
    <p>The unequal paths create mode conversion even though there is no coupling between them. An otherwise balanced pair with unequal amplitude or delay can also convert modes. Reversing one pair’s polarity flips the corresponding differential phase; choosing the wrong input/output pairs changes the network you are analysing.</p>
    <h2>Check references, signs and the operating band</h2>
    <p>For two equal single-ended references R, the standard power-wave transformation uses differential reference 2R and common-mode reference R/2. This example uses 50 Ω single-ended ports, giving 100 Ω differential and 25 Ω common-mode references. These are normalisation impedances, not a measurement proving that the board has those physical impedances. <Cite n={1} /></p>
    <p>The viewer converts single-ended four-port data after loading. Files already declaring a Touchstone [Mixed-Mode Order] are currently unsupported. A two-port differential export can instead contain SDD data under ordinary S11/S21 labels; inspect its documentation and reference impedance before interpreting it. <Cite n={1} /></p>
    <p>For a real channel, inspect the full required band, port references and measurement planes. Plotted SDD21 is usually negative dB; insertion loss is its positive negative-log counterpart. Low mode conversion is useful, but does not by itself establish an EMI result or interface compliance. Use the actual interface’s channel requirements and the rest of the system model.</p>
  </Guide>;
}
