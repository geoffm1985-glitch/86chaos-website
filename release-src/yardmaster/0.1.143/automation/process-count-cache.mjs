// Process enumeration is optional dashboard information. It must never block
// emulator readiness, phone authentication, or test-process output callbacks.
export function createProcessCountCache({collect,clock=Date.now,ttlMs=10000}){
  let value=null,updatedAt=null,attemptedAt=null,pending=null;
  return {get(){
    if(!pending&&(attemptedAt===null||clock()-attemptedAt>=ttlMs)){
      attemptedAt=clock();
      pending=Promise.resolve().then(collect).then(next=>{
        if(Number.isFinite(next)){value=next;updatedAt=clock()}
      }).catch(()=>{}).finally(()=>{pending=null});
    }
    return {value,updatedAt,pending:!!pending};
  }};
}
