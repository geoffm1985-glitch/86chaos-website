import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

// Exercise the actual private helpers without requiring a Windows clipboard.
export function captureClipboardScripts(){
  const scripts=[];
  const source=fs.readFileSync(new URL('../../automation/windows-operator.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  vm.runInNewContext(source+"\nclipboardText();setClipboardFromFile(\"C:\\\\temp\\\\chef's clipboard.txt\");clearClipboard();",{
    process:{platform:'win32'},
    execFileSync:(file,args)=>{scripts.push({file,args,script:args.at(-1)});return 'previous clipboard';}
  });
  return scripts;
}

export function parseClipboardScripts(shell='powershell.exe'){
  for(const {script} of captureClipboardScripts()){
    const encoded=Buffer.from(script,'utf8').toString('base64');
    const parser=`$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|Out-String|Write-Output;exit 1}`;
    execFileSync(shell,['-NoProfile','-Command',parser],{encoding:'utf8',windowsHide:true,timeout:15000});
  }
}
