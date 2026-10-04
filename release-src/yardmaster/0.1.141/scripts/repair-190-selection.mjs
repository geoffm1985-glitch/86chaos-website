export const repairedTitles=[
  'Intelligence view renders workflow timeline, factual health, preflight, resources, evidence and required controls',
  'reproduction capsule, snapshot and manifest actions stay inside isolated Yardmaster fixture data',
  'intelligence notes, safe mode, profiles, worktrees and trusted devices send structured payloads'
];
export const repairProjects=['desktop-and-regressions','mobile-android'];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const repairGrep='@repair190|'+repairedTitles.map(title=>escape(title)+'$').join('|');
