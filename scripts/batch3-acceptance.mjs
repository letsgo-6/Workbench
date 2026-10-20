import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { sandbox } from './native-test-sandbox.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const isolated = sandbox();
const results = {
  timestamp: new Date().toISOString(),
  testData: isolated.data,
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(script, env = {}) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, ...env, WORKBENCH_TEST_DIR: isolated.dir },
  });
  const [code] = await once(child, 'exit');
  return code ?? 1;
}
let smokeApp;
try {
  results.lifecycle = await run('scripts/native-lifecycle.mjs', {
    WORKBENCH_LIFECYCLE_NAME: 'batch3-lifecycle',
  });
  results.batch3 = await run('scripts/batch3-native.mjs');
  smokeApp = spawn(
    path.join(root, 'src-tauri/target/release/workbench.exe'),
    [],
    {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9227',
      },
    },
  );
  for (let n = 0; n < 300; n++) {
    try {
      if ((await fetch('http://127.0.0.1:9227/json/version')).ok) break;
    } catch {}
    await pause(30);
  }
  results.batch1 = await run('scripts/native-smoke.mjs', {
    WORKBENCH_CDP: 'http://127.0.0.1:9227',
    WORKBENCH_SMOKE_DIR: 'batch3-batch1',
  });
  if (smokeApp.exitCode === null) {
    const ended = once(smokeApp, 'exit');
    smokeApp.kill();
    await ended;
  }
  smokeApp = null;
  results.batch2 = await run('scripts/batch2-native.mjs', {
    WORKBENCH_BATCH2_REPORT: 'batch3-batch2',
  });
  await pause(400);
} finally {
  if (smokeApp && smokeApp.exitCode === null) {
    const ended = once(smokeApp, 'exit');
    smokeApp.kill();
    await ended;
  }
  isolated.restore();
  results.bootstrapRestored = true;
  fs.writeFileSync(
    path.join(root, 'docs/evidence/batch3-acceptance.json'),
    JSON.stringify(results, null, 2),
  );
}
process.exitCode = Object.values(results).some(
  (value) => typeof value === 'number' && value !== 0,
)
  ? 1
  : 0;
