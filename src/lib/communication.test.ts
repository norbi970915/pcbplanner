import { describe, expect, it } from 'vitest';
import { busTermination, CAN_LIMITS, canTiming, findCanTimings, modbusTiming, rs485Bias, spiTiming } from './communication';

describe('SPI read-path timing',()=>{
  it('reproduces TI SLLA522 25 ns per isolation direction at 10 MHz',()=>{
    const result=spiTiming(10,25,0,25,0,0)!;
    expect(result.availableNs).toBe(50);expect(result.marginNs).toBe(0);expect(result.maxMHz).toBe(10);
  });
  it('accounts for peripheral output, controller setup and reserved uncertainty',()=>{
    const result=spiTiming(10,8,15,8,5,5)!;
    expect(result.requiredNs).toBe(41);expect(result.marginNs).toBe(9);expect(result.maxMHz).toBeCloseTo(500/41);
    expect(spiTiming(20,8,15,8,5,5)!.marginNs).toBe(-16);
    expect(spiTiming(10,0,0,0,0,0)!.maxMHz).toBeNull();
  });
  it('rejects non-finite and negative inputs without an infinite ceiling',()=>{
    for(const value of [0,-1,NaN,Infinity])expect(spiTiming(value,1,1,1,1,1)).toBeNull();
    expect(spiTiming(10,-1,1,1,1,1)).toBeNull();expect(spiTiming(10,1e308,1e308,1,1,1)).toBeNull();
  });
});

describe('Bosch M_CAN bit timing',()=>{
  it('reproduces the manual NBTP and DBTP 8 MHz reset examples',()=>{
    for(const phase of ['nominal','data'] as const){
      const result=canTiming(8e6,500e3,1,11,4,4,phase)!;
      expect(result.rate).toBe(500e3);expect(result.tqNs).toBe(125);expect(result.totalTq).toBe(16);expect(result.bitNs).toBe(2000);expect(result.samplePercent).toBe(75);
    }
  });
  it('finds exact nominal and data settings and respects TDC prescaler limits',()=>{
    for(const phase of ['nominal','data'] as const){
      const result=findCanTimings(80e6,phase==='nominal'?500e3:2e6,80,1,phase,phase==='data')[0];
      expect(result.errorPercent).toBe(0);expect(result.samplePercent).toBe(80);
      expect(canTiming(80e6,result.rate,result.brp,result.tseg1,result.tseg2,1,phase,phase==='data')).not.toBeNull();
      if(phase==='data')expect(result.brp).toBeLessThanOrEqual(2);
    }
    expect(canTiming(80e6,500e3,3,11,4,1,'data',true)).toBeNull();
  });
  it('rejects reserved register counts, fractional quanta and oversized SJW',()=>{
    expect(canTiming(80e6,500e3,0,13,2,1,'nominal')).toBeNull();
    expect(canTiming(80e6,500e3,1,1,2,1,'nominal')).toBeNull();
    expect(canTiming(80e6,500e3,1,13,1,1,'nominal')).toBeNull();
    expect(canTiming(80e6,500e3,1,13.5,2,1,'nominal')).toBeNull();
    expect(canTiming(80e6,500e3,1,13,2,3,'nominal')).toBeNull();
    expect(findCanTimings(Infinity,500e3,80,1,'data')).toEqual([]);
    expect(findCanTimings(80e6,500e3,100,1,'data')).toEqual([]);
  });
  it('matches an independent exhaustive data-phase search, including approximate targets and large SJW',()=>{
    const limits=CAN_LIMITS.data;
    for(const [clock,target,sample,sjw] of [[40e6,2e6,80,1],[24e6,1234567,78,2],[8e6,3e6,75,16],[16e6,1e6,87.5,3]]){
      const brute:{rateError:number;sampleError:number;brp:number}[]=[];
      for(let brp=1;brp<=limits.brpMax;brp++)for(let seg1=Math.max(limits.tseg1Min,sjw);seg1<=limits.tseg1Max;seg1++)for(let seg2=Math.max(limits.tseg2Min,sjw);seg2<=limits.tseg2Max;seg2++){
        const total=1+seg1+seg2,rate=clock/(brp*total);
        brute.push({rateError:Math.abs(100*(rate-target)/target),sampleError:Math.abs(100*(1+seg1)/total-sample),brp});
      }
      brute.sort((a,b)=>a.rateError-b.rateError||a.sampleError-b.sampleError||a.brp-b.brp);
      const result=findCanTimings(clock,target,sample,sjw,'data')[0];
      expect(Math.abs(result.errorPercent)).toBeCloseTo(brute[0].rateError,10);expect(result.sampleError).toBeCloseTo(brute[0].sampleError,10);expect(result.brp).toBe(brute[0].brp);
    }
  });
});

