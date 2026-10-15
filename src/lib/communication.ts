import { eNeighbors } from './electronics';

const positive=(...values:number[])=>values.every(value=>Number.isFinite(value)&&value>0);
const nonnegative=(...values:number[])=>values.every(value=>Number.isFinite(value)&&value>=0);
const integer=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;

/** Opposite-edge SPI read path: outgoing clock, peripheral clock-to-output, returning MISO, setup and reserved margin. All times in ns. */
export function spiTiming(clockMHz:number,forwardNs:number,clockToOutNs:number,returnNs:number,setupNs:number,reserveNs:number){
  if(!positive(clockMHz)||!nonnegative(forwardNs,clockToOutNs,returnNs,setupNs,reserveNs))return null;
  const periodNs=1000/clockMHz,availableNs=periodNs/2;
  const requiredNs=forwardNs+clockToOutNs+returnNs+setupNs+reserveNs;
  if(!positive(periodNs)||!Number.isFinite(requiredNs))return null;
  return {periodNs,availableNs,requiredNs,marginNs:availableNs-requiredNs,maxMHz:requiredNs>0&&Number.isFinite(500/requiredNs)?500/requiredNs:null};
}

export type CanPhase='nominal'|'data';
/** Bosch M_CAN 3.3.1 functional counts, not zero-based register encodings. NBTP §2.3.8; DBTP §2.3.4. */
export const CAN_LIMITS={
  nominal:{brpMax:512,tseg1Min:2,tseg1Max:256,tseg2Min:2,tseg2Max:128,sjwMax:128},
  data:{brpMax:32,tseg1Min:1,tseg1Max:32,tseg2Min:2,tseg2Max:16,sjwMax:16},
} as const;
export interface CanTiming {brp:number;tseg1:number;tseg2:number;sjw:number;tqNs:number;totalTq:number;bitNs:number;rate:number;samplePercent:number;errorPercent:number;sampleError:number}
export function canTiming(clockHz:number,targetRate:number,brp:number,tseg1:number,tseg2:number,sjw:number,phase:CanPhase,tdc=false):CanTiming|null {
  const limits=CAN_LIMITS[phase];if(!limits)return null;
  const brpMax=phase==='data'&&tdc?2:limits.brpMax;
  if(!positive(clockHz,targetRate)||!integer(brp,1,brpMax)||!integer(tseg1,limits.tseg1Min,limits.tseg1Max)||!integer(tseg2,limits.tseg2Min,limits.tseg2Max)||!integer(sjw,1,Math.min(limits.sjwMax,tseg2,tseg1)))return null;
  const totalTq=1+tseg1+tseg2,rate=clockHz/(brp*totalTq),tqNs=1e9*brp/clockHz;
  if(!positive(rate,tqNs)||!Number.isFinite(tqNs*totalTq)||!Number.isFinite(100*(rate-targetRate)/targetRate))return null;
  return {brp,tseg1,tseg2,sjw,tqNs,totalTq,bitNs:tqNs*totalTq,rate,samplePercent:100*(1+tseg1)/totalTq,errorPercent:100*(rate-targetRate)/targetRate,sampleError:0};
}
/** Original bounded integer search. Rank bit-rate error first, then sample-point error, then finer time quanta. */
export function findCanTimings(clockHz:number,targetRate:number,samplePercent:number,sjw:number,phase:CanPhase,tdc=false):CanTiming[]{
  const limits=CAN_LIMITS[phase];if(!limits||!positive(clockHz,targetRate)||!positive(samplePercent)||samplePercent>=100||!integer(sjw,1,limits.sjwMax))return [];
  const brpMax=phase==='data'&&tdc?2:limits.brpMax,minTq=1+Math.max(limits.tseg1Min,sjw)+Math.max(limits.tseg2Min,sjw),maxTq=1+limits.tseg1Max+limits.tseg2Max;
  const candidates:CanTiming[]=[];
  for(let brp=1;brp<=brpMax;brp++){
    const ideal=clockHz/(brp*targetRate);
    const counts=new Set([Math.floor(ideal),Math.ceil(ideal)].map(count=>Math.max(minTq,Math.min(maxTq,count))));
    for(const count of counts){
      const low=Math.max(limits.tseg1Min,sjw,count-1-limits.tseg2Max),high=Math.min(limits.tseg1Max,count-1-Math.max(limits.tseg2Min,sjw));
      if(low>high)continue;
      const desired=count*samplePercent/100-1;
      for(const tseg1 of new Set([Math.floor(desired),Math.ceil(desired)].map(value=>Math.max(low,Math.min(high,value))))){
        const result=canTiming(clockHz,targetRate,brp,tseg1,count-1-tseg1,sjw,phase,tdc);
        if(result)candidates.push({...result,sampleError:Math.abs(result.samplePercent-samplePercent)});
      }
    }
  }
  return candidates.sort((a,b)=>Math.abs(a.errorPercent)-Math.abs(b.errorPercent)||a.sampleError-b.sampleError||a.brp-b.brp).slice(0,8);
}

