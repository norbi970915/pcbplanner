import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react'
import { Card } from './shadcn/card';

const FEATURES = [
 { path: '/impedance', title: 'Trace impedance', description: 'Find the right geometry for single-ended and differential traces.', category: 'Signal integrity', color: '#3d8fe0', kind: 'impedance' },
 { path: '/stackup', title: 'PCB stackup', description: 'Build your layer stack, choose materials and plan reference planes.', category: 'Stackup', color: '#c9a227', kind: 'stackup' },
 { path: '/s-parameter-viewer', title: 'S-parameter viewer', description: 'Explore return loss, insertion loss and your channel response.', category: 'RF & measurement', color: '#5fb0d8', kind: 'response' },
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
 </svg>
}

export function FeaturedTools() {
 return <section className="featured-section" aria-labelledby="featured-heading">
  <div className="outside-heading featured-heading"><h2 id="featured-heading">Featured tools</h2></div>
  <div className="featured-grid">
   {FEATURES.map(feature=><Card className="featured-tool" key={feature.path} style={{'--feature-color':feature.color} as CSSProperties}>
    <Link className="featured-link" to={feature.path} aria-label={'Open '+feature.title}>
     <div className="featured-art">
      <span className="featured-category"><span/>{feature.category}</span>
      <Illustration kind={feature.kind}/>
     </div>
     <div className="featured-copy"><h3>{feature.title}</h3><p>{feature.description}</p><span className="featured-action">Open tool <ArrowRight size={14}/></span></div>
    </Link>
   </Card>)}
  </div>
 </section>
}
