import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Regression coverage for legacy positive image polarity, using original synthetic artwork.
// Usage: node scripts/audit-gerber.mjs [http://127.0.0.1:4180]
const base=(process.argv[2]??'http://127.0.0.1:4180').replace(/\/$/,'');
const source='G04 Original PCB Planner polarity regression fixture*\n%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,3*%\n%ADD11C,1*%\nG01*\nD10*\nX100000Y100000D03*\n%LPC*%\nD11*\nX100000Y100000D03*\n%LPD*%\nM02*\n';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1600,height:1100},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()})));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await page.goto(base+'/gerber-viewer')).status(),200);
  await page.locator('.schematic-gerber-link').waitFor();
  const upload=async(side,files)=>{
    await page.getByLabel('Open layout '+side+' files',{exact:true}).setInputFiles(files.map(file=>({name:file.name,mimeType:'text/plain',buffer:Buffer.from(file.text)})));
    await page.waitForFunction(side=>{const status=[...document.querySelectorAll('.gerber-upload')][side==='A'?0:1].querySelector('.gerber-import-status').textContent;return !/Reading/.test(status);},side);
  };
  const positive=source.replace('%MOMM*%','%MOMM*%\n%IPPOS*%\n%INTop Copper*%\n%LNLayer name*%\n%MIA0B0*%\n%OFA0B0*%\n%SFA1B1*%\n%IR0*%\n%ASAXBY*%\n%LMN*%\n%LR0*%\n%LS1*%');
  const names=[...Array.from({length:6},(_,i)=>'copper_l'+(i+1)+'.gbr'),'Legend_Bot.gbr','Legend_Top.gbr','Paste_Bot.gbr','Paste_Top.gbr','Profile_NP.gbr','Soldermask_Bot.gbr','Soldermask_Top.gbr'];
  await upload('A',names.map(name=>({name,text:positive})));
  assert.equal(await page.locator('[role=alert]').count(),0,'Valid IPPOS layers must not be rejected');
  assert.equal(await page.locator('.gerber-layer-row').count(),13);
  assert.equal(await page.locator('.gerber-import-warnings').count(),0,'IPPOS must not create ignored-command warnings');
  await upload('B',[{name:'default-positive.gbr',text:source}]);
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('.gerber-canvas-wrap canvas');
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let common=0,changed=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i]===125&&pixels[i+1]===135&&pixels[i+2]===145)common++;if((pixels[i]===208&&pixels[i+1]===138)||(pixels[i]===61&&pixels[i+1]===143))changed++;}
    const centre=4*(Math.floor(canvas.height/2)*canvas.width+Math.floor(canvas.width/2));
    return common>100&&changed===0&&pixels[centre]===21&&pixels[centre+1]===25&&pixels[centre+2]===30;
  },null,{timeout:15000});
  assert.equal(await page.locator('.gerber-import-warnings').count(),0);
  // Export variants must render the same physical ring, not merely suppress warnings.
  const variants=[
    ['combined-header.gbr',source.replace('%FSLAX24Y24*%\n%MOMM*%','%FSLAX24Y24*MOMM*%')],
    ['legacy-units.gbr',source.replace('%MOMM*%','G71*')],
    ['empty-name.gbr',source.replace('%MOMM*%','%MOMM*%\n%IN*%')],
    ['macro-X.gbr','%FSLAX24Y24*%\n%MOMM*%\n%AMXNAME*0 X comment*'+ '$1=3X2X0.5*1,1,$1,0,0*1,0,1,0,0*%\n%ADD10XNAME*%\nG01*\nD10*\nX100000Y100000D03*\nM02*'],
  ];
  for(const [name,text]of variants){
    await upload('B',[{name,text}]);assert.equal(await page.locator('[role=alert]').count(),0);
    assert.equal(await page.locator('.gerber-import-warnings').count(),0);
    await page.getByRole('button',{name:'Fit',exact:true}).click();
    await page.waitForFunction(()=>{const c=document.querySelector('.gerber-canvas-wrap canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let common=0,changed=0;for(let i=0;i<d.length;i+=4){if(d[i]===125&&d[i+1]===135)common++;if((d[i]===208&&d[i+1]===138)||(d[i]===61&&d[i+1]===143))changed++;}return common>100&&changed<=4;});
  }
  for(const [command,expected]of [['%IPNEG*%','negative image'],['%IPINVALID*%','not recognized'],['%XYUNKNOWN*%','not recognized']]){
    await upload('B',[{name:'unsupported.gbr',text:source.replace('%MOMM*%','%MOMM*%\n'+command)}]);
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').textContent()).includes(expected),'Unsupported polarity/commands must remain visible errors: '+command);
    assert.equal(await page.locator('.gerber-layer-row').count(),14,'Failed replacements preserve the last valid layer');
  }
  assert.deepEqual(errors,[]);
  console.log('Gerber polarity regression passed: 13 IPPOS layers import without warnings; explicit/default positive artwork matches exactly, clear holes remain clear, negative and unknown commands are rejected, failed imports preserve valid data.');
} finally { await browser.close(); }
