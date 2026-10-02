import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./prepare-yardmaster-release.mjs',import.meta.url),'utf8');
const block=source.slice(source.indexOf('const updateSha256='),source.indexOf('fs.writeFileSync(releaseFile'));
function build(recorded){return vm.runInNewContext(block+'\nrelease;', {recorded,sha256:'b'.repeat(64),version:'0.1.123',sourceCommit:'verified'});}
test('website repacking preserves the independently downloaded updater checksum',()=>{
  const result=build({updateDownloadUrl:'https://raw.githubusercontent.com/owner/repo/main/package.zip',updateSha256:'a'.repeat(64)});
  assert.equal(result.sha256,'b'.repeat(64));
  assert.equal(result.updateSha256,'a'.repeat(64));
});
test('same website archive uses its newly built checksum',()=>assert.equal(build({}).updateSha256,'b'.repeat(64)));
test('an external package without a valid recorded checksum is rejected',()=>assert.throws(()=>build({updateDownloadUrl:'https://example.com/package.zip'}),/checksum is missing/));
