import { Cite, Guide, TryIt } from './Guide';

export default function PhaseNoiseJitter() {
  return (
    <Guide sources={[
      { text: 'Analog Devices MT-008, Converting Oscillator Phase Noise to Time Jitter: integrated single-sideband noise, the factor of two and RMS time jitter.', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-008.pdf' },
      { text: 'Analog Devices, ADC SNR-method FAQ: the jitter-limited SNR formula and why the clock-noise integration bandwidth depends on the sampling system.', url: 'https://www.analog.com/en/resources/faqs/faq_using_the_adc_snrmethod_what_is_the_equivalent.html' },
      { text: 'Analog Devices AN-1067, The Power Spectral Density of Phase Noise and Jitter: distinctions between phase-noise spectra and integrated jitter.', url: 'https://www.analog.com/en/resources/app-notes/an-1067.html' },
    ]}>
      <p><b>A phase-noise plot does not have one universal jitter number.</b> RMS jitter depends on the carrier frequency and on the offset-frequency range you integrate. Quote the integration band alongside the result; two numbers calculated over different bands cannot be compared fairly. <Cite n={[1, 3]} /></p>

      <h2>From dBc/Hz to time</h2>
      <p>Single-sideband phase noise L(<i>f</i>) is a density at an offset <i>f</i> from the clock carrier. Convert each dBc/Hz value to a linear power ratio and integrate it over the chosen offset range. For small phase noise, the RMS phase variation and time jitter are <Cite n={1} />:</p>
      <div className="eq">A = ∫ L(<i>f</i>) d<i>f</i> &nbsp;·&nbsp; φ<sub>rms</sub> = √(2A) &nbsp;·&nbsp; σ<sub>t</sub> = φ<sub>rms</sub>/(2π<i>f</i><sub>carrier</sub>)</div>
      <p>The factor of two converts the single-sideband power into total phase variance. The phase-noise level must be converted from dBc/Hz <i>before</i> integrating; adding negative dB numbers is not an integration. <Cite n={1} /></p>

      <h2>A simple flat-noise example</h2>
      <p>Suppose a <b>100 MHz</b> oscillator has a flat <b>−150 dBc/Hz</b> phase-noise density from <b>1 kHz to 1 MHz</b>. The linear density is 10<sup>−15</sup>/Hz. Its area is 10<sup>−15</sup> × 999,000 Hz = 9.99 × 10<sup>−10</sup>. The formulas give φ<sub>rms</sub> ≈ 44.7 µrad and <b>σ<sub>t</sub> ≈ 71 fs RMS</b> over that band. This is an illustrative flat spectrum; it says nothing about noise below 1 kHz or above 1 MHz. <Cite n={1} /></p>
      <TryIt to="/clock-jitter">Integrate an oscillator phase-noise curve in the jitter tool</TryIt>

      <h2>Choosing the band is a design decision</h2>
      <p>Near-carrier noise can dominate a long integration, while a receiver's clock recovery may track slow fluctuations instead of treating them as eye-closing jitter. An ADC sampling clock has its own input bandwidth and aliasing behaviour. Use the band required by the interface or measurement method; a convenient 12 kHz–20 MHz telecom figure is not automatically the right band for a high-speed ADC or serial link. <Cite n={[1, 2, 3]} /></p>

      <h2>Where the jitter number goes next</h2>
      <p>For a sampled sine at input frequency <i>f</i><sub>in</sub>, the jitter-only signal-to-noise limit is SNR<sub>j</sub> = −20 log₁₀(2π<i>f</i><sub>in</sub>σ<sub>t</sub>). Higher input frequencies are more sensitive to the same time jitter. ADC aperture jitter and independent clock jitter add by root-sum-square before this calculation. Serial-link total jitter at a specified bit error ratio uses a different budget and should not be inferred directly from an RMS phase-jitter figure. <Cite n={[1, 2]} /></p>
    </Guide>
  );
}
