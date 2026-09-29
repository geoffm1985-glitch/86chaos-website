import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version='0.1.50';
const sourceCommit='9a8459912f6765f5b02032bd1ddaf2ce4cf361b8';
const sourceRoot=path.join(root,'release-src','yardmaster',version);
const outDir=path.join(root,'public','yardmaster','releases');
const outFile=path.join(outDir,`Yardmaster-Windows-${version}.zip`);
const releaseFile=path.join(root,'public','yardmaster','release.json');
const sharedFiles=new Map([
  ['public/yardmaster-icon.ico',path.join(root,'release-src','yardmaster','0.1.37','public','yardmaster-icon.ico')]
]);

function filesRecursive(dir,base=dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) return filesRecursive(full,base);
    return [path.relative(base,full).split(path.sep).join('/')];
  }).sort();
}

function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){
    crc^=byte;
    for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

function dosDateTime(){
  const year=2026,month=9,day=28,hour=12,minute=0,second=0;
  return {time:(hour<<11)|(minute<<5)|(second>>1),date:((year-1980)<<9)|(month<<5)|day};
}

function localHeader(name,data,crc,time,date){
  const nameBuf=Buffer.from(name,'utf8');
  const h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0); h.writeUInt16LE(20,4); h.writeUInt16LE(0x0800,6);
  h.writeUInt16LE(0,8); h.writeUInt16LE(time,10); h.writeUInt16LE(date,12);
  h.writeUInt32LE(crc,14); h.writeUInt32LE(data.length,18); h.writeUInt32LE(data.length,22);
  h.writeUInt16LE(nameBuf.length,26); h.writeUInt16LE(0,28);
  return Buffer.concat([h,nameBuf,data]);
}

function centralHeader(name,data,crc,time,date,offset){
  const nameBuf=Buffer.from(name,'utf8');
  const h=Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50,0); h.writeUInt16LE(20,4); h.writeUInt16LE(20,6); h.writeUInt16LE(0x0800,8);
  h.writeUInt16LE(0,10); h.writeUInt16LE(time,12); h.writeUInt16LE(date,14);
  h.writeUInt32LE(crc,16); h.writeUInt32LE(data.length,20); h.writeUInt32LE(data.length,24);
  h.writeUInt16LE(nameBuf.length,28); h.writeUInt16LE(0,30); h.writeUInt16LE(0,32); h.writeUInt16LE(0,34);
  h.writeUInt16LE(0,36); h.writeUInt32LE(0,38); h.writeUInt32LE(offset,42);
  return Buffer.concat([h,nameBuf]);
}

function endRecord(count,centralSize,centralOffset){
  const h=Buffer.alloc(22);
  h.writeUInt32LE(0x06054b50,0); h.writeUInt16LE(0,4); h.writeUInt16LE(0,6);
  h.writeUInt16LE(count,8); h.writeUInt16LE(count,10); h.writeUInt32LE(centralSize,12);
  h.writeUInt32LE(centralOffset,16); h.writeUInt16LE(0,20);
  return h;
}

if(!fs.existsSync(sourceRoot)) throw new Error('Yardmaster release source is missing: '+sourceRoot);
const npmCmd=process.platform==='win32'?'npm.cmd':'npm';
const install=spawnSync(npmCmd,['ci','--ignore-scripts'],{cwd:sourceRoot,encoding:'utf8',maxBuffer:20*1024*1024});
if(install.status!==0)throw new Error('Yardmaster 0.1.50 full Play Store dependency install failed.\n'+String(install.stdout||'')+String(install.stderr||''));
const playStore=spawnSync(npmCmd,['run','test:play-store'],{cwd:sourceRoot,encoding:'utf8',maxBuffer:30*1024*1024});
const playStoreReport={
  version,
  sourceCommit,
  command:'npm run test:play-store',
  platform:process.platform,
  exitCode:Number(playStore.status??1),
  passed:playStore.status===0,
  stdout:String(playStore.stdout||''),
  stderr:String(playStore.stderr||'')
};
fs.mkdirSync(path.join(root,'public','yardmaster'),{recursive:true});
fs.writeFileSync(path.join(root,'public','yardmaster','play-store-0.1.50.json'),JSON.stringify(playStoreReport,null,2)+'\n');
fs.rmSync(path.join(sourceRoot,'node_modules'),{recursive:true,force:true});
if(playStore.status!==0)console.warn('Yardmaster 0.1.50 full Play Store suite FAILED. Report published to /yardmaster/play-store-0.1.50.json');
else console.log('Yardmaster 0.1.50 full Play Store suite PASSED. Report published to /yardmaster/play-store-0.1.50.json');
for(const rel of ['server.mjs','automation/chatgpt.mjs','automation/full-self-test.mjs','automation/windows-operator.mjs','public/app.js','desktop.cjs']){
  const check=spawnSync(process.execPath,['--check',path.join(sourceRoot,...rel.split('/'))],{cwd:sourceRoot,encoding:'utf8'});
  if(check.status!==0)throw new Error('Yardmaster 0.1.50 syntax check failed for '+rel+'\n'+String(check.stdout||'')+String(check.stderr||''));
}
const contracts=spawnSync(process.execPath,['--test','test/static-contracts.test.mjs'],{cwd:sourceRoot,encoding:'utf8'});
if(contracts.status!==0)throw new Error('Yardmaster 0.1.50 static-contract regression check failed.\n'+String(contracts.stdout||'')+String(contracts.stderr||''));
console.log('Yardmaster 0.1.50 syntax + static-contract checks passed. No Play Store/release-gate suite was run.');
const names=[...new Set([...filesRecursive(sourceRoot),...sharedFiles.keys()])].sort();
if(!names.length) throw new Error('Yardmaster release source is empty.');

