import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function dock({top=500,bottom=930,active=true,display=true,modal=false}={}){
  const calls=[],host={getClientRects:()=>display?[{}]:[],getBoundingClientRect:()=>({left:220,right:1300,top,bottom})};
  const nodes={'#chatgptDockHost':host,'#desktopApp':{dataset:{view:active?'chatgpt':'operations'}},'.main':{getBoundingClientRect:()=>({left:205,top:0,right:1366,bottom:768})},'#newWorkModal':{hidden:!modal}};
  const context={$:sel=>nodes[sel],window:{innerWidth:1366,innerHeight:768,yardmasterDesktop:{setChatGPTDock:p=>calls.push(p)}}};
  vm.runInNewContext(source.slice(source.indexOf('function chatGPTDockAvailable()'),source.indexOf('function setView('))+';syncChatGPTDock();',context);
  return JSON.parse(JSON.stringify(calls.at(-1)));
}
test('scrolling ChatGPT native dock stays within the dashboard viewport and cannot overlay hidden views',()=>{
  assert.deepEqual(dock(),{visible:true,bounds:{x:220,y:500,width:1080,height:268}});
  assert.deepEqual(dock({top:-120,bottom:310}),{visible:true,bounds:{x:220,y:0,width:1080,height:310}});
  for(const options of [{top:900,bottom:1330},{top:-450,bottom:-20},{active:false},{display:false},{modal:true}])assert.equal(dock(options).visible,false);
});
test('desktop layout repair is registered in complete Play Store and Playwright inventories',async()=>{
  const {certificationStages}=await import('../scripts/run-play-store.mjs');
  const root=fileURLToPath(new URL('..',import.meta.url));
  assert.ok(certificationStages(root)[1].args.some(p=>p.endsWith('desktop-layout.test.mjs')));
  const registry=JSON.parse(fs.readFileSync(new URL('../YARDMASTER_FEATURES.json',import.meta.url)));
  const feature=registry.features.find(f=>f.id==='desktop-panel-visibility-and-selection');
  assert.ok(feature.playStoreTests.includes('test/desktop-layout.test.mjs'));
  assert.ok(feature.playwrightTests.includes('test/playwright/desktop-layout.e2e.spec.mjs'));
});
