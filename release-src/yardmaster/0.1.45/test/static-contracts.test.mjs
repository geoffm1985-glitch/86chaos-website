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
  assert.match(bridge,/YM_ATTACHMENT_BUTTON/);
  assert.match(bridge,/YM_UPLOAD_MENU_ITEM/);
  assert.match(bridge,/Page\.setInterceptFileChooserDialog/);
  assert.match(bridge,/Page\.fileChooserOpened/);
  assert.match(bridge,/backendNodeId/);
  assert.match(bridge,/YM_MARK_COMPOSER_FILE_INPUTS/);
  assert.match(bridge,/type:'char'/);
  assert.match(bridge,/getBoundingClientRect/);
  assert.match(bridge,/sendTimeoutMs\|\|120000/);
  assert.match(bridge,/Could not attach to the Yardmaster/);
  assert.match(bridge,/finish please/);
  assert.match(bridge,/work_usage_limit/);
  assert.match(bridge,/YM_WAIT_HANDOFF_COMPOSER_READY/);
  assert.match(bridge,/pending-home-input/);
  assert.match(bridge,/readyState==='complete'/);
  assert.match(bridge,/2\*60\*1000/);
  assert.match(bridge,/promptForTyping/);
  assert.match(bridge,/generationStarted/);
  assert.match(bridge,/composerCleared/);
  assert.match(bridge,/conversationRoute/);
  assert.match(bridge,/generation-transition/);
  assert.match(bridge,/replace\(\/\\n\+\/g,' '\)/);
});

test('full Yardmaster self-test is isolated from 86 Chaos and covers the complete local repair cycle',()=>{
  const server=read('server.mjs'),selfTest=read('automation/full-self-test.mjs'),windows=read('automation/windows-operator.mjs'),html=read('public/index.html'),app=read('public/app.js'),bridge=read('automation/chatgpt.mjs');
  assert.match(html,/Test Full Yardmaster Process/);
  assert.match(html,/does not use 86 Chaos/);
  assert.match(html,/Adopt Running Play Store Test/);
  assert.match(server,/action==='full-self-test'/);
  assert.match(server,/action==='adopt-running-test'/);
  assert.match(server,/runFullSandboxSelfTest/);
  assert.match(server,/adoptManualPlayStoreRun/);
  assert.match(server,/closedLoop:true/);
  assert.match(server,/!config\.autoHandoff&&!wf\.closedLoop/);
  assert.match(server,/!wf\.closedLoop&&limit>0/);
  assert.match(server,/wf\.closedLoop\|\|wf\.handsFree\|\|config\.repoUpdateMode==='automatic'/);
  assert.match(server,/state\.workflow\?\.closedLoop\|\|config\.waitForDeploy/);
  assert.match(server,/postDeploy:true,source:'deployment'/);
  assert.match(server,/runPowerShellClipboardCommand/);
  assert.match(server,/POWERSHELL/);
  assert.match(server,/END_POWERSHELL/);
  assert.match(bridge,/onAssistantProtocol/);
  assert.match(bridge,/Yardmaster command result/);
  assert.match(windows,/Set-Clipboard/);
  assert.match(windows,/Get-Clipboard/);
  assert.match(windows,/SendKeys\('\^v'\)/);
  assert.match(windows,/AppActivate/);
  assert.match(windows,/discoverAdoptableReleaseGate/);
  assert.match(windows,/runner-state\.json/);
  assert.match(windows,/\.current-run\.lock/);
  for(const stage of ['powershellPaste','manualGateAdoption','handoff','chatgpt','download','apply','retest','gitPush','deployment','postDeployAdoption'])assert.ok(selfTest.includes(stage),stage);
  assert.match(selfTest,/createSandboxFixture/);
  assert.match(selfTest,/startSandboxManualGate/);
  assert.match(selfTest,/adoptSandboxManualGate/);
  assert.match(selfTest,/init','--bare'/);
  assert.match(selfTest,/Apply-Repair\.ps1/);
  assert.match(selfTest,/refs\/heads\/testing/);
  assert.match(selfTest,/Do not access or modify 86 Chaos/);
  assert.doesNotMatch(selfTest,/testing\.86chaos\.com|api\/build-identity/,'sandbox self-test must not use the real 86 Chaos deployment endpoint');
  assert.match(app,/selfTestSteps/);
});

test('automated repair prompt keeps raw console evidence in the ZIP and sends only a compact summary',()=>{
  const server=read('server.mjs');
  const prompt=(server.match(/function repairPrompt\(\)[\s\S]*?\n\}/)||[])[0]||'';
  const compact=(server.match(/function compactFailureSummary\(\)[\s\S]*?\n\}/)||[])[0]||'';
  assert.match(server,/'-FailureSummary',failureSummary\(\)/,'full failure evidence must still be packed into the handoff ZIP');
  assert.match(prompt,/attached ZIP already contains the current app/);
  assert.match(prompt,/compactFailureSummary\(\)/);
  assert.doesNotMatch(prompt,/Latest failure summary|failureSummary\(\)/,'ChatGPT composer must not receive the raw console dump');
  assert.match(compact,/slice\(0,280\)/);
  assert.match(compact,/slice\(0,520\)/,'typed failure summary must remain tightly bounded');
});

