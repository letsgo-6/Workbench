import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(script, extra = {}) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, ...extra },
  });
  const [code] = await once(child, 'exit');
  return code ?? 1;
}
for (const [original, saved] of [
  ['native-smoke.json', 'batch1-native-smoke.json'],
  ['lifecycle.json', 'batch1-lifecycle.json'],
]) {
  const target = path.join(root, 'docs/evidence', saved);
  if (!fs.existsSync(target))
    fs.copyFileSync(path.join(root, 'docs/evidence', original), target);
}
const lifecycleExit = await run('scripts/native-lifecycle.mjs', {
  WORKBENCH_LIFECYCLE_NAME: 'batch2-lifecycle',
});
let app,
  smokeExit = 1;
try {
  app = spawn(path.join(root, 'src-tauri/target/release/workbench.exe'), [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9227',
    },
  });
  for (let n = 0; n < 200; n++) {
    try {
      if ((await fetch('http://127.0.0.1:9227/json/version')).ok) break;
    } catch {}
    await pause(30);
  }
  smokeExit = await run('scripts/native-smoke.mjs', {
    WORKBENCH_CDP: 'http://127.0.0.1:9227',
  });
} finally {
  if (app && app.exitCode === null) {
    const ended = once(app, 'exit');
    app.kill();
    await ended;
  }
}
fs.writeFileSync(
  path.join(root, 'docs/evidence/batch2-regression.json'),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      lifecycleExit,
      smokeExit,
      note: 'Lifecycle keeps the original 2000ms acceptance threshold; native smoke reuses the batch-one checklist.',
    },
    null,
    2,
  ),
);
process.exitCode = lifecycleExit || smokeExit;
