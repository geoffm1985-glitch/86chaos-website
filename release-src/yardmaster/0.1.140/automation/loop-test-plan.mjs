export const TEST_TYPES=['delta','targeted','full','full-then-delta','playwright'];

export function plannedTestType(configured,workflow){
  const plan=workflow?.closedLoop&&workflow.testPlan?workflow.testPlan:configured;
  if(plan==='full-then-delta')return workflow?.fullFirstComplete?'delta':'full';
  return ['delta','targeted','full','playwright'].includes(plan)?plan:'delta';
}

export function completeFirstFull(workflow,run){
  if(workflow?.testPlan!=='full-then-delta'||run?.testType!=='full')return false;
  // A certification blocked before execution has not exercised the full gate.
  if((run.log||[]).some(line=>/BLOCKED BEFORE TEST EXECUTION/i.test(String(line))))return false;
  // A paused/interrupted process is resumed as full until it actually finishes.
  workflow.fullFirstComplete=true;
  return true;
}

export function assertManagedGateCommand(script){
  if(/\bnpm(?:\.cmd)?\s+run\s+test:(?:play-store(?:\b|:)|playwright\b)/i.test(String(script))){
    throw Object.assign(new Error('Release-gate tests must run through Yardmaster so its emulator runtime, process ownership and long browser deadlines remain active. Return any local preparation as POWERSHELL without npm test commands, then put RUN full (or RUN delta for a completed full gate) outside POWERSHELL in the YARDMASTER block. Do not repeat completed local preparation.'),{code:'POWERSHELL_COMMAND_FAILED'});
  }
}