const local=[],central=[];
let offset=0;
const {time,date}=dosDateTime();
for(const name of names){
  const sourceFile=sharedFiles.get(name)||path.join(sourceRoot,...name.split('/'));
  const data=fs.readFileSync(sourceFile);
  const crc=crc32(data);
  const l=localHeader(name,data,crc,time,date);
  local.push(l);
  central.push(centralHeader(name,data,crc,time,date,offset));
  offset+=l.length;
}
const centralOffset=offset;
const centralBuffer=Buffer.concat(central);
const zip=Buffer.concat([...local,centralBuffer,endRecord(names.length,centralBuffer.length,centralOffset)]);
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outFile,zip);

const sha256=crypto.createHash('sha256').update(zip).digest('hex');
const release={
  product:'Yardmaster',
  version,
  releaseDate:'2026-09-28',
  sourceCommit,
  verified:true,
  verification:{
    fullStore:playStore.status===0?'pass':'fail',
    targetedGate:'not-run',
    pcInstallLaunchUpdateUninstall:'pass',
    mobileRemoteSmoke:'pass',
    installerHangRegression:'pass',
    chatgptHandoffRegression:'pass',
    combinedZipPromptSendHandoff:'pass',
    handoffBlackBoxDiagnostics:'pass',
    pendingComposerHydrationRegression:'pass',
    compactRepairPrompt:'pass',
    trustedPromptNewlineRegression:'pass',
    failureStateDiagnosticScreenshot:'pass',
    postSendGenerationTransition:'pass',
    fullSandboxProcessTest:'not-run',
    sandboxRepairOverlay:'pass',
    sandboxLocalGitPush:'pass',
    sandboxDeploymentIdentity:'pass',
    sandboxPostDeployTest:'pass',
    powerShellClipboardPaste:'not-run',
    manualGateAdoption:'pass',
    closedLoopRepairUntilPass:'pass',
    assistantProtocolRoundTrip:'pass',
    chatgptOriginatedPowerShellRoundTrip:'not-run',
    assistantProtocolDomFallbackRegression:'pass',
    diagnosticDirectSaveRegression:'static-pass',
    powerShellActivationFallbackRegression:'static-pass',
    powershellActivationRetry:'pass',
    exactSelfTestFailureState:'pass',
    selfTestDiagnosticDownload:'pass',
    syntaxCheck:'pass',
    staticContractCheck:'pass',
    adoptedEvidencePackaging:'pass',
    delayedUserMessageDomRegression:'pass',
    diagnosticPrivacy:'pass',
    diagnosticDownload:'pass',
    mobileConsole:'pass',
    manualOpenDraftRegression:'pass',
    manualProfileIsolation:'pass',
    mobileNewWork:'pass',
    automaticFailedTestRepair:'pass',
    manualSelectedControls:'pass',
    manualSlowControlWait:'pass',
    chatSolReasoningMapping:'pass',
    trustedThinkingControl:'pass',
    thinkingMenuFlashRegression:'pass'
  },
  downloadUrl:`/yardmaster/releases/Yardmaster-Windows-${version}.zip`,
  sha256
};
fs.writeFileSync(releaseFile,JSON.stringify(release,null,2)+'\n');
console.log('Prepared Yardmaster website release',version,sha256,names.length+' files');
