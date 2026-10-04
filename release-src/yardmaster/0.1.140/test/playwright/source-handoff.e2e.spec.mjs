import {test,expect} from '@playwright/test';
import {sourceHandoffRegression,resumeSourceHandoffRegression} from '../helpers/source-handoff-regression.mjs';
import {__testHooks} from '../../automation/chatgpt.mjs';
test('source handoff regression: current source and preserved evidence are available in the same archive',async()=>{test.skip(process.platform!=='win32');await sourceHandoffRegression();await resumeSourceHandoffRegression()});
test('source handoff regression: actual browser code blocks retain literal variables and JavaScript template quotes',async({page})=>{
 const exact='YARDMASTER\nPOWERSHELL\n$zip=Join-Path $env:USERPROFILE "Desktop"\n$code=@\'\nconst u=`http://127.0.0.1:${port}`;\n\'@\nEND_POWERSHELL\nEND';
 await page.setContent('<article data-message-author-role="assistant"><span>Formatted explanation</span><pre><code></code></pre><button>Copy code</button></article>');
 await page.locator('code').evaluate((e,text)=>e.textContent=text,exact);
 const protocol=await __testHooks.assistantProtocol({eval:expression=>page.evaluate(expression)});
 expect(protocol.source).toBe('assistant-turn');expect(protocol.protocol).toBe(exact);expect(protocol.protocol).not.toContain('Copy code');
});
