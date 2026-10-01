import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {preparedElectronExecutable,prepareElectronRuntime} from '../scripts/electron-test-runtime.mjs';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ym-electron-runtime-')),pkg=path.join(root,'node_modules','electron'),executable=path.join(pkg,'dist','electron.exe');fs.mkdirSync(path.dirname(executable),{recursive:true});fs.writeFileSync(path.join(root,'package.json'),'{}');fs.writeFileSync(path.join(pkg,'package.json'),'{"name":"electron","main":"index.cjs"}');return {root,pkg,executable,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})}}
test('prepared executable lookup never evaluates Electron lazy installation inside a timed launch',()=>{const f=fixture();try{fs.writeFileSync(path.join(f.pkg,'index.cjs'),'throw new Error("lazy downloader must not run");');fs.writeFileSync(path.join(f.pkg,'path.txt'),'electron.exe\r\n');fs.writeFileSync(f.executable,'fixture binary');assert.equal(preparedElectronExecutable(f.root),f.executable)}finally{f.cleanup()}});
test('cold runtime preparation finishes the download before exposing an executable',async()=>{const f=fixture(),events=[];try{fs.writeFileSync(path.join(f.pkg,'path.txt'),'electron.exe');const preparing=prepareElectronRuntime(f.root,{loadElectron:async()=>{events.push('install-start');await new Promise(resolve=>setTimeout(resolve,20));fs.writeFileSync(f.executable,'fixture binary');events.push('install-complete');return f.executable}});assert.equal(fs.existsSync(f.executable),false);assert.equal(await preparing,f.executable);events.push('launch-ready');assert.deepEqual(events,['install-start','install-complete','launch-ready']);assert.equal(preparedElectronExecutable(f.root),f.executable)}finally{f.cleanup()}});
test('missing executable and installation errors fail preparation rather than entering Playwright launch',async()=>{const f=fixture();try{assert.throws(()=>preparedElectronExecutable(f.root),/not prepared/);fs.writeFileSync(path.join(f.pkg,'path.txt'),'electron.exe');assert.throws(()=>preparedElectronExecutable(f.root),/runtime is missing/);await assert.rejects(prepareElectronRuntime(f.root,{loadElectron:()=>f.executable}),/runtime is missing/);await assert.rejects(prepareElectronRuntime(f.root,{loadElectron:()=>{throw new Error('download failed')}}),/download failed/)}finally{f.cleanup()}});
test('repair runner prepares Electron before selecting only the failed Playwright regression',()=>{
 const f=fixture();try{
  // Execute the real runner with certification replaced by a recording module.
  fs.copyFileSync(new URL('../scripts/run-chatgpt-dock-repair.mjs',import.meta.url),path.join(f.root,'runner.mjs'));
  fs.writeFileSync(path.join(f.root,'run-play-store.mjs'),'export async function runCertification({stages}){console.log(JSON.stringify(stages));return {code:0}}');
  const r=spawnSync(process.execPath,[path.join(f.root,'runner.mjs')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const stages=JSON.parse(r.stdout);
  assert.equal(stages.length,3);assert.ok(stages[0].args.includes('test/electron-test-runtime.test.mjs'));assert.deepEqual(stages[1].args,['scripts/electron-test-runtime.mjs']);assert.ok(stages[2].args.includes('--grep=@chatgptCold197'));assert.ok(!stages[2].args.includes('--grep=@chatgptBridge196'));
 }finally{f.cleanup()}
});
