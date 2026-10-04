export function interruptedRunAction({run,workflow,paused=false,owned=false,adoptable=false}={}){
  if(owned||paused||run?.state!=='running'||workflow?.state!=='testing'||!workflow.closedLoop)return 'none';
  if(adoptable)return 'adopt';
  return Number(workflow.operatorRecoveryAttempts||0)>=3?'blocked':'resume';
}
