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
  for(const phrase of ['Play Store/release-gate','Playwright regression coverage','Increment the application version','Never push production/main','iPhone/iOS','infrastructure costs'])assert.ok(handoff.includes(phrase),phrase);
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
  assert.match(bridge,/Input\.insertText/,'verified chunked trusted prompt entry is an intentional primary path');
  assert.match(bridge,/chunkSize=700/,'trusted insertText entry must remain bounded into verified chunks');
  assert.match(bridge,/char-fallback/,'native character entry remains the final trusted fallback');
  assert.match(bridge,/YM_TRUSTED_FILL_PROMPT/);
  assert.match(bridge,/YM_VERIFY_TRUSTED_PROMPT/);
  assert.match(bridge,/selectedFiles/,'attachment verification must recognize trusted file-input selection even when ChatGPT hides the filename chip');
  assert.match(bridge,/selectedSince/,'file-input attachment evidence must remain stable briefly before Yardmaster trusts it');
  assert.match(bridge,/YM_REMOVE_STALE_ATTACHMENT/,'stale attachment chips from a failed handoff must be removed before a retry');
  assert.match(bridge,/singleInput:true/,'composer fallback must write the ZIP to only one file input');
  assert.match(bridge,/will not upload a duplicate copy/,'ambiguous attachment state must stop instead of multiplying ZIP chips');
  assert.doesNotMatch(bridge,/for\(const nodeId of ids\.reverse\(\)\)/,'attachment fallback must never populate every composer file input');
  assert.match(bridge,/YM_ATTACHMENT_BUTTON/);
  assert.match(bridge,/YM_UPLOAD_MENU_ITEM/);
  assert.match(bridge,/Page\.setInterceptFileChooserDialog/);
  assert.match(bridge,/Page\.fileChooserOpened/);
  assert.match(bridge,/backendNodeId/);
  assert.match(bridge,/YM_MARK_COMPOSER_FILE_INPUTS/);
  assert.match(bridge,/type:'char'/);
  assert.match(bridge,/getBoundingClientRect/);
  assert.match(bridge,/sendTimeoutMs\|\|180000/);
  assert.match(bridge,/finalConfirmationMs\|\|180000/);
  assert.match(bridge,/assistant-activity/);
  assert.match(bridge,/stallMs\|\|20\*60\*1000/);
  assert.match(bridge,/timeoutMs=4\*60\*60\*1000/);
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
  assert.match(bridge,/findFreshDownloadedZip/,'repair downloads must be detected by file metadata, not filename alone');
  assert.match(bridge,/downloadClickCount<2/,'ChatGPT repair ZIP downloads must be bounded to prevent click storms');
  assert.match(bridge,/90000/,'a repair ZIP retry must wait long enough to avoid duplicate downloads');
  assert.match(bridge,/hasFreshDownloadActivity/,'active .crdownload files must suppress duplicate clicks');
  assert.doesNotMatch(bridge,/Date\.now\(\)-lastClick>5000/,'five-second repeated download clicking must never return');
  assert.match(bridge,/YM_LATEST_ASSISTANT_TEXT/);
  assert.match(bridge,/page-fallback/);
  assert.match(bridge,/extractYardmasterProtocol/);
  assert.match(bridge,/Yardmaster command result/);
  assert.match(windows,/Set-Clipboard/);
  assert.match(windows,/Get-Clipboard/);
  assert.match(windows,/SendKeys\('\^v'\)/);
  assert.match(windows,/AppActivate/);
  assert.match(windows,/AddSeconds\(45\)/,'PowerShell activation must allow slow Windows focus without giving up early');
  assert.match(windows,/powershell-bootstrap\.ps1/,'PowerShell paste must launch from a bootstrap script file instead of a fragile inline -Command');
  assert.match(windows,/powershell-launch\.cmd/,'PowerShell paste must use a Windows launcher that creates a separate visible console');
  assert.match(windows,/start "" powershell\.exe/,'Windows launcher must create the interactive PowerShell window independently of Electron');
  assert.match(windows,/powershell-pid\.txt/,'the interactive PowerShell process must identify its real PID');
  assert.match(windows,/-File "\$\{b\}"/,'Windows START launcher must execute the generated bootstrap file');
  assert.match(windows,/Set-Content[\s\S]*ready[\s\S]*Start-Transcript/,'ready signal must be written before transcript setup can fail');
  assert.match(windows,/powershell-startup-error\.txt/,'PowerShell startup failures must be captured in diagnostics');
  assert.match(windows,/spawn\('cmd\.exe',\['\/d','\/s','\/c',launcherPath\]/,'PowerShell paste must delegate visible-console creation to the Windows START launcher');
  assert.doesNotMatch(windows,/child=spawn\('powershell\.exe'[\s\S]{0,300}detached:true/,'Electron must not directly own the interactive PowerShell console process');
  assert.match(windows,/SetForegroundWindow/,'PowerShell activation must use native Win32 focus recovery');
  assert.match(windows,/native-window-owner/,'PowerShell activation must recover when Windows Terminal owns the visible window');
  assert.match(windows,/visibleWindows/,'activation timeout diagnostics must capture visible window metadata');
  assert.match(windows,/ui-state\.json/);
  assert.match(windows,/discoverAdoptableReleaseGate/);
  assert.match(windows,/tasklist\.exe/,'Windows PID checks must fall back to tasklist when process.kill cannot inspect an elevated shell');
  assert.match(windows,/releaseGateActivityFresh/,'manual release-gate adoption must use live runner/log activity as liveness evidence');
  assert.match(windows,/terminal&&\(!info\.pid\|\|!alive\)/,'terminal adopted runs must finish as soon as the monitored process exits even when state/log files were just updated');
  assert.match(windows,/10\*60\*1000/,'recent release-gate activity must survive long-running Playwright tests');
  assert.match(server,/info\?\.active/,'the Windows dashboard must adopt gates using robust active evidence instead of PID visibility alone');
  assert.match(windows,/runner-state\.json/);
  assert.match(windows,/\.current-run\.lock/);
  for(const stage of ['manualGateAdoption','handoff','chatgpt','chatgptPowerShellRoundTrip','download','apply','retest','gitPush','deployment','postDeployAdoption'])assert.ok(selfTest.includes(stage),stage);
  assert.match(selfTest,/createSandboxFixture/);
  assert.match(selfTest,/startSandboxManualGate/);
  assert.match(selfTest,/adoptSandboxManualGate/);
  assert.match(selfTest,/init','--bare'/);
  assert.match(selfTest,/Apply-Repair\.ps1/);
  assert.match(selfTest,/refs\/heads\/testing/);
  assert.match(selfTest,/Do not access or modify 86 Chaos/);
  assert.doesNotMatch(selfTest,/testing\.86chaos\.com|api\/build-identity/,'sandbox self-test must not use the real 86 Chaos deployment endpoint');
  assert.match(app,/selfTestSteps/);
  assert.match(server,/\/api\/self-test-diagnostic/);
  assert.match(server,/save-self-test-diagnostic/);
  assert.match(server,/shell:Downloads/,'diagnostic saving must resolve the real Windows Downloads known folder');
  assert.match(server,/saveSelfTestDiagnosticToDownloads/);
  assert.match(server,/diagnosticPathInsideRoot/,'diagnostic path validation must use path.relative instead of case-sensitive prefix matching');
  assert.match(server,/handoff-diagnostics/,'the self-test diagnostic saver must accept Yardmaster handoff diagnostics as a safe fallback');
  assert.match(server,/error\.selfTest\?\.diagnostic\|\|error\.diagnostic/,'self-test diagnostics must take precedence over nested ChatGPT handoff diagnostics');
  assert.match(server,/diagnostic ZIP and trace are unavailable/,'diagnostic saving must fall back to the trace when the ZIP is missing');
  assert.match(server,/Diagnostics were automatically saved to/);
  assert.match(app,/bindActions\(\$\('#selfTestSteps'\)\)/,'dynamic diagnostic buttons must be rebound after every render');
  assert.match(app,/Diagnostic evidence saved automatically to:/);
  assert.match(app,/Save Another Diagnostic Copy/);
  assert.match(selfTest,/Yardmaster-Self-Test-Diagnostic-/);
  assert.match(selfTest,/ChatGPT-originated PowerShell/);
  assert.match(selfTest,/onAssistantProtocol/);
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
  const server=read('server.mjs'),html=read('public/index.html'),app=read('public/app.js');
  assert.match(server,/autoHandoff:true/);
  assert.match(server,/automationDefaultsVersion:7/);
  assert.match(server,/autoSelfHeal:true/);
  assert.match(server,/config\.autoHandoff=true/);
  assert.match(server,/await submitCurrentHandoff\(\)/);
  assert.match(server,/YARDMASTER_TEST_HANDOFF_STUB/);
  assert.match(html,/Resume Handoff/);
  assert.match(app,/Resume Current Failed Test/);
  assert.match(app,/Upload Failed ZIP & Continue/);
  assert.match(server,/submitCurrentHandoff\(\{resume=false\}=\{\}\)/);
  assert.match(server,/submitCurrentHandoff\(\{resume:true\}\)/);
  assert.match(server,/The Play Store gate will not restart/);
  assert.match(server,/if\(!resume\)wf\.repairAttempts/,'transport-level handoff retries must not consume another repair attempt');
  assert.match(html,/Send failures to ChatGPT automatically/);
});

test('phone push notifications register, display, self-test, and expose delivery health',()=>{
  const server=read('server.mjs'),app=read('public/app.js'),sw=read('public/sw.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(html,/Enable Phone Notifications/);
  assert.match(html,/Send Test/);
  assert.match(app,/Notification\.requestPermission/);
  assert.match(app,/navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(app,/pushManager\.subscribe/);
  assert.match(app,/applicationServerKey:pushKeyBytes/);
  assert.match(app,/\/api\/push\/subscribe/);
  assert.match(app,/\/api\/push\/test/);
  assert.match(app,/forceResubscribe/);
  assert.match(server,/validPushSubscription/);
  assert.match(server,/sendPushToDevice/);
  assert.match(server,/needs-resubscribe/);
  assert.match(server,/pushLastError/);
  assert.match(server,/mailto:support@86chaos\.com/);
  assert.match(server,/Yardmaster notifications enabled/);
  assert.match(sw,/addEventListener\('push'/);
  assert.match(sw,/showNotification/);
  assert.match(sw,/addEventListener\('notificationclick'/);
  assert.match(sw,/openWindow/);
  assert.ok(sw.includes('yardmaster-v'+pkg.version),'service-worker cache key must track the package version');
});

test('Playwright black-box coverage is wired into the full Play Store command',()=>{
  const pkg=JSON.parse(read('package.json')),config=read('playwright.config.mjs'),spec=read('test/playwright/yardmaster.e2e.spec.mjs');
  assert.equal(pkg.devDependencies?.['@playwright/test'],'1.63.0');
  assert.equal(pkg.scripts?.['test:play-store'],'node scripts/run-play-store.mjs');
  const runner=read('scripts/run-play-store.mjs');assert.match(runner,/node_modules\/playwright\/cli\.js/,'the full runner must execute Playwright after Node');assert.match(runner,/--test-concurrency=1/);
  assert.match(config,/channel:process\.platform==='win32'\?'msedge'/);
  for(const marker of ['clean composer uploads one ZIP','visible stale attachment is removed','stale selected file input','complete ZIP plus prompt plus trusted send','delayed assistant activity prevents a false handoff failure','self-heal controls queue diagnostics without touching 86 Chaos','failed handoff exposes detailed status','start, pause, resume, and stop controls'])assert.ok(spec.includes(marker),marker);
});


test('Yardmaster self-heal is supervised, website-verified, test-gated, rollback-safe, and checkpoint-resumable',()=>{
  const server=read('server.mjs'),engine=read('automation/self-heal.mjs'),supervisor=read('scripts/Yardmaster-Supervisor.ps1'),html=read('public/index.html'),app=read('public/app.js'),pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts?.['test:self-heal'],'node --test --test-concurrency=1 test/self-heal.test.mjs test/play-store-chatgpt-send.test.mjs');
  for(const marker of ['Self-heal Yardmaster automatically','Maximum Self-Heal Attempts','Run Self-Heal Diagnostic','Resume Self-Heal'])assert.ok(html.includes(marker),marker);
  assert.match(app,/autoSelfHeal/);assert.match(app,/maxSelfHealAttempts/);assert.match(app,/selfHealState/);
  assert.match(server,/queueSelfHeal/);assert.match(server,/runPendingSelfHeal/);assert.match(server,/fetchAndCertifyPublishedSelfHeal/);assert.match(server,/-ExpectedSha256',certified\.sha256/);assert.match(read('scripts/Update-Yardmaster.ps1'),/ExpectedSha256/);assert.match(server,/restoreSelfHealCheckpoint/);assert.match(server,/confirmSelfHealUpdateAfterSoak/);assert.match(server,/YARDMASTER_SELF_HEAL_SOAK_MS\|\|60000/);
  assert.match(server,/resumeAfterUpdate:\{kind:'self-heal',checkpoint:request\.checkpoint\}/);
  assert.match(server,/YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY/);
  assert.match(engine,/SELF_HEAL_REQUIRED_TESTS=\['test:self-heal','test:playwright','test:play-store'\]/);
  assert.match(engine,/release\.json/);assert.match(engine,/sha256File/);assert.match(engine,/manifest\.sha256/);
  assert.match(engine,/published!==true/);assert.match(engine,/ALLOWED_RELEASE_HOSTS/);assert.match(engine,/YARDMASTER_SELF_HEAL\.json/);
  assert.match(engine,/shell:process\.platform==='win32'&&\/\\\.cmd\$\/i\.test\(command\)/);
  assert.match(read('desktop.cjs'),/capturePage\(\)/);assert.match(read('desktop.cjs'),/renderer-unresponsive/);assert.match(supervisor,/yardmaster-window\.png/);assert.match(supervisor,/Desktop heartbeat is stale/);assert.doesNotMatch(supervisor,/CopyFromScreen|VirtualScreen/);assert.match(supervisor,/operator-unhealthy-timeout/);assert.match(supervisor,/unexpected-yardmaster-exit/);assert.match(supervisor,/self-heal-request\.json/);assert.match(supervisor,/Restore-YardmasterRollback/);assert.match(supervisor,/latestDiagnosticPath/);
});

test('desktop menu bootstrap binds the full navigation collection without a startup exception',()=>{
  const app=read('public/app.js'),spec=read('test/playwright/full-app.e2e.spec.mjs');
  assert.ok(app.includes("$('[data-nav]').forEach"),'desktop navigation must bind the complete NodeList collection');
  assert.doesNotMatch(app,/(^|[^$])\$\('\[data-nav\]'\)\.forEach/m,'querySelector returns one element and must never be used with forEach for menu binding');
  assert.match(spec,/desktop menu bootstrap remains error-free/);
  assert.match(spec,/pageerror/,'Playwright must fail on renderer bootstrap exceptions');
  assert.match(spec,/\['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence'\]/,'Playwright must exercise every desktop menu destination');
});

test('full-app self-heal Playwright fixture always uses a candidate newer than the current Yardmaster build',()=>{
  const pkg=JSON.parse(read('package.json')),spec=read('test/playwright/full-app.e2e.spec.mjs');
  const verify=source=>{
    const current=[...source.matchAll(/currentVersion:'(\d+\.\d+\.\d+)'/g)].map(m=>m[1]);
    const candidates=[...source.matchAll(/version:'(\d+\.\d+\.\d+)',published:true/g)].map(m=>m[1]);
    assert.ok(current.includes(pkg.version),'Playwright self-heal fixture must validate against the current package version');
    assert.ok(candidates.length>0,'Playwright self-heal fixture must declare a candidate version');
    const parts=v=>v.split('.').map(Number);const greater=(a,b)=>{const x=parts(a),y=parts(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false};
    assert.ok(candidates.every(v=>greater(v,pkg.version)),'every published Playwright self-heal candidate must be newer than the current Yardmaster build');
  };
  verify(spec);
  for(const version of [pkg.version,'0.1.0']){
    const stale=spec.replace(/version:'(\d+\.\d+\.\d+)',published:true/g,`version:'${version}',published:true`);
    assert.throws(()=>verify(stale),/every published Playwright self-heal candidate must be newer/);
  }
});

test('version labels stay synchronized',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.1.92');
  assert.ok(read('public/index.html').includes(pkg.version));
});


test('resilience controls expose detailed status, resumable failures, push health, and remote PC updates',()=>{
  const server=read('server.mjs'),html=read('public/index.html'),app=read('public/app.js');
  for(const marker of ['operatorStatusSnapshot','pushHealthSnapshot','update-operator-now','update-resume.json','resumeAfterOperatorUpdate','YARDMASTER_TEST_PUSH_STUB','YARDMASTER_TEST_UPDATE_STUB'])assert.ok(server.includes(marker),marker);
  for(const marker of ['doingStatus','waitingStatus','nextStatus','Update PC Yardmaster Now','pushHealthSummary'])assert.ok(html.includes(marker),marker);
  assert.ok(app.includes('pushKeysMatch'));
  assert.ok(app.includes('applicationServerKey'));
});

test('full dashboard Playwright coverage respects panel-scoped controls',()=>{
  const spec=read('test/playwright/full-app.e2e.spec.mjs');
  assert.match(spec,/panel-scoped controls/);
  for(const nav of ['branches','queue','chatgpt','settings'])assert.ok(spec.includes('[data-nav="'+nav+'"]'),nav);
  assert.match(spec,/\['repositoryPath','testingUrl'\]/);
  assert.match(spec,/\['repoUpdate','maxRepairAttempts','maxSelfHealAttempts','autoHandoff','autoSelfHeal'\]/);
  assert.match(spec,/\['chatMode','model','thinkingEffort'\]/);
  assert.match(spec,/\['autoUpdateOperator','pushHealthSummary'\]/);
  assert.doesNotMatch(spec,/for\(const id of \['repositoryPath','testingUrl','repoUpdate','maxRepairAttempts'/);
});
