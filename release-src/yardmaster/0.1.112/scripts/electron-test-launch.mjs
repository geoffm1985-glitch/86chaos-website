import path from 'node:path';
import {preparedElectronExecutable} from './electron-test-runtime.mjs';

export const ELECTRON_LAUNCH_TIMEOUT_MS = 60000;
export const ELECTRON_TEST_TIMEOUT_MS = 100000;

export function electronTestEnvironment(source, platform = process.platform) {
  const env = {...source};
  // Playwright reads the inspector and DevTools endpoints from stderr. An
  // inherited Node mode or log-file redirect can prevent that handshake.
  for (const key of Object.keys(env)) {
    if (['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_LOG_FILE'].includes(key.toUpperCase())) delete env[key];
    if (platform === 'win32' && ['ELECTRON_NO_ATTACH_CONSOLE', 'ELECTRON_ENABLE_LOGGING'].includes(key.toUpperCase())) delete env[key];
  }
  if (platform === 'win32') {
    // Keep the pipes Playwright created instead of attaching the PowerShell
    // console, which can consume Electron's startup endpoint messages.
    env.ELECTRON_NO_ATTACH_CONSOLE = '1';
    env.ELECTRON_ENABLE_LOGGING = '1';
  }
  return env;
}

export async function launchElectronDockTest({root, temp, launcher, env = process.env, platform = process.platform, log = console.log}) {
  preparedElectronExecutable(root);
  log('[RUNNING] Starting Electron dock test (startup limit: 60 seconds)...');
  try {
    // Keep Playwright's injected loader. Supplying executablePath bypasses it.
    return await launcher({
      args: [path.join(root, 'test/fixtures/dock-bridge/main.cjs')],
      cwd: root,
      env: {...electronTestEnvironment(env, platform), YM_FIXTURE_DIR: temp},
      timeout: ELECTRON_LAUNCH_TIMEOUT_MS
    });
  } catch (cause) {
    throw new Error('Electron dock test failed during startup, before any handoff assertions. ' + (cause?.message || String(cause)), {cause});
  }
}
