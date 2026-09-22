# PCB Toolkit

Browser-based calculators for PCB design, built with Vite, React, TypeScript and Tailwind CSS.

## Tools

| Route | Tool |
|---|---|
| `/impedance` | Impedance calculator with a 2D field solver: surface / solder-mask coated / embedded microstrip, stripline (asymmetric, two εr), coplanar ground, single-ended and differential. Solves for W or S from a target impedance. Shows an equipotential field plot. |
| `/stackup` | Stackup editor with JLCPCB presets. Custom stackups are stored in the browser. Any signal layer opens in the impedance calculator. |
| `/timing` | Propagation delay, skew-to-length matching, rise time to bandwidth, critical length, wavelength. |
| `/trace-width` | IPC-2221 width from current, or current from width, with resistance, voltage drop and loss. |
| `/via` | Via current, resistance, thermal resistance, capacitance, inductance, rise-time degradation. |
| `/skin-effect` | Skin depth and AC resistance with a frequency sweep. |
| `/fusing` | Onderdonk fusing current. |
| `/units` | Length, copper weight, temperature, dBm/W/V, frequency. |

Every tool writes its inputs to the URL query string, so a result can be shared as a link.

## Field solver

`src/lib/fieldsolver.ts` solves ∇·(ε∇φ) = 0 on a graded finite-volume mesh with Jacobi-preconditioned conjugate gradients. It uses the symmetry plane: a Neumann boundary gives single-ended / even mode and a Dirichlet boundary gives odd mode. Capacitance comes from field energy, and Z0 = 1/(c·√(C·C_air)). It runs in a Web Worker (`solver.worker.ts`).

Accuracy, from `src/lib/fieldsolver.test.ts`:
- within 2 % of Hammerstad–Jensen (microstrip) and Wheeler (stripline)
- within 1 % of Polar SI9000 results for coated microstrip (JLCPCB 3313 and 1080 stackups)

## Development

```bash
npm install
npm run dev        # dev server
npm test           # vitest: formula and solver validation
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:4173
node scripts/shots.mjs <outDir>   # browser smoke test + screenshots (needs Edge and a running preview)
```

## Deployment

`dist/` is a static single-page app. The host must serve `index.html` for unknown paths:

- **Netlify:** `public/_redirects` is included.
- **Cloudflare Pages:** SPA fallback is automatic.
- **Nginx:** `try_files $uri /index.html;`

## Monetisation hooks

- `src/components/Ads.tsx`: `AdSlot` placeholders (right rail on wide screens, inline under each tool) and `PartnerBox` with JLCPCB / PCBWay links. Replace the `href`s with referral URLs.
- The app name is set in `src/config.ts`.
