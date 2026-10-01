// Exact failed titles from the supplied 0.1.88 Windows handoff. Four worker
// failures share two titles across Android/iPhone layout profiles.
export const failedTitles=[
  'self-heal cards and controls stay accessible on mobile',
  'dashboard views, panel-scoped controls, status cards, and mobile-width layout render',
  'full sandbox self-test renders every stage and diagnostic download/save functions succeed',
  'Intelligence view renders workflow timeline, factual health, preflight, resources, evidence and required controls',
  'reproduction capsule, snapshot and manifest actions stay inside isolated Yardmaster fixture data',
  'ChatGPT view provides the embedded workspace surface without requiring a popup browser in dashboard UI',
  'notifications worker activates and controls /yardmaster',
  'notifications worker activates and controls /yardmaster/',
  'start, pause, resume, and stop controls act on the isolated operator only'
];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const mobileFailedGrep='@mobile|'+failedTitles.map(title=>escape(title)+'$').join('|');
export const mobileNodeFiles=['test/mobile-pwa.test.mjs','test/mobile-regressions.test.mjs'];
