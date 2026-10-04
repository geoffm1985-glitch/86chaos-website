import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHandoffRegression,resumeSourceHandoffRegression} from './helpers/source-handoff-regression.mjs';
import {__testHooks} from '../automation/chatgpt.mjs';
test('Play Store: complete handoff includes current source and original report without secrets or nested source archives',{skip:process.platform!=='win32'},sourceHandoffRegression);
test('Play Store: saved reports-only handoff is upgraded without losing the failed report or repair checkpoint',resumeSourceHandoffRegression);
test('Play Store: fenced command preserves environment variables and JavaScript template backticks',()=>{
 const exact='YARDMASTER\nPOWERSHELL\n$zip=Join-Path $env:USERPROFILE "Desktop"\n$code=@\'\nconst u=`http://127.0.0.1:${port}`;\n\'@\nEND_POWERSHELL\nEND';
 const element={innerText:exact.replaceAll('`',''),textContent:exact.replaceAll('`',''),querySelectorAll:()=>[{textContent:exact}]};
 assert.equal(__testHooks.assistantTextValue(element),exact);assert.equal(__testHooks.extractYardmasterProtocol(__testHooks.assistantTextValue(element)),exact);
});
