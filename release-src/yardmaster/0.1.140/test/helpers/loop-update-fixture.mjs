import fs from 'node:fs';
import path from 'node:path';

// The hosted remote dashboard is intentionally phone-only below 761px.
// Preserve the Android device viewport; give desktop a phone-sized view.
export function hostedMobileViewport(viewport){
  return viewport&&viewport.width<=760?viewport:{width:390,height:844};
}

// Match the operator's layout: handoff inputs are outside browser downloads.
// Otherwise slow WebKit uploads can make the input look like a repaired ZIP.
export function createLoopRepairFiles(root){
  const inputs=path.join(root,'handoff'),downloads=path.join(root,'downloads');
  fs.mkdirSync(inputs,{recursive:true});fs.mkdirSync(downloads,{recursive:true});
  const artifact=path.join(inputs,'current-handoff.zip');
  fs.writeFileSync(artifact,'handoff fixture');
  return {artifact,downloads};
}
