export const TEST_TYPES=['delta','targeted','full','full-then-delta'];

export function plannedTestType(configured,workflow){
  const plan=workflow?.closedLoop&&workflow.testPlan?workflow.testPlan:configured;
  if(plan==='full-then-delta')return workflow?.fullFirstComplete?'delta':'full';
  return ['delta','targeted','full'].includes(plan)?plan:'delta';
}

export function completeFirstFull(workflow,run){
  if(workflow?.testPlan!=='full-then-delta'||run?.testType!=='full')return false;
  // A paused/interrupted process is resumed as full until it actually finishes.
  workflow.fullFirstComplete=true;
  return true;
}
