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
  if(/\/api\/(?:action|command|config)\b/i.test(String(script))){
    throw Object.assign(new Error('Repair PowerShell must not call Yardmaster control APIs, stop its own operator, or reset its saved test plan. Keep the active repair conversation and completed full-test evidence. Diagnose the baseline rejection from the saved reports and repair it; use managed RUN delta after a completed full gate. Return a corrected preparation command or COMPLETE APPLICATION ZIP without operator-control requests.'),{code:'POWERSHELL_COMMAND_FAILED'});
  }
  if(/\bnpm(?:\.cmd)?\s+run\s+test:(?:play-store(?:\b|:)|playwright\b)/i.test(String(script))){
    throw Object.assign(new Error('Release-gate tests must run through Yardmaster so its emulator runtime, process ownership and long browser deadlines remain active. Return any local preparation as POWERSHELL without npm test commands, then put RUN full (or RUN delta for a completed full gate) outside POWERSHELL in the YARDMASTER block. Do not repeat completed local preparation.'),{code:'POWERSHELL_COMMAND_FAILED'});
  }
}

export function assertManagedRepairProtocol(source){
  const text=String(source||'');
  const blocks=[...text.matchAll(/(?:^|\n)POWERSHELL\s*\r?\n([\s\S]*?)\r?\nEND_POWERSHELL(?=\r?\n|$)/gi)];
  // Validate the entire response before any local preparation can run.
  for(const block of blocks)assertManagedGateCommand(block[1]);
  const commands=text.replace(/(?:^|\n)POWERSHELL\s*\r?\n[\s\S]*?\r?\nEND_POWERSHELL(?=\r?\n|$)/gi,'\n');
  if(/^\s*STOP\s*$/mi.test(commands))throw Object.assign(new Error('ChatGPT repair instructions cannot stop Yardmaster. Stop is reserved for the human operator. Preserve the saved repair conversation and full-test evidence; return corrected repair instructions without STOP.'),{code:'POWERSHELL_COMMAND_FAILED'});
}
