import {spawn} from 'node:child_process';

export function operatorManifestUrl(pkg,env=process.env){
  return env.YARDMASTER_RELEASE_MANIFEST||pkg.updateManifestUrl||'https://www.86chaos.com/yardmaster/release.json';
}
export function validateOperatorRelease(release,{channel='production',allowTestingCandidate=false}={}){
  const testingCandidate=channel==='testing'&&allowTestingCandidate&&release?.channel==='testing'&&release?.verification?.candidate==='testing-only';
  if(!release?.version||!/^\d+\.\d+\.\d+$/.test(release.version)||!release.downloadUrl||!/^https:\/\//.test(release.downloadUrl)&&!release.downloadUrl.startsWith('/')||!/^[a-f0-9]{64}$/i.test(release.sha256||'')||release.verified!==true&&!testingCandidate){
    throw new Error('Release manifest is incomplete or not verified. Testing candidates require a manual update from a testing installation.');
  }
  if(release.updateDownloadUrl){
    if(!/^https:\/\//.test(release.updateDownloadUrl)||!/^[a-f0-9]{64}$/i.test(release.updateSha256||''))throw new Error('Update package URL or checksum is incomplete.');
    return {...release,downloadUrl:release.updateDownloadUrl,sha256:release.updateSha256};
  }
  return release;
}
export function launchUpdaterProcess(args,{spawnProcess=spawn}={}){
  return new Promise((resolve,reject)=>{
    const child=spawnProcess('powershell.exe',args,{detached:true,stdio:'ignore',windowsHide:true});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve(child)});
  });
}
