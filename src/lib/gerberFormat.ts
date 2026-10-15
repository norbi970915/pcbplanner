/**
 * Normalise exporter header variants without changing artwork.
 * Ucamco Gerber 2026.05 sections 8.1.1 to 8.1.8: IN/LN are comments;
 * positive polarity and identity image transforms confirm the default.
 * Keep non-default/unknown commands intact so the worker can reject them.
 * Self-contained because this function is also serialised into the import worker.
 */
export function normaliseGerberHeaders(text:string):string {
  if(!/%(?:FS|MO|AD|AM)/.test(text))return text;
  return text.replace(/%([^%]*)%/g,(_whole,body:string)=>{
    if(body.trimStart().startsWith('AM')){
      // Some exporters use uppercase multiplication, including chained expressions.
      // Keep the macro name and comments unchanged; normalise expression operators only.
      return '%'+body.split('*').map((word,index)=>index===0||/^\s*0/.test(word)?word:word.replace(/X/g,'x')).join('*')+'%';
    }
    return body.split('*').map(word=>word.trim()).filter(Boolean).filter(word=>{
      if(/^(?:IN|LN|TF|TA|TO|TD)/.test(word))return false;
      if(/^(?:IPPOS|ASAXBY|IR0|LMN)$/.test(word))return false;
      if(/^LR[+-]?0+(?:\.0*)?$/.test(word)||/^LS\+?1(?:\.0*)?$/.test(word))return false;
      if(/^MI(?:A0)?(?:B0)?$/.test(word))return false;
      if(/^OF(?:A[+-]?0+(?:\.0*)?)?(?:B[+-]?0+(?:\.0*)?)?$/.test(word))return false;
      if(/^SF(?:A\+?1(?:\.0*)?)?(?:B\+?1(?:\.0*)?)?$/.test(word))return false;
      return true;
    }).map(word=>'%'+word+'*%').join('\n');
  }).replace(/(^|[*%])\s*G70\s*\*/g,'$1%MOIN*%').replace(/(^|[*%])\s*G71\s*\*/g,'$1%MOMM*%');
}
