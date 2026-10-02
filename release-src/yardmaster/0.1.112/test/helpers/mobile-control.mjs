// Renders can replace a dynamic row between resolution and evaluate(). Retry
// the section lookup instead of clicking a control in an inactive section.
export async function findControlSection(locator,{timeoutMs=6000,pollMs=25}={}){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
    const section=await locator.evaluate(el=>el.closest('[data-mobile-section]')?.dataset.mobileSection);
    if(section)return section;
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw new Error('Mobile control has no attached section.');
}
