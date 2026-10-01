import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version='0.1.90';
const sourceCommit='9aafa7c42d71b0a622a5526e15f21dde6ad29027';
const sourceRoot=path.join(root,'release-src','yardmaster',version);
const outDir=path.join(root,'public','yardmaster','releases');
const outFile=path.join(outDir,`Yardmaster-Windows-${version}.zip`);
const releaseFile=path.join(root,'public','yardmaster','release.json');
const sharedFiles=new Map();

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
  const year=2026,month=10,day=1,hour=12,minute=0,second=0;
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
// Website publication must be deterministic and must not reinstall the Windows desktop app's dependencies.
// The user confirmed the exact Windows targeted Node and Playwright rerun passed for this source commit.
// Vercel performs syntax validation here, then packages that tested source verbatim.
for(const rel of ['server.mjs','automation/chatgpt.mjs','automation/full-self-test.mjs','automation/windows-operator.mjs','automation/self-heal.mjs','public/app.js','desktop.cjs']){
  const check=spawnSync(process.execPath,['--check',path.join(sourceRoot,...rel.split('/'))],{cwd:sourceRoot,encoding:'utf8'});
  if(check.status!==0)throw new Error('Yardmaster 0.1.90 syntax check failed for '+rel+'\n'+String(check.stdout||'')+String(check.stderr||''));
}
const targetedReport={
  version,
  sourceCommit,
  command:'User-reported Windows 0.1.90 exact targeted rerun passed; website build performs syntax/package verification only',
  platform:process.platform,
  exitCode:0,
  passed:true,
  source:'user-reported Windows targeted run',
  note:'The user confirmed the 6 Node repair regressions and 5 selected Playwright tests passed. iPhone was excluded at user request. Full certification was not rerun; website build validates and packages the exact source.'
};
fs.mkdirSync(path.join(root,'public','yardmaster'),{recursive:true});
fs.writeFileSync(path.join(root,'public','yardmaster','targeted-0.1.90.json'),JSON.stringify(targetedReport,null,2)+'\n');
console.log('Yardmaster 0.1.90 website packaging preflight passed.');
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
  releaseDate:'2026-10-01',
  sourceCommit,
  verified:true,
  verification:{
    fullStore:'not-rerun',
    fullPlaywright:'not-rerun',
    certificationSource:'user-reported Windows targeted run',
    userConfirmedAt:'2026-10-01T02:09:12Z',
    syntaxCheck:'pass',
    targetedNode:'6 passed',
    targetedPlaywright:'5 passed',
    iphoneWebKit:'excluded at user request',
    promotion:'exact tested 0.1.90 source; user authorized production'
  },
  downloadUrl:`/yardmaster/releases/Yardmaster-Windows-${version}.zip`,
  sha256
};
fs.writeFileSync(releaseFile,JSON.stringify(release,null,2)+'\n');
console.log('Prepared Yardmaster website release',version,sha256,names.length+' files');
