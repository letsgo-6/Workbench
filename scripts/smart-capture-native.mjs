import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.WORKBENCH_PLAYWRIGHT_PATH || 'playwright',
);
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = process.env.WORKBENCH_TEST_DIR;
assert(dir, 'Use an isolated test profile; do not run against user data');
const key = `sk-smart-capture-test-${randomUUID()}`;
const results = [],
  errors = [];
let page,
  browser,
  app,
  provider,
  today,
  behavior = 'normal',
  requestCount = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const addDays = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function answer(text) {
  const base = {
    type: 'idea',
    source: '模型改写应被丢弃',
    title: '',
    confidence: 'high',
  };
  if (text.includes('；另外记一下：'))
    return [
      {
        ...base,
        type: 'todo',
        source: '下周三交房租',
        title: '交房租',
        dateText: '下周三',
      },
      { ...base, source: '番茄钟配合 AI 总结效果很好' },
    ];
  if (text.startsWith('明天下午'))
    return [
      {
        ...base,
        type: 'todo',
        title: '明天下午3点前把周报发给老板',
        dateText: '明天下午3点前',
        date: '2099-01-01',
        time: '04:00',
      },
    ];
  if (text.includes('/compact'))
    return [
      { ...base, type: 'tip', title: '压缩上下文', tools: ['claude code'] },
    ];
  if (text.includes('anthropics/skills'))
    return [
      { ...base, type: 'skill', url: 'https://github.com/anthropics/skills' },
    ];
  if (text.startsWith('你是资深编辑'))
    return [{ ...base, type: 'prompt', title: '编辑文案', body: text }];
  if (text.startsWith('25号'))
    return [
      {
        ...base,
        type: 'todo',
        title: '25号之前提交报销',
        dateText: '25号之前',
      },
    ];
  if (text.startsWith('昨天')) return [{ ...base, dateText: '昨天' }];
  if (text.startsWith('年底前'))
    return [
      {
        ...base,
        type: 'todo',
        title: '完成项目',
        dateText: '年底前',
        date: `${today.slice(0, 4)}-12-31`,
      },
    ];
  if (text.startsWith('模糊')) return [{ ...base, confidence: 'low' }];
  if (text.includes('伪造链接'))
    return [{ ...base, type: 'skill', url: 'https://invented.invalid' }];
  return [base];
}
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  requestCount++;
  assert.equal(req.headers.authorization, `Bearer ${key}`);
  if (behavior === 'auth') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: key } }));
    return;
  }
  if (behavior === 'slow') await pause(1200);
  if (res.destroyed) return;
  const prompt = body.messages?.at(-1)?.content || '';
  const text = prompt.match(/<input>\n([\s\S]*)\n<\/input>/)?.[1] || '';
  if (behavior !== 'broken') {
    assert(prompt.includes('Claude Code、Cursor、ChatGPT、Codex'));
    assert(!prompt.includes('{{now}}') && !prompt.includes('{{known_tools}}'));
  }
  const output =
    behavior === 'broken'
      ? 'broken JSON'
      : JSON.stringify({ items: answer(text) });
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const chunk of output.match(/.{1,9}/gs) || [])
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`,
    );
  res.end('data: [DONE]\n\n');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const invoke = (command, input) =>
  page.evaluate(
    ({ command, input }) =>
      window.__TAURI_INTERNALS__.invoke(
        command,
        input === undefined ? {} : { input },
      ),
    { command, input },
  );
const check = (name) => {
  results.push({ name, status: 'passed' });
  console.log(`PASS ${name}`);
};
async function until(fn) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(40);
  }
  throw Error('Native capture state timeout');
}
const analyze = (text) =>
  invoke('capture_analyze', {
    requestId: randomUUID(),
    providerId: null,
    text,
  });
const saveProvider = (extra = {}) =>
  invoke('provider_save', {
    id: provider?.id ?? null,
    name: 'Smart Capture fixture',
    baseUrl,
    model: 'fixture',
    temperature: 0.7,
    maxTokens: null,
    ...extra,
  });
try {
  app = spawn(path.join(root, 'src-tauri/target/release/workbench.exe'), [], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9231',
    },
  });
  await until(async () => {
    try {
      return (await fetch('http://127.0.0.1:9231/json/version')).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
  await until(async () => {
    page = browser
      .contexts()[0]
      .pages()
      .find(
        (p) =>
          p.url().includes('tauri.localhost') &&
          !p.url().includes('quick.html'),
      );
    return Boolean(page);
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) errors.push(m.text());
  });
  await page.getByRole('textbox', { name: '快速输入' }).waitFor();
  const info = await invoke('app_info');
  assert.equal(
    info.version,
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .version,
  );
  assert(
    path.resolve(info.dataDir).startsWith(path.resolve(dir) + path.sep),
    'Expected a test-owned database',
  );
  await invoke('shortcut_update', {
    action: 'quickCapture',
    accelerator: 'Ctrl+Alt+Shift+F11',
  });
  await invoke('settings_set', {
    key: 'network.proxy',
    value: { mode: 'none', url: null },
  });
  provider = await saveProvider({ apiKey: key });
  await invoke('provider_set_default', { id: provider.id });
  today = (await invoke('home_overview')).today;
  const samples = [
    ['明天下午3点前把周报发给老板', 'todo'],
    ['突然想到可以按周把灵感自动整理成选题', 'idea'],
    ['Claude Code 里用 /compact 可以压缩上下文，长对话很好用', 'tip'],
    ['这个 skill 不错 https://github.com/anthropics/skills', 'skill'],
    ['提示词：你是资深编辑，请把 {{topic}} 写成 300 字的小红书文案', 'prompt'],
    ['下周三交房租；另外记一下：番茄钟配合 AI 总结效果很好', 'todo'],
    ['25号之前提交报销', 'todo'],
    ['昨天想到一个点子：用 AI 自动写周报', 'idea'],
    ['待办：整理书架', 'todo'],
  ];
  for (let n = 0; n < samples.length; n++) {
    const [text, kind] = samples[n];
    const p = await analyze(text);
    const i = p.items[0];
    assert.equal(i.kind, kind);
    assert.equal(p.today, today);
    if ([0, 1, 2, 3, 7].includes(n)) assert.equal(i.body, text);
    if (n === 0) {
      assert.equal(i.title, '把周报发给老板');
      assert.equal(i.dueDate, addDays(today, 1));
      assert.equal(new Date(i.remindAt).getHours(), 15);
      assert.equal(i.dateSource, 'rule');
    }
    if (n === 1) assert.equal(i.date, today);
    if (n === 2) assert.deepEqual(i.tools, ['Claude Code']);
    if (n === 3) assert.equal(i.url, 'https://github.com/anthropics/skills');
    if (n === 4) {
      assert.equal(i.body, text.slice('提示词：'.length));
      assert(i.body.includes('{{topic}}'));
    }
    if (n === 5) {
      assert.equal(p.items.length, 2);
      const weekday = new Date(`${today}T12:00:00`).getDay();
      assert.equal(i.dueDate, addDays(today, 7 + 2 - ((weekday + 6) % 7)));
    }
    if (n === 6) {
      const d = new Date(`${today}T12:00:00`);
      if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
      d.setDate(25);
      assert.equal(
        i.dueDate,
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-25`,
      );
    }
    if (n === 7) assert.equal(i.date, addDays(today, -1));
    if (n === 8) {
      assert.equal(p.items.length, 1);
      assert.equal(i.dueDate, null);
      assert.equal(i.source, '整理书架');
    }
    check(`§8 识别日期样例 ${n + 1}（本地模拟服务）`);
  }
  assert.equal((await invoke('idea_list', {})).total, 0);
  assert.equal((await invoke('todo_list', {})).total, 0);
  check('分析不写库；模板 now/known_tools 已渲染');
  const malicious = await analyze('收藏一个伪造链接');
  assert.equal(malicious.items[0].url, null);
  assert(malicious.items[0].warnings.includes('urlDropped'));
  check('模型编造链接在后端被丢弃');
  await page.reload();
  await page.getByRole('button', { name: '灵感', exact: true }).waitFor();
  const input = page.getByRole('textbox', { name: '快速输入' });
  await input.press('Tab');
  await page.getByRole('button', { name: '待办', exact: true }).waitFor();
  await input.fill(samples[5][0]);
  await input.press('Enter');
  await page.getByRole('button', { name: '全部保存 Enter' }).waitFor();
  assert.equal(await page.getByRole('article').count(), 2);
  await page
    .getByRole('textbox', { name: '标题', exact: true })
    .first()
    .fill('确认后的房租任务');
  await page.screenshot({ path: path.join(dir, 'capture-native-preview.png') });
  await page
    .getByRole('article')
    .nth(1)
    .getByRole('button', { name: '移除', exact: true })
    .click();
  await page.getByRole('textbox', { name: '标题', exact: true }).press('Enter');
  await until(async () => (await input.inputValue()) === '');
  assert(
    (await invoke('todo_list', {})).items.some(
      (i) => i.title === '确认后的房租任务',
    ),
  );
  await page.getByRole('button', { name: '撤销', exact: true }).last().click();
  await until(
    async () =>
      !(await invoke('todo_list', {})).items.some(
        (i) => i.title === '确认后的房租任务',
      ),
  );
  assert.equal((await invoke('trash_list')).length, 0);
  check('原生目标内多条卡片编辑/移除/Enter保存、刷新、撤销彻底删除');
  const before = requestCount;
  await input.fill('直接记录原文');
  await input.press('Control+Enter');
  await until(async () => (await input.inputValue()) === '');
  assert.equal(requestCount, before);
  assert(
    (await invoke('idea_list', {})).items.some(
      (i) => i.contentMd === '直接记录原文',
    ),
  );
  check('Ctrl+Enter 绕过 AI 直接保存原文');
  behavior = 'slow';
  await input.fill('取消时的原文');
  await input.press('Enter');
  await page.getByText('正在整理…', { exact: true }).waitFor();
  await input.press('Escape');
  assert.equal(await input.inputValue(), '取消时的原文');
  assert.equal(await page.getByRole('alert').count(), 0);
  behavior = 'normal';
  check('分析中取消保留原文且不显示错误');
  behavior = 'auth';
  await input.press('Enter');
  await page.getByRole('alert').waitFor();
  await page.getByRole('link', { name: '去设置', exact: true }).waitFor();
  assert.equal(await input.inputValue(), '取消时的原文');
  await page.getByRole('button', { name: '存为灵感', exact: true }).click();
  await until(async () => (await input.inputValue()) === '');
  behavior = 'normal';
  check('401显示设置入口、保留输入、手动灵感兜底');
  await saveProvider({ baseUrl: 'http://127.0.0.1:9' });
  await input.fill('断网时的待办');
  await input.press('Enter');
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: '存为待办', exact: true }).click();
  await until(async () => (await input.inputValue()) === '');
  assert(
    (await invoke('todo_list', {})).items.some(
      (i) => i.title === '断网时的待办' && i.dueDate === today,
    ),
  );
  await saveProvider();
  check('连接失败可按原文手动保存今日待办');
  await invoke('settings_set', { key: 'capture.autoSave', value: true });
  await page.reload();
  await page.getByRole('button', { name: '灵感', exact: true }).waitFor();
  await input.fill('可靠的自动保存记录');
  await input.press('Enter');
  await until(async () => (await input.inputValue()) === '');
  await page.getByRole('button', { name: '撤销', exact: true }).last().click();
  await until(
    async () =>
      !(await invoke('idea_list', {})).items.some(
        (i) => i.contentMd === '可靠的自动保存记录',
      ),
  );
  for (const text of ['年底前完成项目', '模糊的想法']) {
    await input.fill(text);
    await input.press('Enter');
    await page.getByRole('button', { name: '全部保存 Enter' }).waitFor();
    assert.equal(await input.inputValue(), text);
    if (text.startsWith('年底'))
      await page.getByText('日期来自 AI 推断，请核对。').waitFor();
    await input.press('Escape');
  }
  check('可靠结果自动保存与撤销；AI日期和低置信度强制确认');
  const templates = await invoke('ai_template_list');
  assert.equal(templates.length, 13);
  const template = templates.find((p) => p.templateKey === 'smart_capture');
  assert(template);
  await invoke('prompt_update', {
    id: template.id,
    title: template.title,
    body: 'BROKEN CAPTURE TEMPLATE',
    systemPrompt: template.systemPrompt,
    category: template.category,
    targetModel: template.targetModel,
    tags: [],
  });
  behavior = 'broken';
  await input.fill('模板损坏时原文');
  await input.press('Enter');
  await page.getByRole('alert').waitFor();
  assert.equal(await input.inputValue(), '模板损坏时原文');
  await invoke('ai_template_reset', { id: 'smart_capture' });
  behavior = 'normal';
  assert.equal(
    (await invoke('ai_template_list')).find((p) => p.id === template.id).body,
    template.body,
  );
  check('第13个模板编辑/恢复；损坏输出失败兜底');
  await saveProvider({ apiKey: '' });
  await until(
    async () =>
      (await input.getAttribute('placeholder'))?.includes('AI 会整理') ===
      false,
  );
  await input.fill('');
  await input.press('Tab');
  await page.getByRole('button', { name: '待办', exact: true }).waitFor();
  await input.press('Tab');
  await page.getByRole('button', { name: '灵感', exact: true }).waitFor();
  check('清空Key立即恢复v0.2.0两种手动模式');
  await invoke('provider_delete', { id: provider.id });
  provider = null;
  const backupPath = path.join(dir, 'capture-settings.json');
  await invoke('data_export_json', { path: backupPath });
  await invoke('settings_set', { key: 'capture.autoSave', value: false });
  await invoke('data_import_json', { path: backupPath, mode: 'overwrite' });
  assert.equal((await invoke('settings_get_all')).captureAutoSave, true);
  const old = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  delete old.data.settings['capture.autoSave'];
  delete old.data.settings['capture.defaultTarget'];
  old.data.settings['capture.smartDefault'] = false;
  old.data.prompts = old.data.prompts.filter(
    (p) => p.template_key !== 'smart_capture',
  );
  const oldPath = path.join(dir, 'v020.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  await invoke('data_import_json', { path: oldPath, mode: 'overwrite' });
  assert.equal((await invoke('ai_template_list')).length, 13);
  assert.equal((await invoke('settings_get_all')).captureDefaultTarget, 'idea');
  check('真实JSON保留新设置；旧备份忽略smartDefault并自动补模板');
  assert.equal(await page.title(), 'Workbench');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.deepEqual(errors, []);
  check('发布模式原生WebView非空、无框架覆盖层与控制台异常');
} catch (error) {
  results.push({
    name: '原生智能整理验收',
    status: 'failed',
    error: String(error).replaceAll(key, '[REDACTED]'),
  });
  console.error(String(error).replaceAll(key, '[REDACTED]'));
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(dir, 'capture-native-failure.png') })
      .catch(() => {});
} finally {
  if (page && provider)
    await invoke('provider_delete', { id: provider.id }).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (app && app.exitCode === null) app.kill();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.writeFileSync(
    path.join(dir, 'smart-capture-native.json'),
    JSON.stringify(
      {
        environment:
          'Windows release WebView2; real IPC/Rust/SQLite/keyring; LOCAL MODEL FIXTURE, not real provider; Browser plugin not available',
        today,
        results,
        errors,
      },
      null,
      2,
    ),
  );
}
