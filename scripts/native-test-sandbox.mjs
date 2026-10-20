import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// Native tests share the application's normal bootstrap resolution, while owning all test data.
export function sandbox() {
  const active = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '@(Get-Process -Name workbench -ErrorAction SilentlyContinue).Count',
    ],
    { windowsHide: true, encoding: 'utf8' },
  ).trim();
  if (active !== '0')
    throw Error('Close Workbench before native acceptance testing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-batch3-'));
  const config = path.join(process.env.APPDATA, 'com.workbench.app');
  fs.mkdirSync(config, { recursive: true });
  const bootstrap = path.join(config, 'bootstrap.json');
  const original = fs.existsSync(bootstrap) ? fs.readFileSync(bootstrap) : null;
  if (original)
    fs.writeFileSync(path.join(dir, 'original-bootstrap.json'), original);
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(
    path.join(config, 'bootstrap.test.json'),
    JSON.stringify({ dataDir: data }),
  );
  fs.renameSync(path.join(config, 'bootstrap.test.json'), bootstrap);
  return {
    dir,
    data,
    restore() {
      const current = JSON.parse(fs.readFileSync(bootstrap, 'utf8'));
      if (path.resolve(current.dataDir) !== path.resolve(data))
        throw Error(
          'Unexpected bootstrap change; original bootstrap preserved in sandbox for recovery',
        );
      if (original) {
        fs.writeFileSync(path.join(config, 'bootstrap.test.json'), original);
        fs.renameSync(path.join(config, 'bootstrap.test.json'), bootstrap);
      } else fs.unlinkSync(bootstrap);
      // Retain the test-owned temporary directory until the report is inspected.
    },
  };
}
