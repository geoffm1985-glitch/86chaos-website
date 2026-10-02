import {parentPort,workerData} from 'node:worker_threads';
import {createRepositorySnapshot} from './ops-intelligence.mjs';
parentPort.postMessage(createRepositorySnapshot(workerData.dataDir,workerData.options));
