import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('installer self-elevates and registers a functional Windows uninstall entry',()=>{
  const bootstrap=read('Install-Yardmaster.cmd');
  const installer=read('scripts/Install-Yardmaster.ps1');
  const updater=read('scripts/Update-Yardmaster.ps1');
  const uninstaller=read('scripts/Uninstall-Yardmaster.ps1');
  assert.match(bootstrap,/fltmc/);
  assert.match(bootstrap,/-Verb RunAs/);
  assert.match(bootstrap,/1223/);
  assert.match(installer,/CurrentVersion\\Uninstall\\Yardmaster/);
  assert.match(installer,/Chilton App Works LLC/);
  assert.match(installer,/cloudflared-windows-amd64\.exe/);
  assert.match(installer,/electron\\install\.js/,'installer must repair a missing Electron dist through Electron install.js');
  assert.doesNotMatch(installer,/install-electron\.cmd/,'installer must not call the nonexistent install-electron.cmd helper');
  assert.match(installer,/npm\.cmd/,'installer must locate npm through the Windows command shim');
  assert.match(installer,/& \$npm\.Source install[\s\S]*\$LASTEXITCODE/,'installer must use the native npm exit status under Windows PowerShell 5.1');
  assert.match(installer,/& \$nodeExe \$electronInstallJs[\s\S]*\$LASTEXITCODE/,'Electron repair must use the native node exit status under Windows PowerShell 5.1');
  assert.doesNotMatch(installer,/Invoke-YardmasterProcess/,'installer must not route native commands through Start-Process on Windows PowerShell 5.1');
  assert.match(installer,/Yardmaster runtime ready/,'installer must report runtime-stage completion');
  assert.match(installer,/cloudflared\.exe[\s\S]*--version/);
  assert.match(updater,/release\.json/);
  assert.match(updater,/Get-FileHash[\s\S]*SHA256/);
  assert.match(updater,/verified/);
  assert.match(updater,/\/XD \.git node_modules bin/);
  assert.doesNotMatch(updater,/Stop-YardmasterAppProcesses[\s\S]{0,800}cloudflared/i);
  assert.match(uninstaller,/cloudflared\.exe/);
  assert.match(uninstaller,/CurrentVersion\\Uninstall\\Yardmaster/);
  assert.match(uninstaller,/ExecutablePath/,'uninstaller must identify installed Electron helpers even when their command lines omit the app root');
  assert.match(uninstaller,/taskkill\.exe \/PID \$_\.Id \/T \/F/,'uninstaller must terminate the complete installed Electron process tree');
  assert.doesNotMatch(uninstaller,/86chaos/i);
});

test('New Work packaging protects source state, credentials, platforms, tests, and production',()=>{
  const handoff=read('scripts/New-Handoff.ps1');
  const apply=read('scripts/Apply-Repair.ps1');
  for(const value of ['.git','node_modules','.env.*','*.pem','*.pfx','*adminsdk*.json'])assert.ok(handoff.includes(value),value);
  for(const phrase of ['Play Store/release-gate','Increment the application version','Never push production/main','iPhone/iOS','infrastructure costs'])assert.ok(handoff.includes(phrase),phrase);
  assert.match(apply,/Target repository \.git folder is missing/);
  assert.match(apply,/must be newer than local version/);
  assert.match(apply,/\.env\.\*/);
});

test('desktop dashboard exposes one-screen operations, actionable remote states, and New Work',()=>{
  const html=read('public/index.html'),css=read('public/styles.css'),app=read('public/app.js');
  assert.match(html,/New 86 Chaos Work/);
  assert.match(html,/Hand Off & Walk Away/);
  assert.match(html,/Start Remote Access/);
  assert.match(css,/height:100vh/);
  assert.match(css,/overflow:hidden/);
  for(const state of ['Local','Connecting','Tunnel Ready • Phone Not Connected','Phone Connected','Remote Error'])assert.ok(app.includes(state),state);
  assert.match(app,/127\.0\.0\.1:8787 is not responding/);
  assert.match(app,/new-implementation/);
});

test('ChatGPT handoff verifies the same composer controls, attachment, and submitted user message',()=>{
  const bridge=read('automation/chatgpt.mjs');
  for(const marker of ['YM_READ_CONTROL:','YM_OPEN_CONTROL:','YM_PICK_OPTION:','YM_VERIFY_SELECTED_OPTION','YM_VERIFY_ATTACHMENT','YM_VERIFY_PROMPT_SENT'])assert.ok(bridge.includes(marker),marker);
  assert.match(bridge,/could not verify the requested ChatGPT/);
  assert.doesNotMatch(bridge,/Input\.insertText/);
  assert.match(bridge,/YM_TRUSTED_FILL_PROMPT/);
  assert.match(bridge,/YM_VERIFY_TRUSTED_PROMPT/);
  assert.match(bridge,/type:'char'/);
  assert.match(bridge,/getBoundingClientRect/);
  assert.match(bridge,/without opening duplicate browsers/);
  assert.match(bridge,/finish please/);
  assert.match(bridge,/work_usage_limit/);
  assert.match(bridge,/2\*60\*1000/);
});

test('failed-run ChatGPT repair requires explicit Resume Handoff by default',()=>{
  const server=read('server.mjs'),html=read('public/index.html');
  assert.match(server,/autoHandoff:false/);
  assert.match(server,/automationDefaultsVersion:3/);
  assert.match(server,/config\.autoHandoff=false/);
  assert.match(server,/if\(!config\.autoHandoff\)\{wf\.state='failed-manual';return\}/);
  assert.match(html,/Resume Handoff/);
  assert.match(html,/Send failures to ChatGPT automatically/);
});

test('version labels stay synchronized',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.1.21');
  assert.ok(read('public/index.html').includes(pkg.version));
});
