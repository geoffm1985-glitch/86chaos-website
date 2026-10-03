import fs from 'node:fs';

// Windows may still hold fixture files after kill() returns. Await close before
// removing them; retry only the filesystem's transient lock errors.
export async function stopFixture({child,temp,shutdown,graceMs=8000,killMs=5000,remove=(...args)=>fs.promises.rm(...args)}={}){
  let closed=Boolean(child.yardmasterFixtureClosed);
  const onClose=()=>{closed=true};child.once('close',onClose);
  const waitClosed=ms=>new Promise(resolve=>{
    if(closed){resolve(true);return}
    const timer=setTimeout(()=>{child.removeListener('close',done);resolve(closed)},ms);
    function done(){clearTimeout(timer);resolve(true)}child.once('close',done);
  });
  try{
    try{await shutdown()}catch{}
    if(!await waitClosed(graceMs)){
      child.kill('SIGKILL');
      if(!await waitClosed(killMs))throw new Error('Fixture process did not close; temporary files were retained.');
    }
    await remove(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }finally{child.removeListener('close',onClose)}
}
