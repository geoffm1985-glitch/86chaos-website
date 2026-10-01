import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

function requireFor(root){return createRequire(path.join(root,'package.json'))}
function checkedExecutable(executable){
  if(typeof executable!=='string'||!fs.existsSync(executable)||!fs.statSync(executable).isFile())throw new Error('Electron test runtime is missing. Run node scripts/electron-test-runtime.mjs before Playwright.');
  return executable;
}
// Read metadata only. This function must never trigger Electron's lazy downloader
// from inside Playwright's timed launch operation.
export function preparedElectronExecutable(root){
  const packageRoot=path.dirname(requireFor(root).resolve('electron/package.json'));
  const metadata=path.join(packageRoot,'path.txt');
  const name=fs.existsSync(metadata)?fs.readFileSync(metadata,'utf8').trim():'';
  const override=process.env.ELECTRON_OVERRIDE_DIST_PATH;
  if(!name&&!override)throw new Error('Electron test runtime is not prepared. Run node scripts/electron-test-runtime.mjs before Playwright.');
  return checkedExecutable(path.join(override||path.join(packageRoot,'dist'),name||'electron'));
}
export async function prepareElectronRuntime(root,{loadElectron=()=>requireFor(root)('electron')}={}){
  // Installation may require a download. Finish it before starting timed tests.
  return checkedExecutable(await loadElectron());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=fileURLToPath(new URL('../',import.meta.url));
  console.log('[RUNNING] Preparing Electron runtime before Playwright launch...');
  try{await prepareElectronRuntime(root);preparedElectronExecutable(root);console.log('[PASS] Electron runtime is ready.')}catch(error){console.error('[FAIL] '+error.message);process.exitCode=1}
}
