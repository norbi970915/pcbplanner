# pcbplanner

Browser-based calculators for PCB design with an Altium Designer–style interface: menu bar, document tabs, a Tools panel, a Properties panel for the inputs, and a status bar. Built with Vite, React, TypeScript and Tailwind CSS.

## Tools

| Group | Tools |
|---|---|
| Signal integrity | Impedance (2D field solver: microstrip / coated / embedded / stripline / coplanar, SE and differential, solve W or S), Delay & timing (εeff, delay, skew → length, bandwidth, wavelength), Crosstalk (NEXT/FEXT from even/odd modes, spacing sweep) |
| Stackup | Stackup advisor (requirements → ranked fab stackups with trace widths), Layer stack manager (178 JLCPCB stackups, 2–12 layers, editable, per-layer impedance table) |
| Thermal | Junction temperature (θJA or θJC+θCS+θSA), Thermal via array |
| Power & conductors | Trace width / current / temperature rise (IPC-2221), Via, Skin effect, Fusing current |
| Power integrity | PDN target impedance, plane capacitance, decoupling |
| Components | Planar spiral inductor, Padstack |
| Electronics | Ohm's law, Reactance & resonance, Crystal & ppm, Resistor tools (E-series), Attenuator pads |
| Utilities | Unit converter |

Every tool keeps its inputs in the URL, so any result can be shared as a link.

## Field solver

`src/lib/fieldsolver.ts` solves ∇·(ε∇φ) = 0 on a graded finite-volume mesh with Jacobi-preconditioned conjugate gradients. It uses the symmetry plane: a Neumann boundary gives single-ended / even mode and a Dirichlet boundary gives odd mode. Capacitance comes from field energy, and Z0 = 1/(c·√(C·C_air)). The solver runs in Web Workers; batch jobs such as the advisor use a worker pool.

It has been checked against:
- Hammerstad–Jensen and Wheeler formulas (within 2 %)
- Polar SI9000 results for coated microstrip (within 1 %)

## Stackup data

- `scripts/jlc/*.json` is the raw template data from JLCPCB's public impedance-calculator API, fetched 2026-09-22.
- `node scripts/build-jlc-stackups.mjs` regenerates `src/data/jlcStackups.ts`.
- Default layer roles (signal / plane) are assigned by layer count in `src/lib/stackups.ts` (`ROLE_PATTERNS`).

## Development

```bash
npm install
npm run dev        # dev server
npm test           # vitest: formula, solver and advisor validation
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

- No advertising or affiliate links for now. Add them in `src/components/ToolPage.tsx` when needed.
- The app name is set in `src/config.ts`.
