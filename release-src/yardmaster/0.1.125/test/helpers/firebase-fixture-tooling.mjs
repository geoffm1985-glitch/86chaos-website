import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function fixtureFirebaseTools(repo){
  const root=path.resolve(repo),temp=path.resolve(os.tmpdir())+path.sep;
  const marker=path.join(repo,'yardmaster-firebase-fixture.marker');
  if(!root.startsWith(temp)||!fs.existsSync(marker)||fs.readFileSync(marker,'utf8')!=='isolated Firebase process fixture')throw new Error('Firebase test tooling requires a marked disposable local fixture.');
  const cli=path.join(repo,'node_modules/firebase-tools/lib/bin/firebase.js');
  if(!fs.existsSync(cli))throw new Error('Controlled fixture CLI is missing.');
  return {executable:process.execPath,prefix:[cli]};
}
