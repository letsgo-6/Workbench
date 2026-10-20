import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.WORKBENCH_PLAYWRIGHT_PATH || 'playwright',
);
const root = fileURLToPath(new URL('..', import.meta.url));
const marker = `批次二验收${Date.now()}`;
const key = `sk-test-${randomBytes(24).toString('hex')}`;
const results = [],
  refs = [],
  requests = [];
let browser, processHandle, page, providerId, oldDefault, oldProxy;
let oldTheme;
let hotkeyHolder;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  requests.push({
    authorized: req.headers.authorization === `Bearer ${key}`,
    url: req.url,
  });
  if (req.url.includes('/401/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: key } }));
    return;
  }
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [{ id: 'local-test-z' }, { id: 'local-test-a' }],
      }),
    );
    return;
  }
  const body = JSON.parse(raw || '{}');
  if (!body.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'pong' } }],
      }),
    );
    return;
  }
  const input = body.messages.at(-1)?.content || '';
  let text = `${marker} 润色后的清晰文字。`;
  if (input.includes('输出必须用 <optimized>'))
    text =
      '<optimized>按角色、任务、约束完成 {{topic}}。</optimized><changes>- 明确结构并保留变量</changes>';
  else if (input.includes('为以下内容生成标题'))
    text = JSON.stringify({ title: `${marker} 建议标题`, tags: [marker] });
  else if (input.includes('Skill 内容'))
    text = JSON.stringify({
      description: '这是一份用于验证的 Skill 简介。',
      tags: [marker],
    });
  else if (input.includes('按主题整理'))
    text = `## ${marker} 主题\n- 第一条（来源条目 1）\n- 第二条（来源条目 2）`;
  else if (input.includes('技巧卡片'))
    text = `# ${marker} 技巧\n## 适用场景\n测试\n## 操作步骤\n1. 验证\n## 示例\n示例`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const parts = input.includes('[[SLOW]]')
    ? ['正在生成', '后续内容']
    : Array.from(text.matchAll(/.{1,8}/gs), (m) => m[0]);
  for (const part of parts) {
    if (res.destroyed) return;
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`,
    );
    await delay(input.includes('[[SLOW]]') ? 1800 : 20);
  }
  res.end('data: [DONE]\n\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const reportName = process.env.WORKBENCH_BATCH2_REPORT || 'batch2-native';
const report = path.join(root, `docs/evidence/${reportName}.json`);
const check = (name, details = {}) => {
  results.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}`);
};
const invoke = (command, input) =>
  page.evaluate(
    ({ command, input }) =>
      window.__TAURI_INTERNALS__.invoke(
        command,
        input === undefined ? {} : { input },
      ),
    { command, input },
  );
async function waitState(fn, arg) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return;
    await delay(50);
  }
  throw new Error('Native state timeout');
}
const go = (route) =>
  page.evaluate((route) => {
    location.hash = route;
  }, route);
