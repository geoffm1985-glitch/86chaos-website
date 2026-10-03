import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {detectFirebaseTools} from '../automation/firebase-target.mjs';
test('release gate: broken repository semver dependency falls back to verified global emulator CLI',()=>{
 const global=path.join('C:/Global','node_modules/firebase-tools/lib/bin/firebase.js'),calls=[];
 const result=detectFirebaseTools('C:/Repo','C:/App',{exists:()=>true,platform:'win32',run:(exe,args)=>{calls.push([exe,args]);if(exe==='where.exe')return 'C:/Global/firebase.cmd\n';if(exe==='java')return '';if(args[0]!==global)throw Error("Cannot find module 'semver'");return '15.25.1'}});
 assert.equal(result.prefix[0],global);assert.ok(calls.some(c=>c[0]==='java'));
});
test('release gate: all broken CLIs block safely with no live fallback',()=>assert.throws(()=>detectFirebaseTools('repo','app',{exists:()=>false,run:()=>{throw Error('missing')}}),/No runnable Firebase CLI.*No live fallback/));
test('release gate: Java startup remains mandatory for emulator mode',()=>assert.throws(()=>detectFirebaseTools('repo','app',{exists:()=>true,run:exe=>{if(exe==='java')throw Error('missing');if(exe==='where.exe')throw Error('missing');return '15'}}),/Java JDK/));
