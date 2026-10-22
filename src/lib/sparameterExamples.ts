export type SParameterExampleId = 'two-port' | 'differential';

export const SPARAMETER_EXAMPLES = {
  'two-port': {
    name: 'synthetic-100ps-channel.s2p',
    title: '2-port: loss, reflection and delay',
    description: 'Synthetic teaching data, not a measurement. A reciprocal channel with transmission magnitude 0.8, 100 ps delay and reflection coefficient 0.1 at each 50 Ω port.',
    transmission: 'S21 is flat at −1.94 dB: about 1.94 dB insertion loss. The phase slopes with frequency because the channel delays the signal.',
    reflection: 'S11 is −20 dB (|Γ| = 0.1). Smaller reflection magnitude means less mismatch; this example deliberately has a mismatch.',
    delay: 'The S21 group delay is 100 ps. It describes the phase slope, not the amplitude loss.',
    tdr: 'The idealized constant reflection gives about 61.1 Ω after the step, against a 50 Ω reference. The finite bandwidth and window soften the step.',
  },
  differential: {
    name: 'synthetic-30ps-skew.s4p',
    title: 'Differential: see what skew does',
    description: 'Synthetic teaching data, not a measurement. Ports 1/2 form the input pair and 3/4 the output pair; the physical paths are 1→3 (150 ps) and 2→4 (180 ps). Each path has magnitude 0.8 and each port has reflection coefficient 0.1 at 50 Ω.',
    transmission: 'With the supplied 1↔3 / 2↔4 pairing, SDD21 falls as frequency rises and SCD21 grows: 30 ps of path skew converts differential energy to common mode. At 4 GHz they are about −2.57 dB and −10.62 dB.',
    reflection: 'With the supplied pairing, SDD11 is −20 dB. Differential reference impedance is 100 Ω (twice each 50 Ω single-ended reference).',
    delay: 'SDD21 group delay is 165 ps: the mean of the two path delays over this frequency range.',
    tdr: 'With the supplied pairing, the idealized SDD11 step tends to about 122.2 Ω against a 100 Ω differential reference. The finite bandwidth and window soften the step.',
  },
} as const;

/** Analytic passive reciprocal fixtures. RI avoids dB singularities at zero mode conversion. */
export function sparameterExampleText(id: SParameterExampleId): string {
  const ports = id === 'two-port' ? 2 : 4;
  const lines = [`! ${SPARAMETER_EXAMPLES[id].description}`, '# Hz S RI R 50'];
  for (let i = 0; i <= 200; i++) {
    const f = i * 50e6;
    const entry = (row: number, col: number) => {
      if (row === col) return '0.1 0';
      const delay = ports === 2 ? 100e-12 : (row === 0 && col === 2 || row === 2 && col === 0) ? 150e-12 : (row === 1 && col === 3 || row === 3 && col === 1) ? 180e-12 : null;
      return delay === null ? '0 0' : `${0.8 * Math.cos(2 * Math.PI * f * delay)} ${-0.8 * Math.sin(2 * Math.PI * f * delay)}`;
    };
    // Touchstone 1.x uses 11,21,12,22 for two ports, row-major for larger matrices.
    if (ports === 2) lines.push(`${f} ${entry(0, 0)} ${entry(1, 0)} ${entry(0, 1)} ${entry(1, 1)}`);
    else for (let row = 0; row < ports; row++) lines.push(`${row === 0 ? `${f} ` : ''}${Array.from({ length: ports }, (_, col) => entry(row, col)).join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}