test('ChatGPT handoff failures expose a sanitized black-box diagnostic bundle',()=>{
  const bridge=read('automation/chatgpt.mjs'),diagnostics=read('automation/handoff-diagnostics.mjs'),server=read('server.mjs'),app=read('public/app.js');
  assert.match(bridge,/createHandoffDiagnostics/);
  assert.match(bridge,/diagnostics\?\.record\('attachment-button'/);
  assert.match(bridge,/diagnostics\?\.record\('send-target'/);
  assert.match(bridge,/diagnostics\.fail\(error,cdp\)/);
  assert.match(diagnostics,/YM_DIAGNOSTIC_SNAPSHOT/);
  assert.match(diagnostics,/Page\.captureScreenshot/);
  assert.match(diagnostics,/promptLength/);
  assert.match(server,/\/api\/handoff-diagnostic/);
  assert.match(server,/diagnostic:e\.diagnostic/);
  assert.match(app,/Download Handoff Diagnostics/);
  assert.match(app,/Last diagnostic stage/);
});

test('console output is redacted before it can be exposed to the authenticated phone',()=>{
  const server=read('server.mjs');
  assert.match(server,/redactConsoleLine/);
  assert.match(server,/authorization\\s\*:\\s\*bearer/i);
  assert.match(server,/github_pat_/);
  assert.match(server,/\[REDACTED\]/);
  assert.match(server,/state\.run\.log\.push\(s\)/);
});

test('Open ChatGPT is manual-only and cannot start the automated command bridge',()=>{
  const bridge=read('automation/chatgpt.mjs'),server=read('server.mjs');
  assert.match(bridge,/YM_MANUAL_CHAT_FOCUS/);
  assert.match(bridge,/YM_MANUAL_CHAT_TEXT/);
  assert.match(bridge,/trustedClearComposer/);
  assert.match(bridge,/2200/);
  assert.match(bridge,/Page\.navigate/);
  assert.match(bridge,/manual-edge-profile/);
  assert.match(bridge,/edge-profile/);
  assert.match(bridge,/purpose:'manual'/);
  assert.match(bridge,/configureManualChat/);
  assert.match(bridge,/chooseModeAndModel\(cdp,mode,model/);
  assert.match(bridge,/chooseThinkingEffort\(cdp,thinkingEffort/);
  assert.match(bridge,/could not verify the selected manual ChatGPT mode\/model/);
  assert.match(bridge,/could not set the selected manual ChatGPT thinking effort after 3 trusted attempts/);
  assert.match(bridge,/timeoutMs=75000/);
  assert.match(bridge,/page to finish loading/);
  assert.match(bridge,/chatModelUsesThinkingControl/);
  assert.match(bridge,/Chat mode uses GPT-5\.6 Sol through the thinking\/reasoning control/);
  assert.match(bridge,/trustedPointerClick\(cdp,target\)/);
  assert.match(bridge,/interactiveFailures>=3/);
  assert.match(bridge,/9223/);
  assert.match(bridge,/9222/);
  assert.match(server,/Opened ChatGPT for manual use with a clean composer/);
  const openAction=(server.match(/else if\(action==='open-chatgpt'\)[\s\S]*?else throw new Error\('Unknown action\.'\)/)||[])[0]||'';
  assert.doesNotMatch(openAction,/startProtocolBridge\(\)/,'Open ChatGPT must not start automated handoff/command processing');
});

test('failed-run ChatGPT repair starts automatically by default while manual Open ChatGPT stays separate',()=>{
  const server=read('server.mjs'),html=read('public/index.html');
  assert.match(server,/autoHandoff:true/);
  assert.match(server,/automationDefaultsVersion:4/);
  assert.match(server,/config\.autoHandoff=true/);
  assert.match(server,/await submitCurrentHandoff\(\)/);
  assert.match(server,/YARDMASTER_TEST_HANDOFF_STUB/);
  assert.match(html,/Resume Handoff/);
  assert.match(html,/Send failures to ChatGPT automatically/);
});

test('version labels stay synchronized',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.1.45');
  assert.ok(read('public/index.html').includes(pkg.version));
});
