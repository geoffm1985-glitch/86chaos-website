import bridge from '../../../automation/chatgpt-dock-bridge.cjs';
const cdp=new bridge.DockCdp();
try{await cdp.connect();const result=await cdp.eval('account');process.send({transportResult:result})}catch(error){process.send({transportError:String(error.message)})}finally{cdp.close();process.disconnect()}
