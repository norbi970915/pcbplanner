import { Cite, Guide, TryIt } from './Guide';

export default function VswrReturnLoss() {
  return (
    <Guide sources={[
      { text: 'Keysight, RF and Microwave Measurements, application note 5952-3706: reflection coefficient, VSWR, return loss and two-port S-parameters (§3.4.3).', url: 'https://www.keysight.com/us/en/assets/7018-06829/application-notes/5952-3706.pdf' },
      { text: 'Analog Devices, Voltage Standing Wave Ratio Definition and Formula: the voltage-wave reflection coefficient, its impedance relation and VSWR.', url: 'https://www.analog.com/en/resources/technical-articles/voltage-standing-wave-ratio-definition-and-formula.html' },
      { text: 'Keysight, Techniques for Precise Cable and Antenna Measurements in the Field: return loss, VSWR and insertion loss in a measurement workflow.', url: 'https://www.keysight.com/il/en/assets/7018-03477/application-notes/5991-0419.pdf' },
    ]}>
      <p><b>A 1.5:1 VSWR means 4% of the incident power is reflected at the mismatch.</b> It also corresponds to 13.98 dB return loss, but only 0.177 dB of mismatch loss. Those numbers describe different things; treating return loss as lost forward power gives the wrong answer. <Cite n={[1, 2]} /></p>

      <h2>Start with the reflection coefficient</h2>
      <p>On a line with characteristic impedance Z<sub>0</sub> terminated by load Z<sub>L</sub>, the complex voltage reflection coefficient is Γ = (Z<sub>L</sub> − Z<sub>0</sub>)/(Z<sub>L</sub> + Z<sub>0</sub>). Its magnitude ρ = |Γ| is between zero for a match and one for total reflection in a passive load. The phase of Γ matters when several mismatches interact, but VSWR and return loss use only ρ. <Cite n={[1, 2]} /></p>
      <div className="eq">VSWR = (1 + ρ)/(1 − ρ) &nbsp;·&nbsp; ρ = (VSWR − 1)/(VSWR + 1)</div>
      <div className="eq">Return loss = −20 log₁₀ ρ &nbsp;·&nbsp; Reflected power = 100ρ² %</div>
      <p>For VSWR = 1.5, ρ = 0.2. The reflected <i>voltage</i> is 20% of the incident voltage, but the reflected <i>power</i> is 0.2² = 4%. Return loss is −20 log₁₀(0.2) = 13.98 dB. Higher positive return loss means a better match; an instrument may instead plot S11 as −13.98 dB. <Cite n={1} /></p>

      <h2>Why mismatch loss is much smaller than return loss</h2>
      <p>For a single passive mismatch with the source matched to Z<sub>0</sub>, the fraction of incident power accepted by the load is 1 − ρ². Its mismatch loss is −10 log₁₀(1 − ρ²), or 0.177 dB for the same 1.5:1 VSWR. Return loss describes the reflection relative to the incident power; mismatch loss describes the reduction of delivered power. Neither figure includes cable, conductor or dielectric attenuation. <Cite n={[1, 3]} /></p>
      <table className="tbl"><thead><tr><th>Quantity</th><th className="v">At 1.5:1 VSWR</th><th>Meaning</th></tr></thead><tbody>
        <tr><td>|Γ|</td><td className="v">0.2</td><td>Reflected voltage-wave ratio</td></tr>
        <tr><td>Return loss</td><td className="v">13.98 dB</td><td>Incident-to-reflected power ratio</td></tr>
        <tr><td>Reflected power</td><td className="v">4%</td><td>Power travelling back from the mismatch</td></tr>
        <tr><td>Mismatch loss</td><td className="v">0.177 dB</td><td>Accepted-power reduction with a matched source</td></tr>
      </tbody></table>
      <TryIt to="/vswr-calculator">Convert VSWR, return loss and reflected power</TryIt>

      <h2>What to check on a real board</h2>
      <p>A load can have a good match at one frequency and a poor one elsewhere. Read S11 or S22 over the full operating band, at the same reference impedance as the system. A connector, via or cable adds frequency-dependent loss as well as reflections; S21 describes forward transmission through the measured network. Two separated mismatches can reinforce or cancel depending on their phase, so adding their VSWR figures is not a channel calculation. <Cite n={[1, 3]} /></p>
      <TryIt to="/s-parameter-viewer">Inspect S11 and S21 across frequency in a Touchstone file</TryIt>
    </Guide>
  );
}
