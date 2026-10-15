import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { CommunicationLinks, TimingBudget } from '../components/CommunicationLinks';
import { Sources } from '../components/Sources';
import { SPI_SOURCES } from '../data/communicationSources';
import { spiTiming } from '../lib/communication';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';
const DEFAULTS={mhz:10,forward:8,tco:15,back:8,setup:5,reserve:5};
export default function SpiTiming(){
  const [p,set,reset]=useUrlState(DEFAULTS);
  const result=spiTiming(p.mhz,p.forward,p.tco,p.back,p.setup,p.reserve);
  const errors=result?[]:['Enter a positive clock frequency and finite, non-negative delay budgets.'];
  const notes=result&&result.marginNs<=0?['The read-path budget has no positive setup margin at this clock. Reduce SCLK or reduce the path delay.']:[];
  const parts=[{label:'Clock path',value:p.forward,color:'#3d8fe0'},{label:'Peripheral tCO',value:p.tco,color:'#d08a3c'},{label:'MISO return',value:p.back,color:'#b07ad8'},{label:'Setup',value:p.setup,color:'#4ab3b3'},{label:'Reserve',value:p.reserve,color:'#8a8a8a'}];
  return <ToolPage title="SPI Timing Calculator" description="Check the opposite-edge SPI read path: outgoing SCLK delay, peripheral clock-to-output delay, returning MISO, controller setup and your timing reserve." onReset={reset}
    status={result?'Read-path margin '+fmt(result.marginNs,5)+' ns':'Check the inputs'} method={<Method/>} properties={<>
      <Section title="SPI clock"><NumField label="SCLK frequency" value={p.mhz} onChange={mhz=>set({mhz})} unit="MHz"/></Section>
      <Section title="Worst-case read-path delays">
        <NumField label="Outgoing clock path" value={p.forward} onChange={forward=>set({forward})} unit="ns" allowZero hint="Maximum total delay from controller SCLK to the peripheral clock pin, including routing, buffers and isolation."/>
        <NumField label="Peripheral clock-to-output" symbol="tCO" value={p.tco} onChange={tco=>set({tco})} unit="ns" allowZero hint="Maximum delay from the peripheral launch clock edge to valid MISO, from its datasheet at the actual supply and load."/>
        <NumField label="MISO return path" value={p.back} onChange={back=>set({back})} unit="ns" allowZero hint="Maximum delay back to the controller, including routing, buffers and isolation."/>
        <NumField label="Controller setup time" value={p.setup} onChange={setup=>set({setup})} unit="ns" allowZero/>
        <NumField label="Timing reserve" value={p.reserve} onChange={reserve=>set({reserve})} unit="ns" allowZero hint="Extra budget for jitter, duty-cycle distortion and uncertainty. Enter the worst-case reduction in the launch-to-sample interval."/>
      </Section>
    </>}>
    <CommunicationLinks/><Notes kind="error" items={errors}/><Notes items={notes}/>
    {result&&<>
      <Panel title="SPI read-path budget"><div className="flex flex-wrap gap-8 px-3 py-3"><Big label="Setup margin" value={fmt(result.marginNs,5)} unit="ns"/><Big label="Timing ceiling" value={result.maxMHz===null?'—':fmt(result.maxMHz,5)} unit="MHz"/><Big label="Available half-cycle" value={fmt(result.availableNs,5)} unit="ns"/></div>
        <TimingBudget parts={parts} available={result.availableNs} label={'SPI read-path delay '+fmt(result.requiredNs,5)+' ns; available '+fmt(result.availableNs,5)+' ns; margin '+fmt(result.marginNs,5)+' ns'}/>
        <p className="communication-result-note">The vertical marker is the controller's sample deadline. The timing ceiling is the zero-margin boundary for the entered budget; use a lower operating frequency.</p>
        <table className="tbl"><tbody><Result label="Total required budget" value={fmt(result.requiredNs,5)+' ns'} sub="Clock path + peripheral tCO + MISO return + controller setup + reserve"/><Result label="Clock period" value={fmt(result.periodNs,5)+' ns'}/></tbody></table>
      </Panel>
      <Panel title="Clock out, data back" className="mt-3"><div className="communication-flow"><div><strong>Controller → peripheral</strong><span>SCLK reaches the peripheral after {fmt(p.forward,4)} ns.</span><span>MISO becomes valid after another {fmt(p.tco,4)} ns.</span></div><div><strong>Peripheral → controller</strong><span>MISO returns after another {fmt(p.back,4)} ns.</span><span>Reserve {fmt(p.setup+p.reserve,4)} ns before the sampling edge.</span></div></div></Panel>
    </>}
  </ToolPage>;
}
export function Method(){return <>
  <h2>Opposite-edge SPI read timing</h2><p>For an ordinary read where MISO changes on one SCLK edge and is sampled on the opposite edge, half a clock period is available. Add the outgoing clock delay, peripheral clock-to-output maximum, MISO return delay, controller setup and timing reserve. Margin = 500 / fMHz − total delay in ns; the zero-margin frequency is 500 / total delay in MHz.</p>
  <p>This extends TI's isolation-loop budget to include the entered device and board delays. It assumes a 50% duty clock before the reserve is applied. Check first-bit/CS timing, MOSI setup, hold time, loading and edge integrity separately. Devices that launch or sample differently require their own timing model. Zero total delay has no finite calculated ceiling.</p>
  <p>Use <Link to="/timing">Delay &amp; timing</Link> for PCB propagation estimates and <Link to="/termination">Signal termination</Link> for a source resistor calculation.</p><Sources items={SPI_SOURCES}/>
</>;}