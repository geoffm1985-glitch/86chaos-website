import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCertification} from '../../scripts/run-play-store.mjs';
import {reportingProbe,nodeReporterArgument,root} from '../helpers/test-reporting-fixtures.mjs';

test('local certification reports a nonzero phase, stops subsequent tests, and exports the failure diagnostic ZIP',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-pw-cert-diag-')),lines=[];
  try{
    const result=await runCertification({root,stages:[{name:'FIXTURE FAILURE',args:['-e',"console.error('playwright diagnostic fixture');process.exit(9)"]},{name:'MUST NOT RUN',args:['-e','process.exit(0)']}],write:line=>lines.push(line),diagnosticDir:path.join(temp,'diagnostics')});
    expect(result.code).toBe(9);expect(result.results).toHaveLength(1);expect(result.diagnosticPath).toBeTruthy();expect(fs.existsSync(result.diagnosticPath)).toBe(true);
    const zip=fs.readFileSync(result.diagnosticPath);expect(zip.readUInt32LE(0)).toBe(0x04034b50);expect(zip.toString('utf8')).toContain('stage-output.log');expect(zip.toString('utf8')).toContain('playwright diagnostic fixture');
    expect(lines.join('\n')).toContain('[DIAGNOSTIC] Exported failure ZIP:');expect(lines.join('\n')).toContain('OVERALL FAIL');expect(lines.join('\n')).toContain('[NOT RUN] MUST NOT RUN');expect(lines.join('\n')).not.toContain('OVERALL PASS');
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
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