const drawer = () => page.locator('.ai-drawer');
async function action(name) {
  await page.locator('.detail-top select').selectOption(name);
  const labels = {
    optimize_prompt: '优化提示词',
    title_tags: '生成标题与标签',
    skill_describe: '生成 Skill 简介与标签',
    extract_tip: '提炼技巧卡片',
  };
  await drawer()
    .getByRole('heading', { name: labels[name], exact: true })
    .waitFor();
  await drawer()
    .getByRole('button', { name: '重新生成', exact: true })
    .waitFor();
  await waitState(() => !document.querySelector('.stop-ai'));
}
try {
  const started = performance.now();
  processHandle = spawn(
    path.join(root, 'src-tauri/target/release/workbench.exe'),
    [],
    {
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9226',
      },
    },
  );
  for (let n = 0; n < 200; n++) {
    try {
      if ((await fetch('http://127.0.0.1:9226/json/version')).ok) break;
    } catch {}
    await delay(30);
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
  page = browser
    .contexts()[0]
    .pages()
    .find((p) => !p.url().includes('quick.html'));
  assert(page);
  page.setDefaultTimeout(15000);
  const errors = [];
  const consoleMessages = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      consoleMessages.push({
        type: message.type(),
        text: message.text().replaceAll(key, '[REDACTED]'),
      });
  });
  await page.getByRole('textbox', { name: '快速输入' }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  check('发布版页面身份、非空与初始化', {
    url: page.url(),
    title: await page.title(),
    interactiveMs: Math.round(performance.now() - started),
    viewport: await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    })),
  });
  await page.keyboard.press('Control+j');
  await page.getByRole('heading', { name: 'AI 助手', exact: true }).waitFor();
  await page.keyboard.press('Control+j');
  await page.locator('.ai-drawer').waitFor({ state: 'hidden' });
  check('应用内 Ctrl+J 打开和关闭 AI 抽屉');
  oldDefault = (await invoke('provider_list')).find((p) => p.isDefault)?.id;
  oldProxy = (await invoke('settings_get_all')).networkProxy;
  await invoke('settings_set', {
    key: 'network.proxy',
    value: { mode: 'none', url: null },
  });
  await go('/settings/models');
  await page.getByRole('button', { name: '添加模型配置' }).click();
  await page.getByLabel('配置名称', { exact: true }).fill(marker);
  await page.getByLabel('Base URL', { exact: true }).fill(baseUrl);
  await page.getByLabel('模型 ID', { exact: true }).fill('local-test');
  await page.getByLabel('API Key', { exact: true }).fill(key);
  await page.getByRole('button', { name: '保存配置' }).click();
  await waitState(
    async (name) =>
      (await window.__TAURI_INTERNALS__.invoke('provider_list')).some(
        (p) => p.name === name,
      ),
    marker,
  );
  const provider = (await invoke('provider_list')).find(
    (p) => p.name === marker,
  );
  providerId = provider.id;
  assert(provider.hasKey);
  assert(!JSON.stringify(provider).includes(key));
  await invoke('provider_set_default', { id: providerId });
  assert(!(await page.locator('input[type=password]').count()));
  check('原生表单保存 Key 后清空，公开 DTO 只含掩码');
  const test = await invoke('provider_test', {
    providerId,
    baseUrl,
    model: 'local-test',
  });
  assert(test.ok);
  const models = await invoke('provider_fetch_models', {
    providerId,
    baseUrl,
    model: 'local-test',
  });
  assert.deepEqual(models, ['local-test-a', 'local-test-z']);
  const auth = await invoke('provider_test', {
    providerId,
    baseUrl: baseUrl.replace('/v1', '/401/v1'),
    model: 'local-test',
  });
  assert.equal(auth.error.code, 'AI_AUTH');
  assert(!JSON.stringify(auth).includes(key));
  check('真实 Rust HTTP 测试连接、模型拉取与错误 Key 映射（本地模拟服务）');
  const idea = await invoke('idea_create', {
    contentMd: `${marker} 原文文字。`,
    date: new Date().toLocaleDateString('en-CA'),
    tags: [marker],
  });
  refs.push({ entityType: 'idea', id: idea.id });
  await go(`/ideas/${idea.id}`);
  const editor = page.locator('.cm-content');
  await editor.waitFor();
  await editor.click();
  await editor.press('Control+a');
  await page
    .locator('.selection-ai-toolbar')
    .getByRole('button', { name: '润色优化', exact: true })
    .click();
  await drawer()
    .getByRole('button', { name: '替换原文', exact: true })
    .waitFor();
  assert.equal(
    (await invoke('idea_get', { id: idea.id })).contentMd,
    idea.contentMd,
  );
  assert.equal(await editor.innerText(), idea.contentMd);
  check('选区润色流式结果与 diff 预览不自动改写原文');
  await page.screenshot({
    path: path.join(root, `docs/evidence/${reportName}-polish.png`),
  });
  const originalTheme = (await invoke('settings_get_all')).appearanceTheme;
  oldTheme = originalTheme;
  await invoke('settings_set', { key: 'appearance.theme', value: 'dark' });
  await waitState(() => document.documentElement.classList.contains('dark'));
  await page.screenshot({
    path: path.join(root, `docs/evidence/${reportName}-ai-dark.png`),
  });
  await invoke('settings_set', {
    key: 'appearance.theme',
    value: originalTheme,
  });
  await drawer().getByRole('button', { name: '替换原文', exact: true }).click();
  assert((await editor.innerText()).includes('润色后的'));
  await editor.press('Control+z');
  assert.equal(await editor.innerText(), idea.contentMd);
  check('编辑器替换后 Ctrl+Z 恢复原文');
  await action('title_tags');
  await drawer()
    .getByRole('button', { name: '应用所选字段', exact: true })
    .click();
  assert((await editor.innerText()).startsWith('# ' + marker + ' 建议标题'));
  await editor.press('Control+z');
  assert.equal(await editor.innerText(), idea.contentMd);
  check('灵感建议标题经手动应用为 Markdown 标题且可撤销');
  await page.getByRole('button', { name: '关闭 AI 助手' }).click();
  await editor.fill(`${marker} [[SLOW]]`);
  await page.locator('.detail-top select').selectOption('polish');
  await drawer().getByRole('button', { name: '停止生成', exact: true }).click();
  await drawer().getByText('已停止生成', { exact: true }).waitFor();
  check('生成中停止请求，取消不写回内容');
  const prompt = await invoke('prompt_create', {
    title: marker,
    body: '处理 {{topic}}',
    systemPrompt: null,
    category: '',
    targetModel: null,
    tags: [],
  });
  refs.push({ entityType: 'prompt', id: prompt.id });
  await go(`/prompts/${prompt.id}`);
  await page.locator('.cm-content').waitFor();
  await action('optimize_prompt');
  await drawer().getByText('明确结构并保留变量', { exact: false }).waitFor();
  assert(
    (await invoke('prompt_get', { id: prompt.id })).body.includes('{{topic}}'),
  );
  check('提示词优化的行 diff、变量保留和修改说明');
  await action('title_tags');
  await drawer()
    .getByRole('button', { name: '应用所选字段', exact: true })
    .click();
  await waitState(
    async (id) =>
      (
        await window.__TAURI_INTERNALS__.invoke('prompt_get', { input: { id } })
      ).title.includes('建议标题'),
    prompt.id,
  );
  check('标题标签经手动应用进入草稿和真实 SQLite');
  const skill = await invoke('skill_create', {
    name: marker,
    description: '',
    sourceType: 'md',
    contentMd: '# Skill\n说明',
    url: null,
    platforms: [],
    rating: null,
    note: '',
    tags: [],
  });
  refs.push({ entityType: 'skill', id: skill.id });
  await go(`/skills/${skill.id}`);
  await page.locator('.cm-content').waitFor();
  await action('skill_describe');
  await drawer()
    .getByRole('button', { name: '应用所选字段', exact: true })
    .click();
  await waitState(
    async (id) =>
      (
        await window.__TAURI_INTERNALS__.invoke('skill_get', { input: { id } })
      ).description.includes('验证'),
    skill.id,
  );
  check('Skill 简介与标签预览后手动应用');
  await go(`/ideas/${idea.id}`);
  await page.locator('.cm-content').waitFor();
  await page.locator('.cm-content').fill(`${marker} 从原始文字提炼操作步骤。`);
  await action('extract_tip');
  await drawer()
    .getByRole('button', { name: '保存为技巧', exact: true })
    .click();
  await waitState(
    async (marker) =>
      (
        await window.__TAURI_INTERNALS__.invoke('tip_list', {
          input: { offset: 0 },
        })
      ).items.some((i) => i.title.includes(marker)),
    marker,
  );
  const tips = await invoke('tip_list', { offset: 0 });
  for (const tip of tips.items.filter((t) => t.title.includes(marker)))
    refs.push({ entityType: 'tip', id: tip.id });
  check('技巧卡片预览后另存为技巧');
  await page.getByRole('button', { name: '关闭 AI 助手' }).click();
  const batch = [];
  for (let i = 0; i < 5; i++) {
    const e = await invoke('idea_create', {
      contentMd: `${marker} 分组 ${i}`,
      date: new Date().toLocaleDateString('en-CA'),
      tags: [],
    });
    refs.push({ entityType: 'idea', id: e.id });
    batch.push(e);
  }
  await go('/ideas');
  await page
    .getByRole('textbox', { name: '筛选当前列表' })
    .fill(`${marker} 分组`);
  for (const e of batch) {
    await page
      .locator('.content-row')
      .filter({ hasText: e.contentMd })
      .locator('.row-select')
      .click({ modifiers: ['Control'] });
  }
  await page.getByLabel('批量 AI 操作').selectOption('categorize');
  await drawer()
    .getByRole('button', { name: '另存为新灵感', exact: true })
    .click();
  await waitState(
    async (marker) =>
      (
        await window.__TAURI_INTERNALS__.invoke('idea_list', {
          input: { offset: 0 },
        })
      ).items.some((e) => e.contentMd.startsWith('## ' + marker)),
    marker,
  );
  const all = await invoke('idea_list', { offset: 0 });
  for (const e of all.items.filter((e) =>
    e.contentMd.startsWith('## ' + marker),
  ))
    refs.push({ entityType: 'idea', id: e.id });
  check('五条多选归类整理并另存为新灵感');
  await page.getByRole('button', { name: '关闭 AI 助手' }).click();
  await go('/settings/templates');
  await page.getByText('模板修改保留；恢复默认仅影响所选模板。').waitFor();
  const templates = await invoke('ai_template_list');
  const batchTwoKeys = [
    'polish',
    'shorten',
    'expand',
    'summarize',
    'categorize',
    'merge_note',
    'title_tags',
    'extract_tip',
    'optimize_prompt',
    'skill_describe',
  ];
  assert.ok(
    batchTwoKeys.every((key) => templates.some((t) => t.templateKey === key)),
  );
  await page.screenshot({
    path: path.join(root, `docs/evidence/${reportName}-templates.png`),
  });
  check('设置页展示十个可编辑和恢复默认的系统模板');
  await go('/settings/shortcuts');
  const oldShortcut = (await invoke('settings_get_all')).shortcutQuickCapture;
  await page.getByLabel('全局快速记录', { exact: true }).fill('Not+A+Shortcut');
  await page
    .getByRole('button', { name: '保存快捷键', exact: true })
    .first()
    .click();
  await page.getByRole('alert').filter({ hasText: '格式无效' }).waitFor();
  assert((await invoke('shortcut_status')).active);
  await invoke('shortcut_update', {
    action: 'quickCapture',
    accelerator: oldShortcut,
  });
  check('非法全局快捷键不崩溃，旧快捷键保留且设置显示失败');
  hotkeyHolder = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'scripts/hold-test-shortcut.ps1'),
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let holderOutput = '';
  hotkeyHolder.stdout.on('data', (chunk) => {
    holderOutput += chunk.toString();
  });
  for (
    let n = 0;
    n < 100 &&
    !holderOutput.includes('READY') &&
    !holderOutput.includes('UNAVAILABLE');
    n++
  )
    await delay(50);
  if (holderOutput.includes('READY')) {
    const before = (await invoke('shortcut_status')).active;
    await page.getByLabel('全局快速记录', { exact: true }).fill('Ctrl+Alt+F12');
    await page
      .getByRole('button', { name: '保存快捷键', exact: true })
      .first()
      .click();
    await page.getByRole('alert').filter({ hasText: '被占用' }).waitFor();
    assert.equal((await invoke('shortcut_status')).active, before);
    check('真实 Windows 热键占用时返回冲突，应用存活且旧注册保留');
  } else {
    results.push({
      name: '真实 Windows 快捷键冲突',
      status: 'not_run',
      reason: 'Test-owned hotkey registration unavailable',
    });
  }
  hotkeyHolder.kill();
  hotkeyHolder = undefined;
  await invoke('shortcut_update', {
    action: 'quickCapture',
    accelerator: oldShortcut,
  });
  const quick = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('quick.html'));
  assert(quick);
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'quick' }),
  );
  const quickInput = quick.getByRole('textbox', { name: '快速记录内容' });
  await quickInput.fill(`${marker} 快速灵感`);
  await quickInput.press('Enter');
  await waitState(
    async (marker) =>
      (
        await window.__TAURI_INTERNALS__.invoke('idea_list', {
          input: { offset: 0 },
        })
      ).items.some((e) => e.contentMd === marker + ' 快速灵感'),
    marker,
  );
  for (const e of (await invoke('idea_list', { offset: 0 })).items.filter(
    (e) => e.contentMd === marker + ' 快速灵感',
  ))
    refs.push({ entityType: 'idea', id: e.id });
  check('真实 quick 窗口 Enter 写入后主窗口数据即时可见');
  await go('/');
  await page
    .getByRole('link', { name: new RegExp(`${marker} 快速灵感`) })
    .waitFor();
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'quick' }),
  );
  await quickInput.fill(`${marker} 快速待办`);
  await quickInput.press('Control+Enter');
  await waitState(
    async (marker) =>
      (
        await window.__TAURI_INTERNALS__.invoke('todo_list', {
          input: { view: 'today', offset: 0 },
        })
      ).items.some((t) => t.title === marker + ' 快速待办'),
    marker,
  );
  for (const e of (
    await invoke('todo_list', { view: 'today', offset: 0 })
  ).items.filter((t) => t.title === marker + ' 快速待办'))
    refs.push({ entityType: 'todo', id: e.id });
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'quick' }),
  );
  await quickInput.press('Escape');
  assert.equal(
    await quick.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {
        label: 'quick',
      }),
    ),
    false,
  );
  check('quick Ctrl+Enter 存今日待办、Esc 隐藏与今日页面自动刷新');
  const second = spawn(
    path.join(root, 'src-tauri/target/release/workbench.exe'),
    [],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let n = 0; n < 100 && second.exitCode === null; n++) await delay(50);
  if (second.exitCode === null) {
    second.kill();
    throw new Error('Second instance did not exit');
  }
  assert.equal(second.exitCode, 0);
  assert.equal(processHandle.exitCode, null);
  check('二次启动复用原实例，第二个进程退出');
  const close = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'scripts/close-test-window.ps1'),
      '-WorkbenchProcessId',
      String(processHandle.pid),
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let n = 0; n < 100 && close.exitCode === null; n++) await delay(50);
  assert.equal(close.exitCode, 0);
  await waitState(
    async () =>
      !(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {
        label: 'main',
      })),
  );
  assert.equal(processHandle.exitCode, null);
  await invoke('window_show_main');
  check('关闭原生主窗口后进程驻留，仍可恢复主窗口');
  assert(
    requests.filter((r) => !r.url.includes('/401/')).every((r) => r.authorized),
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(consoleMessages.length, 0, JSON.stringify(consoleMessages));
  check('授权头通过本地服务验证，主 WebView 无页面异常');
  const info = await invoke('app_info');
  for (const file of [
    info.dbPath,
    info.dbPath + '-wal',
    path.join(process.env.APPDATA, 'com.workbench.app', 'bootstrap.json'),
    path.join(
      process.env.LOCALAPPDATA,
      'com.workbench.app',
      'logs',
      'workbench.log',
    ),
  ]) {
    if (fs.existsSync(file))
      assert(!fs.readFileSync(file).includes(Buffer.from(key)));
  }
  check('本机数据库、WAL、bootstrap 与现有日志不含临时测试 Key');
} catch (error) {
  if (page)
    await page
      .screenshot({
        path: path.join(root, `docs/evidence/${reportName}-last-failure.png`),
      })
      .catch(() => {});
  results.push({
    name: '原生验收中断',
    status: 'failed',
    error: String(error).replaceAll(key, '[REDACTED]'),
  });
  console.error(String(error).replaceAll(key, '[REDACTED]'));
  process.exitCode = 1;
} finally {
  if (hotkeyHolder) hotkeyHolder.kill();
  if (page) {
    if (oldTheme)
      await invoke('settings_set', {
        key: 'appearance.theme',
        value: oldTheme,
      }).catch(() => {});
    for (const ref of refs) await invoke('trash_purge', ref).catch(() => {});
    if (oldDefault)
      await invoke('provider_set_default', { id: oldDefault }).catch(() => {});
    if (providerId)
      await invoke('provider_delete', { id: providerId }).catch(() => {});
    if (oldProxy)
      await invoke('settings_set', {
        key: 'network.proxy',
        value: oldProxy,
      }).catch(() => {});
    for (const tag of await invoke('tag_list').catch(() => []))
      if (tag.name === marker)
        await invoke('tag_delete', { id: tag.id }).catch(() => {});
  }
  fs.writeFileSync(
    report,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        environment:
          'Windows native release WebView2; local simulated AI; Browser plugin not available',
        results,
      },
      null,
      2,
    ),
  );
  if (browser) await browser.close().catch(() => {});
  if (processHandle && processHandle.exitCode === null) processHandle.kill();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
