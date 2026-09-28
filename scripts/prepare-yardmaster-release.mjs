import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version='0.1.23';
const sourceCommit='0595a9eaf43c218cd2038f69418fa7937346d11e';
const sourceRoot=path.join(root,'release-src','yardmaster',version);
const outDir=path.join(root,'public','yardmaster','releases');
const outFile=path.join(outDir,`Yardmaster-Windows-${version}.zip`);
const releaseFile=path.join(root,'public','yardmaster','release.json');

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
const names=filesRecursive(sourceRoot);
if(!names.length) throw new Error('Yardmaster release source is empty.');

const local=[],central=[];
let offset=0;
const {time,date}=dosDateTime();
for(const name of names){
  const data=fs.readFileSync(path.join(sourceRoot,...name.split('/')));
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
    fullStore:'not-run',
    targetedGate:'pass',
    pcInstallLaunchUpdateUninstall:'pass',
    mobileRemoteSmoke:'pass',
    installerHangRegression:'pass',
    chatgptHandoffRegression:'pass',
    mobileConsole:'pass'
  },
  downloadUrl:`/yardmaster/releases/Yardmaster-Windows-${version}.zip`,
  sha256
};
fs.writeFileSync(releaseFile,JSON.stringify(release,null,2)+'\n');
console.log('Prepared Yardmaster website release',version,sha256,names.length+' files');
