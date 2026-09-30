import {test,expect} from '@playwright/test';
import {runCertification} from '../../scripts/run-play-store.mjs';
import {reportingProbe,nodeReporterArgument,root} from '../helpers/test-reporting-fixtures.mjs';

test('local certification reports a nonzero phase as overall FAIL and stops subsequent tests',async()=>{
  const lines=[];
  const result=await runCertification({root,stages:[{name:'FIXTURE FAILURE',args:['-e','process.exit(9)']},{name:'MUST NOT RUN',args:['-e','process.exit(0)']}],write:line=>lines.push(line)});
  expect(result.code).toBe(9);expect(result.results).toHaveLength(1);
  expect(lines.join('\n')).toContain('OVERALL FAIL');expect(lines.join('\n')).toContain('[NOT RUN] MUST NOT RUN');expect(lines.join('\n')).not.toContain('OVERALL PASS');
});

test('actual Node reporter exposes passing, skipped and failing tests without ambiguous glyphs',()=>{
  const result=reportingProbe('node',{fail:true});
  expect(result.code).toBe(1);expect(result.output).toContain('[PASS] NODE: passing probe');expect(result.output).toContain('[SKIP] NODE: skipped probe');expect(result.output).toContain('[FAIL] NODE: failing probe');expect(result.output).toContain('[FAIL] NODE TESTS');expect(result.output).not.toMatch(/\u001b|[✓✘✔✖]/);
});

test('reporter fixture uses ESM file URLs for Windows paths and preserves success and failure exits',()=>{
  expect(nodeReporterArgument('C:\\Users\\geoff\\Yardmaster Repo #1',{windows:true})).toBe('--test-reporter=file:///C:/Users/geoff/Yardmaster%20Repo%20%231/scripts/reporters/node-status.mjs');
  for(const fail of [false,true]){
    const result=reportingProbe('node',{fail});
    expect(result.code,result.output).toBe(fail?1:0);expect(result.output).toContain(`[${fail?'FAIL':'PASS'}] NODE TESTS`);
    expect(result.output).not.toContain('ERR_UNSUPPORTED_ESM_URL_SCHEME');
  }
});
