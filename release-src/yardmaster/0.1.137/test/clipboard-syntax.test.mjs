import test from 'node:test';
import assert from 'node:assert/strict';
import {captureClipboardScripts,parseClipboardScripts} from './helpers/clipboard-scripts.mjs';

test('clipboard read, write and clear generate valid try/catch boundaries with unchanged retries',()=>{
  const commands=captureClipboardScripts();
  assert.equal(commands.length,3);
  for(const {file,args,script} of commands){
    assert.equal(file,'powershell.exe');assert.ok(args.includes('-Sta'));
    assert.doesNotMatch(script,/}\s*;\s*catch\b/,'a separator between try and catch causes MissingCatchOrFinally');
    assert.match(script,/}\n\s*catch\{/);
    assert.match(script,/for\(\$i=0;\$i -lt 12;\$i\+\+\)/);
    assert.match(script,/Start-Sleep -Milliseconds \(\[Math\]::Min\(900,75\+\(\$i\*75\)\)\)/);
    assert.match(script,/throw \$last$/);
  }
  assert.match(commands[0].script,/Get-Clipboard -Raw -ErrorAction Stop/);
  assert.ok(commands[1].script.includes("Get-Content -LiteralPath 'C:\\temp\\chef''s clipboard.txt' -Raw"));
  assert.match(commands[2].script,/Set-Clipboard -Value \$null -ErrorAction Stop/);
  if(process.platform==='win32')parseClipboardScripts();
});
