import { Cite, Guide, TryIt } from './Guide';

export default function CrystalLoadGuide() {
  return <Guide sources={[
    { text: 'NXP, How to calculate the value of crystal load capacitors?: effective load capacitance and the equal-capacitor relation.', url: 'https://community.nxp.com/t5/LPC-FAQs/How-to-calculate-the-value-of-crystal-load-capacitors/m-p/464589' },
    { text: 'STMicroelectronics AN2867, Guidelines for oscillator design on STM8AF/AL/S and STM32 MCUs/MPUs: crystal models, load pulling, gain margin, drive level and layout.', url: 'https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf' },
  ]}>
    <p><b>An 18 pF crystal load specification does not mean fitting two 18 pF capacitors.</b> The crystal sees their series combination plus the effective stray capacitance. Choosing standard parts changes that load and can introduce a frequency offset before temperature and aging enter the budget. <Cite n={[1, 2]} /></p>
    <h2>Calculate the load seen by the crystal</h2>
    <p>For the model used here, C<sub>S</sub> is the effective capacitance in parallel with the crystal after accounting for pins and layout. The external capacitors C1 and C2 connect the crystal terminals to ground:</p>
    <div className="eq">C<sub>L</sub> = C1·C2/(C1 + C2) + C<sub>S</sub></div>
    <p>For equal capacitors C1 = C2 = C, this reduces to C<sub>L</sub> = C/2 + C<sub>S</sub>, so C = 2(C<sub>L</sub> − C<sub>S</sub>). If a vendor defines stray capacitance separately at each pin, reduce that network to the same effective parallel definition before inserting its number. Otherwise the stray term can be counted twice. <Cite n={[1, 2]} /></p>
    <h2>Worked example: 18 pF load, 4 pF effective stray</h2>
    <p>Take an illustrative crystal specified at C<sub>L</sub> = 18 pF and assume a 4 pF effective stray load. Each exact capacitor is 2(18 − 4) = 28 pF. These assumptions do not identify a particular crystal or board.</p>
    <table className="tbl"><thead><tr><th>Each fitted capacitor</th><th className="v">Actual effective load</th><th className="v">Difference from 18 pF</th></tr></thead><tbody>
      <tr><td>28 pF, exact</td><td className="v">18.0 pF</td><td className="v">0 pF</td></tr>
      <tr><td>27 pF, E12/E24</td><td className="v">17.5 pF</td><td className="v">−0.5 pF</td></tr>
      <tr><td>30 pF, E24</td><td className="v">19.0 pF</td><td className="v">+1.0 pF</td></tr>
    </tbody></table>
    <TryIt to="/crystal?cl=18&cs=4&f=25000000">Compare exact and standard load capacitors</TryIt>
    <p>The capacitor value follows from the assumed stray load. A neat arithmetic result cannot establish that the assumption matches the assembled board. Use the oscillator and MCU guidance for placement and pin capacitance, then measure frequency under appropriate loading. Check the measurement probe’s added capacitance too. <Cite n={2} /></p>
    <h2>Estimate frequency pulling when the crystal model is known</h2>
    <p>Changing load capacitance moves the parallel-resonant frequency. The calculator uses the small-motional-capacitance approximation below, with C<sub>m</sub> as motional capacitance and C0 as crystal shunt capacitance. These are different from the external load capacitors. <Cite n={2} /></p>
    <div className="eq">Δf/f ≈ (C<sub>m</sub>/2)[1/(C0 + C<sub>L,actual</sub>) − 1/(C0 + C<sub>L,spec</sub>)]</div>
    <p>To illustrate the arithmetic, assume C<sub>m</sub> = 10 fF = 0.010 pF and C0 = 2 pF. Fitting 27 pF gives an effective 17.5 pF load, so the estimated offset is +6.410 ppm. At 25 MHz, that is +160.26 Hz. Fitting 30 pF instead gives −11.905 ppm, or −297.62 Hz. Replace the model values with the chosen crystal’s data; leave pulling uncalculated when C<sub>m</sub> is unavailable.</p>
    <h2>Keep fixed offsets separate from tolerance limits</h2>
    <p>One ppm is one part in a million: Δf = f<sub>nom</sub> × ppm × 10<sup>−6</sup>. A known nominal load-pulling offset is signed; uncertain initial frequency, temperature effects and aging are bounds around it. Adding their absolute maxima gives a conservative worst-case interval.</p>
    <p>For an illustrative first-year budget of ±10 ppm initial tolerance, ±20 ppm temperature stability and ±3 ppm aging, the uncertainty sum is ±33 ppm. Add the +6.410 ppm nominal pulling above: the total interval is −26.590 to +39.410 ppm. At 25 MHz it spans approximately −664.74 to +985.26 Hz. This example sets load uncertainty to zero to isolate the terms; a real budget must include the uncertainty of the fitted capacitors and stray load.</p>
    <TryIt to="/crystal?cl=18&cs=4&cm=10&c0=2&f=25000000&bfit=custom&bcap=27&bdcl=0&bini=10&btmp=20&bag1=3&bagn=0&byr=1&both=0&bif=none">Reproduce the signed pulling and first-year ppm budget</TryIt>
    <h2>Finish the oscillator check</h2>
    <p>Load capacitance and ppm do not prove startup. Check crystal ESR, the oscillator’s gain margin, drive level and the device-specific component recommendations. A clock module may already specify a combined stability figure; do not enter that figure and its included terms a second time. <Cite n={2} /></p>
    <p>For an interface, use the correct clock architecture and specification: absolute clock tolerance and the difference between independent clocks are separate questions. The calculator lists the source behind each supported limit. Frequency tolerance also differs from phase jitter; use the phase-noise tool for the latter.</p>
    <TryIt to="/clock-jitter">Check phase noise and jitter separately from the ppm budget</TryIt>
  </Guide>;
}