describe('termination and conservative RS-485 sizing',()=>{
  it('derives split resistors, dissipation and the common-mode RC corner',()=>{
    const result=busTermination(120,2,4.7)!;
    expect(result.parallelOhms).toBe(60);expect(result.splitOhms).toBe(60);expect(result.endPower).toBeCloseTo(4/120);expect(result.splitPower).toBeCloseTo(4/240);
    expect(result.commonModeCornerHz).toBeCloseTo(1/(2*Math.PI*30*4.7e-9));
    expect(busTermination(120,0,4.7)!.endPower).toBe(0);expect(busTermination(120,1e308,4.7)).toBeNull();
  });
  it('reproduces TI SLLA272D equation 2 and rounds the resistor downward',()=>{
    const result=rs485Bias(4.75,.25,120,0,523,100,78)!;
    expect(result.rbMax).toBeCloseTo(527.7777778,5);expect(result.recommended).toBe(523);expect(result.withinBound).toBe(true);
    const corner=rs485Bias(4.75,.25,120,1,523,100,78)!;
    expect(corner.recommended).toBe(511);expect(corner.withinBound).toBe(false);expect(corner.selectedWorst).toBeCloseTo(528.23);
  });
  it('uses rise time rather than bitrate for the stub length',()=>{
    const result=rs485Bias(4.75,.25,120,1,510,100,78)!;
    expect(result.stubMaxM).toBeCloseTo(2.3383811724);expect(rs485Bias(4.75,.25,120,1,510,200,78)!.stubMaxM).toBeCloseTo(2*result.stubMaxM);
    expect(rs485Bias(4.75,5,120,1,510,100,78)).toBeNull();expect(rs485Bias(4.75,.25,120,1,510,100,101)).toBeNull();
  });
});

describe('Modbus RTU timing',()=>{
  it('calculates 11-bit characters and applies the fixed-timer boundary strictly above 19200 baud',()=>{
    const low=modbusTiming(9600,8,9,0)!,boundary=modbusTiming(19200,8,9,0)!,high=modbusTiming(38400,8,9,0)!;
    expect(low.characterS).toBeCloseTo(11/9600);expect(low.t15S).toBeCloseTo(16.5/9600);expect(low.t35S).toBeCloseTo(38.5/9600);
    expect(boundary.fixed).toBe(false);expect(boundary.t35S).toBeCloseTo(38.5/19200);
    expect(high.fixed).toBe(true);expect(high.t15S).toBe(.00075);expect(high.t35S).toBe(.00175);
  });
  it('accounts for complete frame bytes and overlaps the explicitly defined processing time with silence',()=>{
    const result=modbusTiming(9600,8,9,0)!;
    expect(result.cycleS).toBeCloseTo((8+9+7)*11/9600);expect(result.pollsPerSecond).toBeCloseTo(9600/(24*11));
    expect(modbusTiming(9600,8,9,1)!.cycleS).toBe(result.cycleS);
    const processing=modbusTiming(9600,8,9,20)!;
    expect(processing.cycleS).toBeCloseTo(17*11/9600+.02+38.5/9600);
  });
  it('rejects fractional/oversized frames and invalid baud or processing time',()=>{
    for(const bytes of [3,257,8.5,Infinity])expect(modbusTiming(19200,bytes,9,0)).toBeNull();
    expect(modbusTiming(0,8,9,0)).toBeNull();expect(modbusTiming(19200,8,9,-1)).toBeNull();
  });
});