import { Link, useLocation } from 'react-router-dom';
import { Panel } from './ui';
import '../styles/communication.css';
const buses=[{path:'/spi-timing',name:'SPI',detail:'Read-path timing'},{path:'/i2c-pullup',name:'I²C',detail:'Pull-up and capacitance'},{path:'/can-bit-timing',name:'CAN / CAN FD',detail:'Bit timing and termination'},{path:'/rs485-modbus',name:'RS-485 / Modbus',detail:'Bias and RTU timing'}];
export function CommunicationLinks(){
  const {pathname}=useLocation();
  return <Panel allowInvalid title="Communication interfaces" className="mb-3"><nav className="communication-links" aria-label="Communication interfaces">{buses.map(bus=><Link to={bus.path} key={bus.path} aria-current={pathname===bus.path?'page':undefined}><strong>{bus.name}</strong><span>{bus.detail}</span></Link>)}</nav>{pathname!=='/interface-rules'&&<p className="communication-link-back"><Link to="/interface-rules">High-speed interface rules: Ethernet, USB, PCIe and more →</Link></p>}</Panel>;
}
export function TimingBudget({parts,available,label,unit='ns'}:{parts:{label:string;value:number;color:string}[];available:number;label:string;unit?:string}){
  const total=parts.reduce((sum,part)=>sum+part.value,0),scale=Math.max(total,available,Number.EPSILON),remaining=Math.max(0,available-total),hasRemaining=remaining>scale*1e-12;
  return <div className="communication-budget" role="img" aria-label={label}>
    <div className="communication-budget-track">{parts.filter(part=>part.value>0).map(part=><span key={part.label} style={{width:100*(part.value/scale)+'%',background:part.color}}/>)}{hasRemaining&&<span style={{width:100*(remaining/scale)+'%',background:'var(--ok-line,#6cc28c)'}}/>}<i style={{left:Math.min(99.6,100*(available/scale))+'%'}}/></div>
    <div className="communication-budget-key">{parts.map(part=><span key={part.label}><i style={{background:part.color}}/>{part.label}: {Number(part.value.toPrecision(4))} {unit}</span>)}{hasRemaining&&<span><i style={{background:'var(--ok-line,#6cc28c)'}}/>Remaining budget</span>}</div>
  </div>;
}