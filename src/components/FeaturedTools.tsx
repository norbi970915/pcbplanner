import { useSyncExternalStore, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react'
import { Card } from './shadcn/card';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from './shadcn/carousel';

const FEATURES = [
 { path: '/impedance', title: 'Trace impedance', description: 'Find the right geometry for single-ended and differential traces.', category: 'Signal integrity', color: '#3d8fe0', kind: 'impedance' },
 { path: '/stackup', title: 'PCB stackup', description: 'Build your layer stack, choose materials and plan reference planes.', category: 'Stackup', color: '#c9a227', kind: 'stackup' },
 { path: '/s-parameter-viewer', title: 'S-parameter viewer', description: 'Explore return loss, insertion loss and your channel response.', category: 'RF & measurement', color: '#5fb0d8', kind: 'response' },
 { path: '/stackup-advisor', title: 'Stackup advisor', description: 'Find a board stack that fits your thickness, layers and impedance targets.', category: 'Stackup', color: '#c9a227', kind: 'advisor' },
 { path: '/trace-width', title: 'Trace width & current', description: 'Size copper traces for current, temperature rise and voltage drop.', category: 'Power & conductors', color: '#d08a3c', kind: 'trace' },
 { path: '/via', title: 'Via calculator', description: 'Check via current capacity, resistance and high-frequency parasitics.', category: 'Power & conductors', color: '#d08a3c', kind: 'via' },
 { path: '/pdn', title: 'PDN impedance', description: 'Set your target impedance and explore decoupling resonances.', category: 'Power integrity', color: '#b07ad8', kind: 'pdn' },
 { path: '/power-tree', title: 'Power tree planner', description: 'Plan your rails and budget regulator currents, loads and losses.', category: 'Power supply', color: '#e07fb0', kind: 'power' },
 { path: '/buck-converter', title: 'Buck converter', description: 'Size the power stage and inspect inductor current and ripple.', category: 'Power supply', color: '#e07fb0', kind: 'buck' },
 { path: '/copper-heat-spreading', title: 'Copper cooling', description: 'Estimate copper area and cooling for heat-producing components.', category: 'Thermal', color: '#e0645a', kind: 'thermal' },
] as const

function Illustration({ kind }: { kind: typeof FEATURES[number]['kind'] }) {
 return <svg viewBox="0 0 400 180" fill="none" aria-hidden="true" focusable="false">
  <defs>
   <pattern id={kind+'-grid'} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".14" /></pattern>
   <linearGradient id={kind+'-copper'} x1="100" y1="50" x2="270" y2="125" gradientUnits="userSpaceOnUse"><stop stopColor="#edb879"/><stop offset="1" stopColor="#b4783f"/></linearGradient>
   <radialGradient id={kind+'-glow'}><stop stopColor="currentColor" stopOpacity=".13"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="180" fill={'url(#'+kind+'-grid)'} />
  <ellipse cx="205" cy="110" rx="165" ry="110" fill={'url(#'+kind+'-glow)'} />
  {kind === 'impedance' && <>
   <path d="M62 106 201 63 341 106 201 150Z" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <path d="M62 106v17l139 44v-17M201 150l140-44v17l-140 44" fill="var(--art-edge)" stroke="var(--art-outline)"/>
   <path d="m62 119 139 44 140-44" stroke="#6cc28c" strokeWidth="2" opacity=".75"/>
   <path d="m129 91 58-18 87 27-58 18Z" fill={'url(#'+kind+'-copper)'} stroke="#efba80"/>
   <path d="m129 91v6l87 27v-6m0 6 58-18v-6" stroke="#b57b44" fill="#a66c36"/>
   <g stroke="currentColor" strokeWidth="1.3" opacity=".7" strokeDasharray="3 4">
    <path d="M153 110q-35 21 15 35M181 118q-15 17 9 31M232 116q32 18-11 32M260 108q62 17-19 36"/>
    <path d="M154 86q25-35 84 4M140 88q29-57 117 9"/>
   </g>
   <path d="M273 99h36V70" stroke="currentColor" opacity=".7"/><circle cx="273" cy="99" r="3" fill="currentColor"/>
   <text x="312" y="65" className="art-label" textAnchor="middle">50 Ω</text>
   <text x="312" y="79" className="art-note" textAnchor="middle">TARGET</text>
   <path d="M79 127v25h47" stroke="var(--art-outline)"/><text x="82" y="164" className="art-note">MICROSTRIP</text>
  </>}
  {kind === 'stackup' && <>
   {[{y:113,color:'#c9a227'},{y:99,color:'#6cc28c'},{y:85,color:'#b07ad8'},{y:71,color:'#6cc28c'},{y:57,color:'#3d8fe0'},{y:43,color:'#c9a227'}].map((layer,i)=><g key={i}>
    <path d={'M106 '+layer.y+' 201 '+(layer.y-29)+' 296 '+layer.y+' 201 '+(layer.y+29)+'Z'} fill="var(--art-slab)" stroke="var(--art-outline)"/>
    <path d={'M106 '+layer.y+'v5l95 29 95-29v-5l-95 29Z'} fill={layer.color} fillOpacity=".55" stroke={layer.color} strokeOpacity=".7"/>
    {i===5 && <><path d="m152 35 26 8 31-10 22 7m-36 19 32-10 26 8" stroke="#e9bc64" strokeWidth="3" strokeLinecap="round"/><circle cx="152" cy="35" r="3" fill="#e9bc64"/><circle cx="253" cy="57" r="3" fill="#e9bc64"/></>}
   </g>)}
   <path d="M310 49h12v102h-12M328 100h11" stroke="currentColor" opacity=".7"/>
   <text x="348" y="102" className="art-label">6</text><text x="336" y="116" className="art-note">LAYERS</text>
   <text x="68" y="163" className="art-note">SIGNAL / PLANE / CORE</text>
  </>}
  {kind === 'response' && <>
   <g stroke="var(--art-outline)" strokeWidth="1">
    {[40,70,100,130].map(y=><path key={y} d={'M60 '+y+'H345'}/>)}
    {[60,117,174,231,288,345].map(x=><path key={x} d={'M'+x+' 30V144'}/>)}
   </g>
   <path d="M60 30v114h285" stroke="var(--art-axis)" strokeWidth="1.2"/>
   <path d="M61 48C94 48 109 51 133 56S170 63 193 74 223 83 247 86 276 94 300 105 321 113 344 121" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
   <path d="M61 130C87 130 91 117 111 124S136 137 153 126 181 101 197 126 222 137 237 119 261 105 276 126 318 120 344 102" stroke="#b07ad8" strokeWidth="2" strokeLinecap="round" opacity=".85"/>
   <path d="M247 29v115" stroke="currentColor" strokeDasharray="3 4" opacity=".45"/>
   <circle cx="247" cy="86" r="5" fill="var(--art-bg)" stroke="currentColor" strokeWidth="2"/>
   <text x="44" y="41" className="art-note" textAnchor="end">dB</text><text x="346" y="159" className="art-note" textAnchor="end">FREQUENCY</text>
   <path d="M70 163h13" stroke="currentColor" strokeWidth="2"/><text x="88" y="166" className="art-note">S21</text>
   <path d="M127 163h13" stroke="#b07ad8" strokeWidth="2"/><text x="145" y="166" className="art-note">S11</text>
  </>}
  {kind === 'advisor' && <>
   <rect x="155" y="36" width="90" height="112" rx="8" fill="var(--art-slab)" fillOpacity=".5" stroke="currentColor" strokeOpacity=".75"/>
   {[101,200,299].map((x,i)=><g key={x} opacity={i===1?1:.5}>
    {[0,1,2,3].map(layer=><g key={layer}>
     <path d={'M'+(x-31)+' '+(65+layer*13)+' '+x+' '+(55+layer*13)+' '+(x+31)+' '+(65+layer*13)+' '+x+' '+(75+layer*13)+'Z'} fill="var(--art-slab)" stroke="var(--art-outline)"/>
     <path d={'M'+(x-31)+' '+(70+layer*13)+' '+x+' '+(80+layer*13)+' '+(x+31)+' '+(70+layer*13)} stroke={layer%2?'#6cc28c':'currentColor'} strokeWidth="2"/>
    </g>)}
   </g>)}
   <circle cx="237" cy="140" r="10" fill="#6cc28c"/><path d="m232 140 3 3 5-6" stroke="var(--art-bg)" strokeWidth="2" strokeLinecap="round"/>
   <text x="200" y="169" className="art-note" textAnchor="middle">LAYERS / THICKNESS / IMPEDANCE</text>
  </>}
  {kind === 'trace' && <>
   <rect x="72" y="48" width="256" height="100" rx="9" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <path d="M96 117h77l39-41h89" stroke={'url(#'+kind+'-copper)'} strokeWidth="29" strokeLinecap="round" strokeLinejoin="round"/>
   <g stroke="var(--art-bg)" strokeOpacity=".65" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m129 111 7 6-7 6m54-25 8-1-1 8m67-35 7 6-7 6"/></g>
   <path d="M95 137h75m-75-4v8m75-8v8M289 57h27m-27-4v8m27-8v8" stroke="currentColor" strokeWidth="1.2"/>
   <text x="123" y="165" className="art-note">CURRENT / RISE / DROP</text>
  </>}
  {kind === 'via' && <>
   <path d="M82 55h236v91H82Z" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <path d="M82 61h100m37 0h99M82 139h100m37 0h99" stroke="#6cc28c" strokeWidth="4"/>
   <path d="M82 84h100m37 0h99M82 118h100m37 0h99" stroke="var(--art-outline)"/>
   <rect x="180" y="57" width="40" height="87" fill="var(--art-bg)"/>
   <path d="M183 57v87m34-87v87" stroke={'url(#'+kind+'-copper)'} strokeWidth="8"/>
   <ellipse cx="200" cy="57" rx="30" ry="10" fill={'url(#'+kind+'-copper)'} stroke="#e9bc64"/>
   <ellipse cx="200" cy="57" rx="14" ry="5" fill="var(--art-bg)"/>
   <path d="M173 144q27 17 54 0" stroke="#d08a3c" strokeWidth="5"/>
   <path d="M200 73v56m-5-5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
   <path d="M240 56h39v40" stroke="currentColor" opacity=".6"/>
   <text x="283" y="108" className="art-note">BARREL</text>
   <text x="91" y="165" className="art-note">CURRENT / RESISTANCE / PARASITICS</text>
  </>}
  {kind === 'pdn' && <>
   <g stroke="var(--art-outline)">{[44,73,102,131].map(y=><path key={y} d={'M62 '+y+'H343'}/>)}{[62,118,174,230,286,343].map(x=><path key={x} d={'M'+x+' 32V145'}/>)}</g>
   <path d="M62 32v113h281" stroke="var(--art-axis)"/>
   <path d="M63 51H343" stroke="#6cc28c" strokeDasharray="5 4" strokeWidth="1.5"/>
   <path d="M63 63C80 63 86 139 110 139S140 69 154 69 171 130 192 130 218 62 234 62 255 119 272 119 310 74 342 45" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
   <text x="78" y="43" className="art-note">TARGET Z</text><text x="343" y="163" className="art-note" textAnchor="end">FREQUENCY</text>
   <text x="50" y="43" className="art-note" textAnchor="end">|Z|</text>
   <circle cx="234" cy="62" r="4" stroke="currentColor" strokeWidth="2" fill="var(--art-bg)"/>
  </>}
  {kind === 'power' && <>
   <g stroke="currentColor" strokeWidth="1.8"><path d="M130 94h29V54h24m-24 40v41h24M257 54h51m-51 81h51"/></g>
   <rect x="61" y="71" width="69" height="46" rx="7" fill="var(--art-slab)" stroke="currentColor"/>
   <rect x="183" y="33" width="74" height="42" rx="6" fill="var(--art-slab)" stroke="currentColor"/>
   <rect x="183" y="114" width="74" height="42" rx="6" fill="var(--art-slab)" stroke="currentColor"/>
   <rect x="308" y="40" width="34" height="28" rx="4" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <rect x="308" y="121" width="34" height="28" rx="4" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <circle cx="159" cy="94" r="4" fill="currentColor"/>
   <text x="95" y="97" className="art-note" textAnchor="middle">INPUT</text>
   <text x="220" y="59" className="art-label" textAnchor="middle">3.3 V</text><text x="220" y="140" className="art-label" textAnchor="middle">1.8 V</text>
   <path d="M317 54h16m-8-8v16M318 130h14m-14 8h14" stroke="var(--art-axis)" strokeWidth="1.5"/>
  </>}
  {kind === 'buck' && <>
   <g stroke="var(--art-axis)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M61 86h39m35 0h29m80 0h93M151 86v48H61m90 0h148M299 86v21m0 17v10"/>
    <path d="m103 86 26-13m-26 13h-3m35 0h-5M290 108h18m-18 9h18M151 105l-9 16h18Z"/>
   </g>
   <rect x="94" y="57" width="48" height="47" rx="6" stroke="currentColor" fill="currentColor" fillOpacity=".05"/>
   <path d="M164 86q10-32 20 0 10-32 20 0 10-32 20 0 10-32 20 0" stroke={'url(#'+kind+'-copper)'} strokeWidth="3"/>
   <circle cx="61" cy="86" r="4" fill="currentColor"/><circle cx="337" cy="86" r="4" fill="currentColor"/><circle cx="151" cy="86" r="3" fill="currentColor"/>
   <text x="61" y="73" className="art-note" textAnchor="middle">IN</text><text x="337" y="73" className="art-note" textAnchor="middle">OUT</text>
   <path d="m112 164 15-15 15 15 15-15 15 15 15-15 15 15 15-15 15 15 15-15" stroke="currentColor" strokeWidth="1.5" opacity=".7"/>
   <text x="273" y="164" className="art-note">RIPPLE</text>
  </>}
  {kind === 'thermal' && <>
   <path d="m73 110 129-39 127 39-127 42Z" fill="var(--art-slab)" stroke="var(--art-outline)"/>
   <path d="M73 110v10l129 41 127-41v-10" stroke="#6cc28c" strokeWidth="2"/>
   <path d="m112 105 88-27 88 27-88 29Z" fill={'url(#'+kind+'-copper)'} fillOpacity=".6" stroke="#c99969"/>
   <g stroke="currentColor" opacity=".55"><ellipse cx="201" cy="109" rx="64" ry="20"/><ellipse cx="201" cy="109" rx="92" ry="28"/></g>
   <rect x="174" y="78" width="54" height="35" rx="5" fill="var(--art-bg)" stroke="var(--art-axis)"/>
   <g stroke="var(--art-axis)" strokeWidth="2"><path d="M181 74v-6m13 6v-6m13 6v-6m13 6v-6M181 117v6m13-6v6m13-6v6m13-6v6"/></g>
   <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M184 63c-12-12 12-13 0-25M201 58c-12-12 12-13 0-25M218 63c-12-12 12-13 0-25"/></g>
   <text x="200" y="174" className="art-note" textAnchor="middle">COPPER / AIRFLOW / TEMPERATURE</text>
  </>}
 </svg>
}

function subscribeToMotion(listener: () => void) {
 const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
 preference.addEventListener('change', listener);
 return () => preference.removeEventListener('change', listener);
}
function motionSnapshot() {
 return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FeaturedTools() {
 const reducedMotion = useSyncExternalStore(subscribeToMotion, motionSnapshot, () => false);
 return (
  <section className="featured-section" aria-labelledby="featured-heading">
   <Carousel
    className="featured-carousel"
    aria-labelledby="featured-heading"
    opts={{ align: 'start', loop: true, slidesToScroll: 1, duration: reducedMotion ? 0 : 25 }}
   >
    <div className="outside-heading featured-heading">
     <h2 id="featured-heading">Featured tools</h2>
     <div className="featured-controls">
      <CarouselPrevious className="featured-control static translate-y-0" aria-label="Previous featured tool" />
      <CarouselNext className="featured-control static translate-y-0" aria-label="Next featured tool" />
     </div>
    </div>
    <CarouselContent className="featured-track">
     {FEATURES.map((feature, index) => (
      <CarouselItem className="featured-slide" key={feature.path} aria-label={(index + 1) + ' of ' + FEATURES.length}>
       <Card className="featured-tool" style={{ '--feature-color': feature.color } as CSSProperties}>
        <Link className="featured-link" to={feature.path} aria-label={'Open ' + feature.title} draggable={false}>
         <div className="featured-art">
          <span className="featured-category"><span />{feature.category}</span>
          <Illustration kind={feature.kind} />
         </div>
         <div className="featured-copy">
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
          <span className="featured-action">Open tool <ArrowRight size={14} /></span>
         </div>
        </Link>
       </Card>
      </CarouselItem>
     ))}
    </CarouselContent>
   </Carousel>
  </section>
 );
}
