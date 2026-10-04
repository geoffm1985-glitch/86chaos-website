import {parentPort,workerData} from 'node:worker_threads';
import {preflightDoctor} from './ops-intelligence.mjs';
try{parentPort.postMessage({result:preflightDoctor(workerData)})}
catch(error){parentPort.postMessage({error:error.message})}
