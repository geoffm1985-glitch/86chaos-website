import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {__testHooks} from '../automation/chatgpt.mjs';
import {createPlaywrightConfig} from '../playwright.config.mjs';

const models=['GPT-6.1 Sol','GPT-6 Sol','GPT-6 Astra','GPT-6 Luna','GPT-5.6 Sol','GPT-5.6 Terra','GPT-5.6 Luna'];
const script=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const populate=script.slice(script.indexOf('function populateModels('),script.indexOf('\nfunction ',script.indexOf('function populateModels(')+1));
function selector(){
  const element={options:[],value:'',set innerHTML(html){this.options=[...html.matchAll(/<option value="([^"]+)"/g)].map(m=>({value:m[1]}));this.value=this.options[0]?.value||''}};
  const document={activeElement:null};
  const context=vm.createContext({document,$:()=>element,esc:s=>s});
  vm.runInContext(populate,context);
  return {element,document,choose:(mode,selected)=>context.populateModels(mode,selected)};
}
for(const mode of ['Work','Chat'])test(`Play Store: ${mode} selector exposes other models while Sol is selected and preserves choice`,()=>{
  const {element,choose,document}=selector();choose(mode,'GPT-5.6 Sol');assert.deepEqual(element.options.map(o=>o.value),models);assert.equal(element.value,'GPT-5.6 Sol');
  choose(mode,'GPT-6 Astra');assert.equal(element.value,'GPT-6 Astra');choose(mode==='Work'?'Chat':'Work','GPT-6 Astra');assert.equal(element.value,'GPT-6 Astra');
  document.activeElement=element;element.value='GPT-6 Luna';choose(mode,'GPT-6 Astra');assert.equal(element.value,'GPT-6 Luna');
});
test('Play Store: saved account-specific models are selectable after refresh',()=>{
  const {element,choose}=selector();choose('Chat','Account custom model');assert.ok(element.options.some(o=>o.value==='Account custom model'));assert.equal(element.value,'Account custom model');
});
test('Play Store: Yardmaster inventory has only Windows desktop and Android projects',()=>{
  for(const platform of ['win32','linux']){const config=createPlaywrightConfig({platform});assert.deepEqual(config.projects.map(p=>p.name),['desktop-and-regressions','mobile-android']);assert.equal(config.projects[0].use.channel,platform==='win32'?'msedge':undefined);assert.equal(config.projects[1].use.browserName,'chromium');assert.equal(config.projects[1].use.channel,undefined)}
});

test('Play Store: real assistant extraction retains collapsed multiline command boundaries',async()=>{
  const protocol='YARDMASTER\nPOWERSHELL\nWrite-Output evidence\nEND_POWERSHELL\nEND';
  const element={innerText:protocol.replace(/\n/g,' '),textContent:protocol};
  const document={querySelectorAll:selector=>selector==='[data-message-author-role="assistant"]'?[element]:[]};
  const cdp={eval:async expression=>vm.runInNewContext(expression,{document})};
  assert.equal(await __testHooks.latestAssistantText(cdp),protocol);assert.equal((await __testHooks.assistantProtocol(cdp)).protocol,protocol);
  assert.equal(__testHooks.assistantTextValue({innerText:'Visible response',textContent:'hiddenVisible response'}),'Visible response');
  assert.equal(__testHooks.assistantTextValue({innerText:'YARDMASTER POWERSHELL unfinished',textContent:'YARDMASTER\nPOWERSHELL\nunfinished'}),'YARDMASTER POWERSHELL unfinished');
});
test('Play Store: native and hosted controls use complete dropdowns instead of filtering the selected input',()=>{
  for(const file of ['../public/index.html','fixtures/website/yardmaster.astro']){
    const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');const control=html.match(/<select id="model">([\s\S]*?)<\/select>/)?.[1];assert.ok(control,file);
    for(const model of models)assert.ok(control.includes(`<option>${model}</option>`),model);assert.doesNotMatch(html,/<input[^>]*id="model"/);
  }
});
