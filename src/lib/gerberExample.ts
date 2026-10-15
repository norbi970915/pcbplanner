const header=(label:string)=>'G04 PCB Planner original example*\n%FSLAX24Y24*%\n%MOMM*%\n%TF.FileFunction,'+label+'*%\n%ADD10C,0.8*%\n%ADD11C,2.2*%\n%ADD12C,0.8*%\nG01*\n';
const trace=(moved:boolean)=>header('Copper,L1,Top')+'D10*\nX030000Y030000D02*\nX100000Y030000D01*\nX'+(moved?'140000Y070000':'140000Y030000')+'D01*\nX210000Y070000D01*\nD11*\nX030000Y030000D03*\nX210000Y070000D03*\n'+(moved?'X160000Y100000D03*\n':'')+'%LPC*%\nD12*\nX030000Y030000D03*\n%LPD*%\nM02*\n';
const silk=header('Legend,Top')+'D10*\nX020000Y110000D02*\nX220000Y110000D01*\nM02*\n';
export const GERBER_EXAMPLE_A=[{name:'rev-a-top.gtl',text:trace(false)},{name:'rev-a-silk.gto',text:silk}];
export const GERBER_EXAMPLE_B=[{name:'rev-b-top.gtl',text:trace(true)},{name:'rev-b-silk.gto',text:silk}];
