export const COVERED_ACTIONS=[
  'adopt-running-test','approve-repair','consume-chatgpt-command','full-self-test','new-implementation',
  'open-chatgpt','pause','push','reject-repair','remote-start','remote-stop','resume','resume-handoff',
  'resume-self-heal','revoke-device','save-self-test-diagnostic','self-heal-now','shutdown-operator',
  'start','stop','update-operator-now','verify-deployment'
].sort();

export const COVERED_API_ROUTES=[
  '/api/action','/api/command','/api/config','/api/devices','/api/handoff-diagnostic','/api/pair',
  '/api/passkey/auth/options','/api/passkey/auth/verify','/api/passkey/register/options',
  '/api/passkey/register/verify','/api/push/key','/api/push/subscribe','/api/push/test',
  '/api/remote/health','/api/self-test-diagnostic','/api/status'
].sort();

export const COVERED_UI_ACTIONS=[
  'adopt-running-test','full-self-test','open-chatgpt','pause','push','remote-start','resume',
  'resume-handoff','resume-self-heal','self-heal-now','start','stop','update-operator-now'
].sort();

export const COVERED_CONFIG_KEYS=[
  'autoHandoff','autoPush','autoSelfHeal','autoUpdateOperator','branch','chatMode','maxRepairAttempts',
  'maxSelfHealAttempts','model','repoUpdateMode','repositoryPath','runAfterDeploy','testType',
  'testingUrl','thinkingEffort','vercelProject','waitForDeploy'
].sort();

export const ACTION_COVERAGE={
  'adopt-running-test':'manual release-gate adoption fixture',
  'approve-repair':'stubbed safe repair approval',
  'consume-chatgpt-command':'stubbed command-bridge activation',
  'full-self-test':'isolated full-self-test stub and status rendering',
  'new-implementation':'New Work validation and queueing',
  'open-chatgpt':'manual-open stub with state verification',
  'pause':'run lifecycle',
  'push':'local bare Git remote only',
  'reject-repair':'pending repair rejection',
  'remote-start':'fake Cloudflare tunnel and pairing',
  'remote-stop':'fake Cloudflare tunnel shutdown',
  'resume':'run lifecycle',
  'resume-handoff':'failed-handoff recovery stub',
  'resume-self-heal':'queued self-heal resume stub',
  'revoke-device':'trusted-device revocation',
  'save-self-test-diagnostic':'isolated temp Downloads target',
  'self-heal-now':'self-heal diagnostic queue',
  'shutdown-operator':'explicit clean shutdown',
  'start':'run lifecycle',
  'stop':'run lifecycle',
  'update-operator-now':'verified release/update stub',
  'verify-deployment':'local build-identity server'
};

export const SELF_HEAL_UI_COVERAGE={
  reason:'selfHealReason',phase:'selfHealPhase',currentAction:'selfHealDoing',waitingOn:'selfHealWaiting',attempt:'selfHealAttempt',candidateVersion:'selfHealCandidate',testingStage:'selfHealTesting',lastSuccessfulStep:'selfHealLastStep',nextAction:'selfHealNext',resumeCheckpoint:'selfHealResume'
};

export const COVERED_SELF_HEAL_STATES=['idle','queued','chatgpt','waiting-login','certifying','testing','preparing-update','update-stubbed','soaking','complete','failed'];
