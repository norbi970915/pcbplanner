import { Cite, Guide, TryIt } from './Guide';

export default function SParametersExplained() {
  return (
    <Guide sources={[
      { text: 'IBIS Open Forum, Touchstone File Format Specification, version 2.1: option line, file extensions, reference impedances, two-port order and mixed-mode parameters.', url: 'https://ibis.org/touchstone_ver2.1/touchstone_ver2_1.pdf' },
      { text: 'Keysight, S-Parameters and Two-port Measurements: incident, reflected and transmitted waves in a two-port network.', url: 'https://www.keysight.com/zz/en/assets/7018-04627/application-notes/5992-0249.pdf' },
      { text: 'Keysight, Signal Integrity Analysis Series Part 3: examples of S11 return loss, S21 insertion loss and fixture de-embedding.', url: 'https://www.keysight.com/us/en/assets/7018-08491/application-notes/5989-5765.pdf' },
      { text: 'Texas Instruments, Board Design Simulations (SPRACP4A), §§4.3–4.4: inspecting extracted S-parameters and time-domain reflectometry after validation.', url: 'https://www.ti.com/lit/an/spracp4/spracp4.pdf' },
    ]}>
      <p><b>S11 tells you what comes back at port 1; S21 tells you what reaches port 2.</b> Both are complex ratios measured or simulated over frequency. A Touchstone file stores the frequency points, format and reference impedances needed to interpret them. Read those before comparing the plot with a board or interface requirement. <Cite n={[1, 2]} /></p>

      <h2>Four numbers for a two-port network</h2>
      <table className="tbl"><thead><tr><th>Term</th><th>Question it answers</th></tr></thead><tbody>
        <tr><td>S11</td><td>How much of a wave entering port 1 is reflected there?</td></tr>
        <tr><td>S21</td><td>How much of that wave reaches port 2?</td></tr>
        <tr><td>S12</td><td>How much passes from port 2 back to port 1?</td></tr>
        <tr><td>S22</td><td>How much of a wave entering port 2 is reflected there?</td></tr>
      </tbody></table>
      <p>For a passive, reciprocal connector S21 and S12 should agree apart from measurement or model error. S11 and S22 can differ when the launch geometry differs at the two ends. The file's port reference, often 50 Ω for single-ended ports, defines what a match means. <Cite n={[1, 2]} /></p>

      <h2>Reading decibels without swapping the sign</h2>
      <p>A network analyser often plots 20 log₁₀|S11| and 20 log₁₀|S21|, so a passive network appears at negative dB. <i>Positive</i> return loss and insertion loss are the negatives of those readings: RL = −20 log₁₀|S11| and IL = −20 log₁₀|S21|. If S11 is −20 dB, the reflected <i>power</i> is |S11|² = 1%; if S21 is −1 dB, the forward power ratio under the file's matched-port conditions is 10<sup>−1/10</sup> ≈ 79.4%. The other 19.6% is not automatically cable loss; reflection and other paths must be considered too. <Cite n={[2, 3]} /></p>
      <TryIt to="/s-parameter-viewer">Open an .s2p or .s4p file and inspect the markers</TryIt>

      <h2>The common .s2p trap: order and reference</h2>
      <p>For the conventional two-port Touchstone layout, the four data pairs are ordered <b>S11, S21, S12, S22</b>, not row-major S11, S12, S21, S22. Touchstone 2.x can explicitly declare either order. The option line also says whether each complex value is real/imaginary (RI), magnitude/angle (MA) or dB/angle (DB), and gives the frequency unit and reference resistance. Ignoring either line can put a perfectly good connector model on the wrong plot. <Cite n={1} /></p>

      <h2>For a differential pair, use the differential response</h2>
      <p>A four-port model has single-ended S-parameters for two conductors at each end. Its differential through term SDD21 is formed from a combination of those terms with the correct port pairing; it is not just one single-ended S21. Check the pin-to-port mapping supplied with the model. The viewer can show SDD21 and differential-to-common-mode conversion for a 4-port file, but a wrong pairing makes even a sound channel look broken. <Cite n={1} /></p>

      <h2>What the file includes</h2>
      <p>An S-parameter file describes the network between its calibration or simulation reference planes. A connector model may include its launch; a measured board file may include test fixtures until they are de-embedded. The plot cannot tell you which structures were included. Read the model documentation before adding its insertion loss to a separately estimated PCB trace loss or claiming that a whole channel passes an interface budget. <Cite n={[3, 4]} /></p>
    </Guide>
  );
}
