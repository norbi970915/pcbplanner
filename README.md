# pcbplanner

Browser-based calculators for PCB design with a compact shadcn/ui workbench: menu bar, document tabs, a Tools panel, a Properties panel for the inputs, and a status bar. Built with Vite, React, TypeScript, Tailwind CSS and shadcn/ui. The original category colors and PCB material colors are preserved.

## Tools

| Group | Tools |
|---|---|
| Signal integrity | Impedance (2D field solver: microstrip / coated / embedded / stripline / coplanar, SE and differential, solve W or S, laminate library), Delay & timing, Trace loss (conductor loss by incremental inductance with Hammerstad / Groiss / Huray roughness, dielectric loss from the field-energy split, Djordjevic–Sarkar Dk/Df), Crosstalk, Differential via, Via stitching & fence spacing |
| Stackup | Stackup advisor, Layer stack manager (178 standard FR-4 stackups, 2–12 layers), Laminate materials library (datasheet Dk/Df, solder masks, copper foil roughness) |
| Thermal | Junction temperature, Thermal via array |
| Power & conductors | Trace width / current (IPC-2221, IPC-2152), Via, Skin effect, Fusing current, Wire gauge, Conductor spacing (IPC-2221), Creepage & clearance (IEC 60664-1) |
| Power integrity | PDN target impedance, plane capacitance, decoupling |
| Power supply | Buck converter (TI SLVA477B), Boost converter (TI SLVA372D), LDO dissipation, Feedback divider |
| Components | Planar spiral inductor, Padstack, BGA land |
| Electronics | Ohm's law, Reactance & resonance, Crystal & ppm, Resistor tools (E-series), Attenuator pads |
| Utilities | Unit converter, Reference charts |

Every tool keeps its inputs in the URL, so any result can be shared as a link.

## Interface

Shared components live in src/components/shadcn/. Workbench layout and page styles are in src/styles/workbench.css; dark/light theme and material colors are in src/index.css. The desktop app keeps docked tools and properties, and phones have an accessible tools drawer. The existing calculator, URL state, projects and offline behavior are retained.

Favorite tools with the star in the sidebar or calculator heading. Favorites appear at the top of the tools panel, persist in localStorage on the same browser/device, and update across open tabs.

Run node scripts/audit-ui.mjs after starting the production preview to check all routes at desktop and phone sizes, theme switching, search, calculator reset, projects and mobile navigation. Screenshots and the report are saved under dist-check/redesign/.

Run node scripts/audit-featured-carousel.mjs for the featured-tools carousel: all ten illustrations, three visible cards, arrows that move one tool at a time, free dragging and touch swiping with momentum, position indicator, keyboard navigation and dark/light mobile layouts. Its screenshots and report are saved under dist-check/carousel/.

Run node scripts/audit-favorites.mjs for favorites: sidebar and calculator toggles, browser-restart persistence, cross-tab updates, mobile navigation and unavailable storage. Its screenshots and report are saved under dist-check/favorites/.

## Field solver

`src/lib/fieldsolver.ts` solves ∇·(ε∇φ) = 0 on a graded finite-volume mesh with Jacobi-preconditioned conjugate gradients. It uses the symmetry plane: a Neumann boundary gives single-ended / even mode and a Dirichlet boundary gives odd mode. Capacitance comes from field energy, and Z0 = 1/(c·√(C·C_air)). The solver runs in Web Workers; batch jobs such as the advisor use a worker pool.

It has been checked against:
- Hammerstad–Jensen and Wheeler formulas (within 2 %)
- Polar SI9000 results for coated microstrip (within 1 %)

## Stackup data

- `src/data/fabStackups.ts` holds 178 standard FR-4 stackups (2–12 layers, 0.8–2.0 mm), named by their outer prepreg glass style.
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
