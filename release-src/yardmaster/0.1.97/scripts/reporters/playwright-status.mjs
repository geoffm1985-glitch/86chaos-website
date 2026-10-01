import {stripVTControlCharacters} from 'node:util';

export default class PlaywrightStatus {
  onBegin(config,suite){this.tests=suite.allTests();this.completed=0;console.log(`\n[RUNNING] PLAYWRIGHT TESTS: ${this.tests.length} tests`);}
  onTestBegin(test){console.log(`[RUNNING] PLAYWRIGHT: ${test.titlePath().filter(Boolean).join(' > ')}`);}
  onTestEnd(test,result){
    const expected=result.status===test.expectedStatus;
    const label=result.status==='skipped'?'SKIP':expected?'PASS':result.status==='timedOut'?'TIMEOUT':'FAIL';
    this.completed++;
    console.log(`[${label}] PLAYWRIGHT: ${test.title} (${this.completed}/${this.tests.length}, ${(result.duration/1000).toFixed(1)} seconds)`);
    if(!expected&&result.status!=='skipped'){
      console.log(`  ${test.location.file}:${test.location.line}`);
      for(const error of result.errors||[])console.log(stripVTControlCharacters(error.stack||error.message||String(error)));
      for(const item of result.attachments||[])if(item.path)console.log(`  Evidence: ${item.path}`);
    }
  }
  onStdOut(chunk){process.stdout.write(stripVTControlCharacters(String(chunk)));}
  onStdErr(chunk){process.stderr.write(stripVTControlCharacters(String(chunk)));}
  onError(error){console.error('[FAIL] PLAYWRIGHT ERROR: '+stripVTControlCharacters(error.stack||error.message||String(error)));}
  onEnd(result){
    const counts={expected:0,unexpected:0,flaky:0,skipped:0};
    for(const test of this.tests||[])counts[test.outcome()]++;
    console.log(`\n[SUMMARY] PLAYWRIGHT: tests ${this.tests?.length||0} | pass ${counts.expected} | fail ${counts.unexpected} | skipped ${counts.skipped} | flaky ${counts.flaky}`);
    console.log(`[${result.status==='passed'?'PASS':'FAIL'}] PLAYWRIGHT TESTS - ${result.status.toUpperCase()} (${(result.duration/1000).toFixed(1)} seconds)\n`);
  }
}
