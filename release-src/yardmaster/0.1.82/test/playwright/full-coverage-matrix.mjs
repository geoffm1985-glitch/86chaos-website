export const COVERED_ACTIONS=[
  'add-run-note','adopt-running-test','apply-profile','approve-repair','bookmark-run','consume-chatgpt-command',
  'create-repro-capsule','create-snapshot','create-worktree','delete-profile','dry-run-plan','export-build-manifest',
  'full-self-test','new-implementation','open-chatgpt','pause','push','reject-repair','remote-start','remote-stop',
  'remove-worktree','restore-last-snapshot','resume','resume-handoff','resume-self-heal','revoke-device','run-preflight','save-profile',
  'save-self-test-diagnostic','self-heal-now','set-safe-mode','shutdown-operator','start','stop','toggle-live-screenshot',
  'update-operator-now','verify-deployment'
].sort();

export const COVERED_API_ROUTES=[
  '/api/action','/api/command','/api/config','/api/devices','/api/evidence','/api/handoff-diagnostic','/api/intelligence',
  '/api/operator-screenshot','/api/pair','/api/passkey/auth/options','/api/passkey/auth/verify','/api/passkey/register/options',
  '/api/passkey/register/verify','/api/push/key','/api/push/subscribe','/api/push/test','/api/remote/health',
  '/api/self-test-diagnostic','/api/status'
].sort();

export const COVERED_UI_ACTIONS=[
  'adopt-running-test','create-repro-capsule','create-snapshot','export-build-manifest','full-self-test','open-chatgpt',
  'pause','push','remote-start','restore-last-snapshot','resume','resume-handoff','resume-self-heal','run-preflight','self-heal-now','start','stop',
  'toggle-live-screenshot','update-operator-now'
].sort();

export const COVERED_CONFIG_KEYS=[
  'autoHandoff','autoPush','autoSelfHeal','autoUpdateOperator','branch','chatMode','dryRunMode','githubActionsMinuteLimit',
  'hangThresholdMs','maxRepairAttempts','maxSelfHealAttempts','mobileLiveScreenshot','model','repoUpdateMode','repositoryPath',
  'runAfterDeploy','testType','testingUrl','thinkingEffort','vercelBuildLimit','vercelProject','waitForDeploy'
].sort();

export const ACTION_COVERAGE={
  'add-run-note':'isolated run annotation fixture','adopt-running-test':'manual release-gate adoption fixture','apply-profile':'local profile fixture',
  'approve-repair':'stubbed safe repair approval','bookmark-run':'isolated run bookmark fixture','consume-chatgpt-command':'stubbed command-bridge activation',
  'create-repro-capsule':'isolated reproduction ZIP fixture','create-snapshot':'isolated Git snapshot fixture','create-worktree':'temporary Git worktree fixture',
  'delete-profile':'local profile fixture','dry-run-plan':'no-side-effect workflow plan fixture','export-build-manifest':'local SHA-256 manifest fixture',
  'full-self-test':'isolated full-self-test stub and status rendering','new-implementation':'New Work validation and queueing','open-chatgpt':'manual-open stub with state verification',
  'pause':'run lifecycle','push':'local bare Git remote only','reject-repair':'pending repair rejection','remote-start':'fake Cloudflare tunnel and pairing',
  'remote-stop':'fake Cloudflare tunnel shutdown','remove-worktree':'temporary Git worktree fixture','restore-last-snapshot':'protected pre-repair snapshot restore fixture','resume':'run lifecycle','resume-handoff':'failed-handoff recovery stub',
  'resume-self-heal':'queued self-heal resume stub','revoke-device':'trusted-device revocation','run-preflight':'isolated local repository doctor','save-profile':'local profile fixture',
  'save-self-test-diagnostic':'isolated temp Downloads target','self-heal-now':'self-heal diagnostic queue','set-safe-mode':'local safe-mode marker fixture',
  'shutdown-operator':'explicit clean shutdown','start':'run lifecycle','stop':'run lifecycle','toggle-live-screenshot':'Yardmaster-only screenshot opt-in fixture',
  'update-operator-now':'verified release/update stub','verify-deployment':'local build-identity server'
};

export const SELF_HEAL_UI_COVERAGE={reason:'selfHealReason',phase:'selfHealPhase',currentAction:'selfHealDoing',waitingOn:'selfHealWaiting',attempt:'selfHealAttempt',candidateVersion:'selfHealCandidate',testingStage:'selfHealTesting',lastSuccessfulStep:'selfHealLastStep',nextAction:'selfHealNext',resumeCheckpoint:'selfHealResume'};
export const INTELLIGENCE_UI_COVERAGE=['intelTimeline','intelHealth','intelPreflight','intelResources','intelEvidence','intelFailureMemory','intelSmartTests','intelFlakes','intelProvenance','intelChanges','intelCost','intelSelfHealAttempts','intelAnnotations','intelProfiles','intelWorktrees','intelAudit','intelScreenshot'];
export const COVERED_SELF_HEAL_STATES=['idle','queued','chatgpt','waiting-login','certifying','testing','preparing-update','update-stubbed','soaking','complete','failed'];
