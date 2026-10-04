// The 86 Chaos browser reporter uses an ASCII table rather than Yardmaster's
// NODE/PLAYWRIGHT prefix. Its counters replace the preceding setup counters.
export function releaseGateProgress(line){
  const selected=String(line).match(/^TOTAL SELECTED:\s*(\d+)\s*$/);
  if(selected)return {total:Number(selected[1]),counts:{pass:0,fail:0,timeout:0,skip:0},currentTest:'Preparing selected Playwright cases',progress:0};
  const match=String(line).match(/^\[(PASS|FAIL|TIMEOUT|SKIP|RUNNING)\]\s+(\d+)\s*\/\s*(\d+)\s+([^|]+)\s*\|\s*(.+)/);
  if(!match)return null;
  const [,kind,index,total,project,rest]=match,fields=rest.split(/\s+\|\s+/),counter=fields.find(x=>x.startsWith('running:'));
  const counts=counter&&Object.fromEntries(['pass','fail','timeout','skip'].map(key=>[key,Number(counter.match(new RegExp('(\\d+)\\s+'+key+'\\b'))?.[1]||0)]));
  const name=fields.filter(x=>!x.startsWith('running:')&&!/^\d+(?:ms|(?:m|s)(?:\s|$))/.test(x)).join(' | ');
  return {total:Number(total),...(counts?{counts}:{}),currentTest:project.trim()+' | '+name,progress:Math.min(99,Math.round((Number(index)-(kind==='RUNNING'?1:0))/Number(total)*100))};
}
