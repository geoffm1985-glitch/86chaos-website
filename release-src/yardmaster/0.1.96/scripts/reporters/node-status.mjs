import {inspect,stripVTControlCharacters} from 'node:util';

export default async function* nodeStatus(source){
  for await (const {type,data} of source){
    if(type==='test:dequeue')yield `[RUNNING] NODE: ${data.name}\n`;
    if(type==='test:pass'||type==='test:fail'){
      const label=data.skip?'SKIP':data.todo?'TODO':type==='test:pass'?'PASS':'FAIL';
      yield `[${label}] NODE: ${data.name} (${Math.round(data.details?.duration_ms||0)} ms)\n`;
      if(label==='FAIL'){
        yield `  ${data.file||''}:${data.line||''}\n`;
        yield stripVTControlCharacters(inspect(data.details?.error?.cause||data.details?.error,{colors:false,depth:5}))+'\n';
      }
    }
    if(type==='test:stdout'||type==='test:stderr')yield stripVTControlCharacters(String(data.message||''));
    if(type==='test:diagnostic')yield `[INFO] NODE: ${stripVTControlCharacters(String(data.message||''))}\n`;
    if(type==='test:summary'&&!data.file){
      const c=data.counts;
      yield `\n[SUMMARY] NODE: tests ${c.tests} | pass ${c.passed} | fail ${c.failed} | skipped ${c.skipped} | cancelled ${c.cancelled} | todo ${c.todo}\n`;
      yield `[${data.success?'PASS':'FAIL'}] NODE TESTS (${(data.duration_ms/1000).toFixed(1)} seconds)\n\n`;
    }
  }
}
