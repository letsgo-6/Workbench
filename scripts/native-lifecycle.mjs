import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const loadPackage = createRequire(import.meta.url);
const { chromium } = loadPackage(
  process.env.WORKBENCH_PLAYWRIGHT_PATH || 'playwright',
);
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = path.join(
  root,
  `docs/evidence/${process.env.WORKBENCH_LIFECYCLE_NAME || 'lifecycle'}.json`,
);
const marker = `持久化验收${Date.now()}`;
let processHandle, browser, page, persistentId;
const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForState(predicate, arg) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, arg)) return;
    await delay(50);
  }
  throw new Error('Timed out waiting for persisted state');
}
async function start() {
  const started = performance.now();
  const launchUnixMs = Date.now();
  const tracePath = path.join(
    root,
    `docs/evidence/${process.env.WORKBENCH_LIFECYCLE_NAME || 'startup'}-trace.txt`,
  );
  fs.writeFileSync(tracePath, '');
  processHandle = spawn(
    path.join(root, 'src-tauri/target/release/workbench.exe'),
    [],
    {
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9225',
        WORKBENCH_STARTUP_TRACE: tracePath,
      },
    },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:9225/json/version');
      if (response.ok) break;
    } catch {
      /* The new process has not opened its port yet. */
    }
    await delay(30);
  }
  const cdpReadyMs = Math.round(performance.now() - started);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
  const attachedMs = Math.round(performance.now() - started);
  page = browser
    .contexts()[0]
    .pages()
    .find((p) => !p.url().includes('quick.html'));
  assert(page);
  page.setDefaultTimeout(15000);
  await page.getByRole('textbox', { name: '快速输入' }).waitFor();
  const elapsedMs = Math.round(performance.now() - started);
  results.push({
    check: 'release 进程启动到今日输入可交互',
    elapsedMs,
    cdpReadyMs,
    attachedMs,
    startupMilestones: fs
      .readFileSync(tracePath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [pid, unixMs, stage] = line.split('|');
        return {
          pid: Number(pid),
          stage,
          elapsedMs: Number(unixMs) - launchUnixMs,
        };
      }),
    navigation: await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      domReady:
        performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
      now: performance.now(),
    })),
    thresholdMs: 2000,
    status: elapsedMs < 2000 ? 'passed' : 'failed',
  });
}
async function stop() {
  if (browser) {
    await browser.close();
    browser = undefined;
  }
  if (processHandle && processHandle.exitCode === null) {
    const exited = once(processHandle, 'exit');
    processHandle.kill();
    await exited;
  }
  processHandle = undefined;
  await delay(150);
}
const invoke = (command, input) =>
  page.evaluate(
    ({ command, input }) =>
      window.__TAURI_INTERNALS__.invoke(
        command,
        input === undefined ? {} : { input },
      ),
    { command, input },
  );
try {
  await start();
  const item = await invoke('idea_create', { contentMd: marker, tags: [] });
  persistentId = item.id;
  await page.evaluate((id) => {
    location.hash = `/ideas/${id}`;
  }, item.id);
  await page.locator('.cm-content').waitFor();
  await page.locator('.cm-content').fill(`${marker} 编辑后已保存`);
  await waitForState(
    async (id) =>
      (
        await window.__TAURI_INTERNALS__.invoke('idea_get', { input: { id } })
      ).contentMd.endsWith('编辑后已保存'),
    item.id,
  );
  await stop();
  await start();
  assert.equal(
    (await invoke('idea_get', { id: persistentId })).contentMd,
    `${marker} 编辑后已保存`,
  );
  results.push({
    check: '自动保存后强制结束进程，重启读取真实 SQLite',
    status: 'passed',
  });
  await browser.contexts()[0].setOffline(true);
  const date = new Date().toLocaleDateString('en-CA');
  for (const entityType of ['idea', 'todo', 'tip', 'skill', 'prompt']) {
    const input = {
      title: marker,
      name: marker,
      contentMd: marker,
      body: marker,
      date,
      priority: 2,
      tags: [marker],
    };
    const entry = await invoke(`${entityType}_create`, input);
    try {
      const updated = await invoke(`${entityType}_update`, {
        ...entry,
        contentMd: `${marker} 更新`,
        body: `${marker} 更新`,
        tags: [marker],
      });
      assert.equal(updated.id, entry.id);
      await invoke(`${entityType}_set_starred`, {
        id: entry.id,
        starred: true,
      });
      assert((await invoke(`${entityType}_get`, { id: entry.id })).isStarred);
      await invoke(`${entityType}_delete`, { id: entry.id });
      assert(
        (await invoke('trash_list')).some((item) => item.ref.id === entry.id),
      );
      await invoke('trash_restore', { entityType, id: entry.id });
      assert.equal(
        (await invoke(`${entityType}_get`, { id: entry.id })).id,
        entry.id,
      );
    } finally {
      await invoke('trash_purge', { entityType, id: entry.id });
    }
  }
  const found = await invoke('search_query', { q: marker });
  assert(found.some((item) => item.id === persistentId));
  await invoke('dashboard_get');
  await browser.contexts()[0].setOffline(false);
  results.push({
    check:
      'WebView 网络离线时五模块 CRUD、星标、标签、回收站、搜索及今日页 IPC 可用',
    status: 'passed',
  });
  await invoke('trash_purge', { entityType: 'idea', id: persistentId });
  persistentId = undefined;
  for (const tag of (await invoke('tag_list')).filter(
    (tag) => tag.name === marker,
  ))
    await invoke('tag_delete', { id: tag.id });
  fs.writeFileSync(
    evidence,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        results,
        note: '本机 release 进程启动测量，包含 CDP 连接开销；未清空操作系统文件缓存。离线检查为 WebView 网络仿真。',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  assert(
    results.every((result) => result.status === 'passed'),
    'One or more startup measurements exceeded 2000ms',
  );
} catch (error) {
  fs.writeFileSync(
    evidence,
    JSON.stringify({ results, error: String(error) }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  if (page && persistentId)
    await invoke('trash_purge', { entityType: 'idea', id: persistentId }).catch(
      () => {},
    );
  if (page) {
    const tags = await invoke('tag_list').catch(() => []);
    for (const tag of tags.filter((tag) => tag.name === marker))
      await invoke('tag_delete', { id: tag.id }).catch(() => {});
  }
  await stop();
}
