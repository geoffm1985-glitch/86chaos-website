import fs from 'node:fs';
export const currentVersion=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
export const nextVersion=currentVersion.replace(/\d+$/,n=>String(Number(n)+1));