/** Two equal end terminations. Split termination divides each end's resistance into two equal series halves. */
export function busTermination(resistance:number,differentialV:number,splitCapNf:number){
  if(!positive(resistance,splitCapNf)||!nonnegative(differentialV))return null;
  const endPower=differentialV*differentialV/resistance,corner=1/(2*Math.PI*(resistance/4)*splitCapNf*1e-9);
  if(!nonnegative(endPower)||!positive(corner,resistance/2))return null;
  return {parallelOhms:resistance/2,splitOhms:resistance/2,endPower,splitPower:endPower/2,commonModeCornerHz:corner};
}

/** TI SLLA272D §7 equation 2: conservative external bias bound for two matched end terminations and a fully loaded bus. */
export function rs485Bias(vMin:number,targetV:number,z0:number,tolerancePercent:number,selectedOhms:number,riseNs:number,velocityPercent:number){
  if(!positive(vMin,targetV,z0,selectedOhms,riseNs,velocityPercent)||targetV>=vMin||!nonnegative(tolerancePercent)||tolerancePercent>=100||velocityPercent>100)return null;
  const rbMax=vMin/(targetV*(1/375+4/z0)),nominalMax=rbMax/(1+tolerancePercent/100);
  const recommended=eNeighbors(nominalMax,'E96').below;
  const stubMaxM=riseNs*1e-9/10*(velocityPercent/100)*299792458;
  if(!positive(rbMax,nominalMax,recommended,stubMaxM,selectedOhms*(1+tolerancePercent/100)))return null;
  return {rbMax,nominalMax,recommended,selectedWorst:selectedOhms*(1+tolerancePercent/100),withinBound:selectedOhms*(1+tolerancePercent/100)<=rbMax,stubMaxM};
}

/** Modbus Serial Line V1.02 §2.5.1: 11 bits/RTU character; fixed recommended timers above 19200 baud. Times in seconds. */
export function modbusTiming(baud:number,requestBytes:number,responseBytes:number,processingMs:number){
  if(!positive(baud)||!integer(requestBytes,4,256)||!integer(responseBytes,4,256)||!nonnegative(processingMs))return null;
  const characterS=11/baud,fixed=baud>19200,t15S=fixed?0.00075:1.5*characterS,t35S=fixed?0.00175:3.5*characterS;
  const requestS=requestBytes*characterS,responseS=responseBytes*characterS;
  // Processing starts at the end of the request; it overlaps the required silent interval before the response.
  const turnaroundS=Math.max(t35S,processingMs/1000),cycleS=requestS+turnaroundS+responseS+t35S;
  if(!positive(characterS,cycleS))return null;
  return {characterS,t15S,t35S,requestS,responseS,turnaroundS,cycleS,pollsPerSecond:1/cycleS,fixed};
}