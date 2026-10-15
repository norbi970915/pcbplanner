import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base=process.argv[2]??'http://127.0.0.1:4180';
mkdirSync('dist-check/communication',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1550,height:1100},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()}));sessionStorage.setItem('pcbtk-settings',JSON.stringify({unit:'mm',theme:'dark'}));});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const open=async path=>{await page.goto(base+path);await page.getByRole('navigation',{name:'Communication interfaces',exact:true}).waitFor();};
 const output=async label=>page.evaluate(label=>[...document.querySelectorAll('.headline-result')].find(el=>el.querySelector('[data-copy-label]')?.textContent===label)?.querySelector('[data-copy-value]')?.textContent?.replace(/,/g,''),label);
 const set=async(label,value)=>{const field=page.getByRole('textbox',{name:new RegExp('^'+label)});await field.fill(String(value));await field.press('Tab');};
 await open('/spi-timing');assert.equal(await output('Setup margin'),'9');
 await set('SCLK frequency',20);assert.equal(await output('Setup margin'),'-16');assert((await page.locator('main').innerText()).includes('no positive setup margin'));
 await page.waitForURL(/mhz=20/);const shared=page.url();await page.reload();await page.getByRole('navigation',{name:'Communication interfaces',exact:true}).waitFor();assert.equal(await output('Setup margin'),'-16');assert.equal(page.url(),shared);
 await set('SCLK frequency',10);assert.equal(await output('Setup margin'),'9');
 await page.screenshot({path:'dist-check/communication/spi-desktop.png'});
 await open('/can-bit-timing');assert.equal(await output('Actual bit rate'),'500');assert.equal(await output('Sample point'),'87.5');
 await page.getByRole('button',{name:/Use BRP/}).first().click();assert.equal(await output('Actual bit rate'),'500');assert.equal(await output('Sample point'),'87.5');
 await page.getByLabel('Phase',{exact:true}).selectOption('data');await set('Target bit rate',2000);await set('Target sample point',80);
 await page.getByRole('button',{name:/Use BRP/}).first().click();assert.equal(await output('Actual bit rate'),'2000');assert.equal(await output('Sample point'),'80');
 await page.getByLabel('TDC enabled',{exact:true}).check();assert(Number(await page.getByLabel('Prescaler',{exact:false}).inputValue())<=2);
 assert.equal(await page.locator('[role=alert]').count(),0);await page.screenshot({path:'dist-check/communication/can-desktop.png'});
 await open('/rs485-modbus');assert(Math.abs(Number(await output('Maximum nominal RB'))-527.7777778/1.01)<.02);
 await set('Baud rate',38400);assert.equal(await output('Inter-frame gap t3.5'),'1.75');
 const initial=Number(await output('Modelled poll cycle'));await set('Device processing time',20);assert(Number(await output('Modelled poll cycle'))>initial+15);
 await page.getByLabel('Character format',{exact:true}).selectOption('8N2');assert((await page.locator('[role=img]').filter({hasText:'Start'}).getAttribute('aria-label')).includes('two stop bits'));
 await set('Each bias resistor',1000);assert((await page.locator('main').innerText()).includes('can exceed the conservative TI bound'));
 await set('Each bias resistor',510);assert.equal(await page.locator('[role=alert]').count(),0);await page.screenshot({path:'dist-check/communication/rs485-desktop.png'});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:950});
  for(const path of ['/spi-timing','/can-bit-timing','/rs485-modbus','/i2c-pullup']){
   await open(path);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path+' page overflows '+width);
   const nav=page.getByRole('navigation',{name:'Communication interfaces',exact:true});assert.equal(await nav.getByRole('link').count(),4);assert((await nav.boundingBox()).width<=width);
   await nav.screenshot({path:'dist-check/communication/'+path.slice(1)+'-'+width+'.png'});
  }
 }
 await page.setViewportSize({width:1550,height:1100});await open('/interface-rules?ifid=eth-1000baset');
 assert.equal(await page.getByLabel('Interface',{exact:true}).inputValue(),'eth-1000baset');
 await page.getByRole('navigation',{name:'Communication interfaces',exact:true}).getByRole('link',{name:/SPI/}).click();await page.waitForURL('**/spi-timing');
 await open('/can-bit-timing?tseg2=1');await page.getByRole('alert').waitFor();assert((await page.getByRole('alert').innerText()).includes('integer timing counts'));
 await open('/rs485-modbus?request=257');await page.getByRole('alert').waitFor();assert((await page.getByRole('alert').innerText()).includes('4 to 256'));
 assert.deepEqual(errors,[]);
 console.log('Communication calculators passed: live SPI margin and shared URL, CAN search/apply/FD/TDC, RS-485 bound and Modbus timing, four-way links beside Ethernet, invalid URL parameters, and 390/320 px layouts.');
 await context.close();
}finally{await browser.close();}