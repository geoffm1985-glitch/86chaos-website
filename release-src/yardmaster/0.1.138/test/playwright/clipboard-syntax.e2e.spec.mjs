import * as awaitVersionFixture from '../helpers/version-fixture.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {captureClipboardScripts,parseClipboardScripts} from '../helpers/clipboard-scripts.mjs';
import {SELF_HEAL_REQUIRED_TESTS,validateSelfHealPlan} from '../../automation/self-heal.mjs';

test('Windows clipboard PowerShell regression retains valid read/write/clear try/catch and backoff',()=>{
  const commands=captureClipboardScripts();
  expect(commands).toHaveLength(3);
  for(const {script} of commands){
    expect(script).not.toMatch(/}\s*;\s*catch\b/);
    expect(script).toMatch(/}\n\s*catch\{/);
    expect(script).toContain('for($i=0;$i -lt 12;$i++)');
    expect(script).toContain('[Math]::Min(900,75+($i*75))');
    expect(script).toContain('throw $last');
  }
  if(process.platform==='win32')parseClipboardScripts();
});

test('self-heal fixture extracts semantic versions and rejects equal or older published candidates',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  const {currentVersion,nextVersion}=awaitVersionFixture;
  expect(currentVersion).toBe(pkg.version);const candidates=[nextVersion];
  const failure='clipboard syntax surgical repair regression';
  const plan={schema:1,published:true,releaseManifestUrl:'https://www.86chaos.com/yardmaster/release.json',requiredTests:[...SELF_HEAL_REQUIRED_TESTS],regressionCoverage:{exactFailure:failure,playStoreTests:['test/clipboard-syntax.test.mjs'],playwrightTests:['test/playwright/clipboard-syntax.e2e.spec.mjs']}};
  for(const version of candidates)expect(()=>validateSelfHealPlan({...plan,version},{currentVersion:pkg.version,expectedFailure:failure})).not.toThrow();
  for(const version of [pkg.version,'0.1.0'])expect(()=>validateSelfHealPlan({...plan,version},{currentVersion:pkg.version,expectedFailure:failure})).toThrow(/must be newer/i);
});
