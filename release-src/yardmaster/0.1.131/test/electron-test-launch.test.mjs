import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {electronTestEnvironment, launchElectronDockTest, ELECTRON_LAUNCH_TIMEOUT_MS, ELECTRON_TEST_TIMEOUT_MS} from '../scripts/electron-test-launch.mjs';

function runtime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-test-launch-'));
  const pkg = path.join(root, 'node_modules', 'electron');
  fs.mkdirSync(path.join(pkg, 'dist'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"electron","main":"index.cjs"}');
  fs.writeFileSync(path.join(pkg, 'index.cjs'), 'throw new Error("must not start lazy installation");');
  fs.writeFileSync(path.join(pkg, 'path.txt'), 'electron.exe');
  fs.writeFileSync(path.join(pkg, 'dist', 'electron.exe'), 'fixture binary');
  return {root, cleanup: () => fs.rmSync(root, {recursive: true, force: true})};
}

test('Windows startup keeps stderr pipes and removes inherited Electron/Node startup overrides without changing the parent environment', () => {
  const source = {Path: 'fixture-path', LOCALAPPDATA: 'fixture-data', Electron_Run_As_Node: '1', NODE_OPTIONS: '--inspect=9229', Electron_Log_File: 'redirect.log', Electron_No_Attach_Console: '0', ELECTRON_ENABLE_LOGGING: 'file', CUSTOM_SETTING: 'keep'};
  const before = {...source};
  assert.deepEqual(electronTestEnvironment(source, 'win32'), {Path: 'fixture-path', LOCALAPPDATA: 'fixture-data', CUSTOM_SETTING: 'keep', ELECTRON_NO_ATTACH_CONSOLE: '1', ELECTRON_ENABLE_LOGGING: '1'});
  assert.deepEqual(source, before);
});

test('other platforms remove startup overrides without adding Windows console flags', () => {
  assert.deepEqual(electronTestEnvironment({HOME: '/fixture', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require=x', ELECTRON_LOG_FILE: 'x'}, 'linux'), {HOME: '/fixture'});
});

test('actual launch wrapper supplies a bounded startup budget, isolated fixture path and original Playwright loader path', async () => {
  const f = runtime(); let calls = 0;
  try {
    const app = {fixture: true};
    const result = await launchElectronDockTest({root: f.root, temp: 'isolated-data', platform: 'win32', env: {Path: 'keep', ELECTRON_RUN_AS_NODE: '1'}, log: () => {}, launcher: async options => {
      calls++;
      assert.equal(options.timeout, 60000);
      assert.equal(options.cwd, f.root);
      assert.deepEqual(options.args, [path.join(f.root, 'test/fixtures/dock-bridge/main.cjs')]);
      assert.equal(options.env.YM_FIXTURE_DIR, 'isolated-data');
      assert.equal(options.env.ELECTRON_NO_ATTACH_CONSOLE, '1');
      assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
      assert.equal(options.executablePath, undefined);
      return app;
    }});
    assert.equal(result, app); assert.equal(calls, 1);
    assert.equal(ELECTRON_LAUNCH_TIMEOUT_MS, 60000);
    assert.equal(ELECTRON_TEST_TIMEOUT_MS, 100000);
    assert.ok(ELECTRON_TEST_TIMEOUT_MS > ELECTRON_LAUNCH_TIMEOUT_MS + 20000 + 12000);
  } finally {f.cleanup()}
});

test('startup errors fail once with original launch details instead of retrying or skipping handoff assertions', async () => {
  const f = runtime(), cause = new Error('electron.launch: Timeout 60000ms exceeded\n<launched> pid=123'); let calls = 0;
  try {
    await assert.rejects(launchElectronDockTest({root: f.root, temp: 'data', env: {}, log: () => {}, launcher: async () => {calls++; throw cause}}), error => {
      assert.equal(error.cause, cause); assert.match(error.message, /before any handoff assertions/); assert.match(error.message, /pid=123/); return true;
    });
    assert.equal(calls, 1);
  } finally {f.cleanup()}
});

test('missing prepared binary stops before the native launch', async () => {
  const f = runtime(); let calls = 0;
  try {
    fs.rmSync(path.join(f.root, 'node_modules/electron/dist/electron.exe'));
    await assert.rejects(launchElectronDockTest({root: f.root, temp: 'data', log: () => {}, launcher: async () => {calls++}}), /runtime is missing/);
    assert.equal(calls, 0);
  } finally {f.cleanup()}
});
