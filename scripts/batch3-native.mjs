import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.WORKBENCH_PLAYWRIGHT_PATH || 'playwright',
);
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = process.env.WORKBENCH_TEST_DIR;
assert(dir, 'Run through batch3-acceptance.mjs so all data is isolated');
const marker = `批次三验收${Date.now()}`;
const key = `sk-test-${randomBytes(24).toString('hex')}`;
const exe = path.join(root, 'src-tauri/target/release/workbench.exe');
const trace = path.join(dir, 'native-startup.txt');
const results = [],
  requests = [],
  authorizations = [],
  errors = [],
  consoleErrors = [];
let app, browser, page, providerId;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const server = http.createServer(async (req, res) => {
  if (req.url === '/skill') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`# ${marker} 远程正文`);
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const authorized = req.headers.authorization === `Bearer ${key}`;
  authorizations.push(authorized);
  if (!authorized) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"error":{"message":"Invalid test credential"}}');
    return;
  }
  requests.push(body);
  const text = body.messages?.at(-1)?.content || '';
  let answer = `${marker} 引用比较 [完成] ${key}`;
  if (text.includes('拆解为可执行'))
    answer = JSON.stringify([
      {
        title: `${marker} 建议任务`,
        note: '建议备注',
        dueDate: null,
        priority: 2,
      },
    ]);
  else if (text.includes('小结，包含今日完成'))
    answer = `## ${marker} 每日小结\n- 已整理今天的记录。`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const part of answer.match(/.{1,8}/gs) || []) {
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`,
    );
    await pause(10);
  }
  res.end('data: [DONE]\n\n');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const invoke = (command, input) =>
  page.evaluate(
    ({ command, input }) =>
      window.__TAURI_INTERNALS__.invoke(
        command,
        input === undefined ? {} : { input },
      ),
    { command, input },
  );
const go = (route) =>
  page.evaluate((route) => {
    location.hash = route;
  }, route);
const check = (name, detail = {}) => {
  results.push({ name, status: 'passed', ...detail });
  console.log(`PASS ${name}`);
};
async function until(fn) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(60);
  }
  throw Error('Native state timeout');
}
async function connect() {
  await until(async () => {
    try {
      return (await fetch('http://127.0.0.1:9228/json/version')).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.connectOverCDP('http://127.0.0.1:9228');
  // A restarted process initially exposes about:blank for both WebViews.
  // Wait for the main document identity rather than claiming the first page.
  await until(async () => {
    page = browser
      .contexts()[0]
      .pages()
      .find(
        (p) =>
          p.url().startsWith('http://tauri.localhost/') &&
          !p.url().includes('/quick.html'),
      );
    return !!page;
  });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) =>
    errors.push(e.message.replaceAll(key, '[REDACTED]')),
  );
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type()))
      consoleErrors.push(m.text().replaceAll(key, '[REDACTED]'));
  });
  await page.getByRole('textbox', { name: '快速输入' }).waitFor();
}
async function start() {
  app = spawn(exe, [], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WORKBENCH_STARTUP_TRACE: trace,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9228',
    },
  });
  await connect();
}
async function stop() {
  if (browser) await browser.close().catch(() => {});
  browser = null;
  // Restarted Tauri children inherit the trace path; only captured PIDs with this exact executable are stopped.
  const pids = fs.existsSync(trace)
    ? [
        ...new Set(
          fs
            .readFileSync(trace, 'utf8')
            .trim()
            .split('\n')
            .map((line) => Number(line.split('|')[0]))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ]
    : [];
  for (const id of pids) {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$owned=Get-Process -Id ${id} -ErrorAction SilentlyContinue; if($owned -and $owned.Path -eq '${exe.replaceAll("'", "''")}'){Stop-Process -Id ${id} -ErrorAction Stop}; exit 0`,
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
  }
  await pause(250);
  page = null;
}
async function pickFolder(folder) {
  await page.evaluate((folder) => {
    // Tauri's invoke is immutable. Stub only the OS picker transport; all
    // business IPC, filesystem reads and database writes remain native.
    const nativeFetch = window.fetch;
    window.__testPicker = { nativeFetch, called: false };
    window.fetch = (resource, options) => {
      const url = new URL(
        resource instanceof Request ? resource.url : resource,
      );
      if (
        url.hostname === 'ipc.localhost' &&
        decodeURIComponent(url.pathname) === '/plugin:dialog|open'
      ) {
        window.__testPicker.called = true;
        return Promise.resolve(
          new Response(JSON.stringify(folder), {
            headers: {
              'Content-Type': 'application/json',
              'Tauri-Response': 'ok',
            },
          }),
        );
      }
      return nativeFetch.call(window, resource, options);
    };
  }, folder);
}
async function restorePicker() {
  const called = await page.evaluate(() => {
    const { nativeFetch, called } = window.__testPicker;
    window.fetch = nativeFetch;
    delete window.__testPicker;
    return called;
  });
  assert(called, 'The test must intercept exactly the native folder picker');
}
try {
  await start();
  assert.equal((await invoke('app_info')).version, '0.2.0');
  assert.equal(await page.title(), 'Workbench');
  assert.equal(page.url(), 'http://tauri.localhost/');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  check('原生发布版身份、非空、无错误覆盖层', {
    viewport: await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    })),
  });
  await invoke('settings_set', { key: 'todo.remindersEnabled', value: false });
  await invoke('settings_set', { key: 'backup.autoEnabled', value: false });
  await invoke('settings_set', {
    key: 'network.proxy',
    value: { mode: 'none', url: null },
  });
  const a = await invoke('idea_create', {
    contentMd: `${marker}引用甲 苹果观察`,
    date: today(),
    tags: [marker],
  });
  const b = await invoke('idea_create', {
    contentMd: `${marker}引用乙 香蕉分析`,
    date: today(),
    tags: [marker],
  });
  const parent = await invoke('todo_create', {
    title: `${marker} 父待办`,
    priority: 2,
    dueDate: today(),
  });
  await go(`/todos/${parent.id}`);
  await page.getByLabel('子任务标题', { exact: true }).fill(`${marker} 子任务`);
  await page.getByRole('button', { name: '添加子任务', exact: true }).click();
  await until(
    async () => (await invoke('todo_children', { id: parent.id })).length === 1,
  );
  await page.locator('.subtask-row input[type=checkbox]').click();
  await until(
    async () => (await invoke('todo_get', { id: parent.id })).subtaskDone === 1,
  );
  assert.equal((await invoke('todo_get', { id: parent.id })).subtaskTotal, 1);
  await page
    .getByLabel('编辑子任务', { exact: true })
    .fill(`${marker} 子任务改名`);
  await page.getByLabel('编辑子任务', { exact: true }).press('Enter');
  await until(
    async () =>
      (await invoke('todo_children', { id: parent.id }))[0]?.title ===
      `${marker} 子任务改名`,
  );
  check('子任务添加、完成、改名与父列表进度 1/1');
  await page.screenshot({
    path: path.join(root, 'docs/evidence/batch3-subtasks.png'),
  });
  await invoke('todo_delete', { id: parent.id });
  await invoke('trash_restore', { entityType: 'todo', id: parent.id });
  assert.equal((await invoke('todo_children', { id: parent.id })).length, 1);
  check('父待办软删除级联并恢复子任务');
  const remind = new Date(Date.now() + 60000);
  const inputTime = `${today()}T${remind.toTimeString().slice(0, 5)}`;
  await page.getByLabel('提醒时间', { exact: true }).fill(inputTime);
  await page.getByLabel('提醒时间', { exact: true }).blur();
  await until(
    async () => (await invoke('todo_get', { id: parent.id })).remindAt !== null,
  );
  check('日期时间提醒字段经真实编辑器自动保存（系统通知显示另列待验）');
  const prompt = await invoke('prompt_create', {
    title: `${marker} 提示`,
    body: '初始正文',
    tags: [marker],
  });
  await go(`/prompts/${prompt.id}`);
  await page.getByRole('button', { name: '保存为版本', exact: true }).click();
  await until(
    async () =>
      (await invoke('prompt_version_list', { id: prompt.id })).length === 1,
  );
  const first = (await invoke('prompt_version_list', { id: prompt.id }))[0];
  const editor = page.locator('.cm-content[contenteditable=true]');
  await editor.fill('修改后的会话正文');
  await until(
    async () =>
      (await invoke('prompt_get', { id: prompt.id })).body ===
      '修改后的会话正文',
  );
  assert.equal(
    (await invoke('prompt_version_list', { id: prompt.id })).length,
    1,
  );
  await go('/');
  await until(
    async () =>
      (await invoke('prompt_version_list', { id: prompt.id })).length === 2,
  );
  await go(`/prompts/${prompt.id}`);
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await page
    .getByRole('combobox', { name: '版本历史', exact: true })
    .selectOption(first.id);
  await page.getByRole('button', { name: '回滚到此版本', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认', exact: true })
    .click();
  await until(
    async () =>
      (await invoke('prompt_get', { id: prompt.id })).body === '初始正文',
  );
  assert((await invoke('prompt_version_list', { id: prompt.id })).length >= 3);
  check('提示词自动保存不生成版本、会话结束生成版本、diff 回滚另存版本');
  providerId = (
    await invoke('provider_save', {
      name: marker,
      baseUrl: `${url}/v1`,
      model: 'local-native-test',
      temperature: 0.7,
      apiKey: key,
    })
  ).id;
  await invoke('provider_set_default', { id: providerId });
  await page.keyboard.press('Control+j');
  await page.locator('.ai-drawer').waitFor({ state: 'visible' });
  const question = page.getByLabel('向 AI 提问…', { exact: true });
  for (const title of [`${marker}引用甲`, `${marker}引用乙`]) {
    await question.fill(`@${title}`);
    await page
      .locator('.reference-picker button')
      .filter({ hasText: title })
      .first()
      .click();
  }
  assert.equal(await page.locator('.reference-chips>span').count(), 2);
  await question.fill(`${marker} 比较两条引用`);
  await page
    .locator('.ai-chat-form')
    .getByRole('button', { name: '发送', exact: true })
    .click();
  await until(async () =>
    (await invoke('ai_conversation_list')).some((c) =>
      c.title.includes(marker),
    ),
  );
  const conversation = (await invoke('ai_conversation_list')).find((c) =>
    c.title.includes(marker),
  );
  await until(
    async () =>
      (await invoke('ai_conversation_get', { id: conversation.id })).messages
        .length === 2,
  );
  assert(
    requests.some((r) =>
      r.messages.some(
        (m) => m.content.includes('苹果观察') && m.content.includes('香蕉分析'),
      ),
    ),
  );
  assert(
    !(
      await invoke('ai_conversation_get', { id: conversation.id })
    ).messages.some((m) => m.content.includes(key)),
  );
  check(
    '两条 @ 引用由 Rust 读取正文，真实 Channel 对话持久化且供应商回显 Key 脱敏',
  );
  assert.deepEqual(
    (
      await invoke('ai_conversation_get', { id: conversation.id })
    ).messages[0].refs
      .map((r) => r.id)
      .sort(),
    [a.id, b.id].sort(),
  );
  await page.screenshot({
    path: path.join(root, 'docs/evidence/batch3-chat.png'),
  });
  await stop();
  await start();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await page
    .getByLabel('对话历史', { exact: true })
    .selectOption(conversation.id);
  await page
    .locator('.chat-message.assistant')
    .filter({ hasText: marker })
    .waitFor();
  await page.getByRole('button', { name: '重命名对话', exact: true }).click();
  await page.getByLabel('对话名称', { exact: true }).fill(`${marker} 已重命名`);
  await page
    .locator('.conversation-history form')
    .getByRole('button', { name: '确认', exact: true })
    .click();
  await until(
    async () =>
      (await invoke('ai_conversation_get', { id: conversation.id }))
        .conversation.title === `${marker} 已重命名`,
  );
  check('重启发布进程后加载历史并重命名');
  await page.getByRole('button', { name: '删除对话', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认', exact: true })
    .click();
  await until(
    async () =>
      !(await invoke('ai_conversation_list')).some(
        (c) => c.id === conversation.id,
      ),
  );
  check('删除对话保留软删除备份数据');
  await go('/');
  await page.getByRole('button', { name: '生成每日小结', exact: true }).click();
  await page
    .locator('.ai-result .markdown')
    .filter({ hasText: `${marker} 每日小结` })
    .waitFor();
  assert(
    requests.some(
      (r) =>
        r.messages.at(-1)?.content.includes('苹果观察') &&
        r.messages.at(-1)?.content.includes('父待办'),
    ),
  );
  await page
    .locator('.ai-result')
    .getByRole('button', { name: '另存为新灵感', exact: true })
    .click();
  await until(async () =>
    (await invoke('idea_list', { offset: 0 })).items.some((i) =>
      i.contentMd.includes('每日小结'),
    ),
  );
  check('每日小结后端读取今日数据并另存为新灵感');
  await page
    .locator('.ai-drawer')
    .getByRole('button', { name: '关闭 AI 助手', exact: true })
    .click();
  await go('/todos');
  await page.getByRole('button', { name: 'AI 拆解待办', exact: true }).click();
  await page
    .getByLabel('描述需要完成的事情', { exact: true })
    .fill(`${marker} 完成一个项目`);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '发送', exact: true })
    .click();
  await page.getByLabel('标题 1', { exact: true }).waitFor();
  const before = (await invoke('todo_list', { offset: 0, view: 'all' })).total;
  await page
    .getByLabel('标题 1', { exact: true })
    .fill(`${marker} 人工审核任务`);
  await page.getByRole('button', { name: '确认创建待办', exact: true }).click();
  await until(
    async () =>
      (await invoke('todo_list', { offset: 0, view: 'all' })).total ===
      before + 1,
  );
  check('AI 拆解预览可编辑，点击确认后原子创建');
  await page.screenshot({
    path: path.join(root, 'docs/evidence/batch3-breakdown.png'),
  });
  await page
    .locator('.ai-drawer')
    .getByRole('button', { name: '关闭 AI 助手', exact: true })
    .click();
  const folder = path.join(dir, 'skills');
  for (const [name, title] of [
    ['a', `${marker} 本地 Skill`],
    ['b', `${marker} 已存在 Skill`],
    ['node_modules/c', `${marker} 忽略 Skill`],
  ]) {
    const p = path.join(folder, name, 'SKILL.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      `---\nname: ${title}\ndescription: 扫描预览\n---\n# skill`,
    );
  }
  await invoke('skill_create', {
    name: `${marker} 已存在 Skill`,
    sourceType: 'md',
    contentMd: 'existing',
  });
  await go('/skills');
  await pickFolder(folder);
  await page
    .getByRole('button', { name: '导入 Skill 文件夹', exact: true })
    .click();
  await restorePicker();
  await page.locator('.skill-import-preview').waitFor();
  assert.equal(await page.locator('.skill-import-preview li').count(), 2);
  assert.equal(
    await page.locator('.skill-import-preview input:disabled').count(),
    1,
  );
  await page
    .getByRole('button', { name: '导入所选 Skill', exact: true })
    .click();
  await until(async () =>
    (await invoke('skill_list', { offset: 0 })).items.some(
      (i) => i.name === `${marker} 本地 Skill`,
    ),
  );
  check('文件夹真实扫描、预览已存在名称并跳过重复（文件选择器边界模拟）');
  const skill = await invoke('skill_create', {
    name: `${marker} 远程`,
    sourceType: 'both',
    contentMd: '本地旧正文',
    url: `${url}/skill`,
  });
  await go(`/skills/${skill.id}`);
  await page.getByRole('button', { name: '拉取链接内容', exact: true }).click();
  await page
    .getByRole('button', { name: '确认替换本地正文', exact: true })
    .waitFor();
  assert.equal(
    (await invoke('skill_get', { id: skill.id })).contentMd,
    '本地旧正文',
  );
  await page
    .getByRole('button', { name: '确认替换本地正文', exact: true })
    .click();
  await until(async () =>
    (await invoke('skill_get', { id: skill.id })).contentMd.includes(
      '远程正文',
    ),
  );
  await page.locator('.cm-content[contenteditable=true]').focus();
  await page.keyboard.press('Control+z');
  await until(
    async () =>
      (await invoke('skill_get', { id: skill.id })).contentMd === '本地旧正文',
  );
  check('远程正文仅预览，手动确认通过 CodeMirror 写入并支持 Ctrl+Z');
  try {
    const remote = await invoke('skill_fetch_remote', {
      url: 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md',
    });
    assert(remote.startsWith('---') && remote.includes('name: pdf'));
    check('真实 GitHub blob 转 raw 内容拉取', {
      bytes: Buffer.byteLength(remote),
      url: 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md',
    });
  } catch (e) {
    results.push({
      name: '真实 GitHub 拉取',
      status: 'not_run',
      reason: String(e).replaceAll(key, '[REDACTED]'),
    });
  }
  await go('/ideas');
  await page.locator('.idea-calendar summary').click();
  await page.getByRole('button', { name: new RegExp(`${today()}，`) }).click();
  assert((await page.url()).includes(`date=${today()}`));
  await until(async () =>
    (await invoke('idea_calendar', { month: today().slice(0, 7) })).some(
      (d) => d.date === today() && d.count >= 2,
    ),
  );
  check('月历真实计数与日期路由筛选');
  const hits = await invoke('search_query', {
    q: `tag:${marker} type:prompt 提示`,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, prompt.id);
  check('标签、类型与关键词组合查询');
  await go('/settings/appearance');
  await page.getByLabel('编辑器字体大小', { exact: true }).fill('18');
  await page.getByLabel('编辑器字体大小', { exact: true }).blur();
  await until(
    async () => (await invoke('settings_get_all')).editorFontSize === 18,
  );
  await go(`/prompts/${prompt.id}`);
  await page.locator('.cm-content').waitFor();
  await until(
    async () =>
      (await page
        .locator('.cm-editor')
        .evaluate((e) => getComputedStyle(e).fontSize)) === '18px',
  );
  assert.equal(
    await page
      .locator('.cm-editor')
      .evaluate((e) => getComputedStyle(e).fontSize),
    '18px',
  );
  check('字体大小设置同步到 CodeMirror');
  await invoke('settings_set', { key: 'appearance.theme', value: 'dark' });
  await go('/settings/data');
  await page.getByRole('button', { name: '立即备份', exact: true }).click();
  await until(async () => (await invoke('backup_list')).length > 0);
  await page.screenshot({
    path: path.join(root, 'docs/evidence/batch3-backups-dark.png'),
  });
  const exportDir = path.join(dir, 'markdown');
  fs.mkdirSync(exportDir);
  await pickFolder(exportDir);
  await page
    .getByRole('button', { name: '导出 Markdown 文件夹', exact: true })
    .click();
  await restorePicker();
  await until(async () => fs.existsSync(path.join(exportDir, '待办.md')));
  assert(fs.existsSync(path.join(exportDir, '灵感', `${today()}.md`)));
  check('数据设置立即备份与 Markdown 树导出（文件选择器边界模拟）');
  const file = path.join(dir, 'v2.json');
  await invoke('data_export_json', { path: file });
  const v2 = JSON.parse(fs.readFileSync(file));
  assert.equal(v2.formatVersion, 1);
  assert.equal(v2.schemaVersion, 2);
  assert(
    v2.data.promptVersions.length > 0 &&
      v2.data.aiConversations.length > 0 &&
      v2.data.aiMessages.length > 0,
  );
  assert(!fs.readFileSync(file).includes(Buffer.from(key)));
  await invoke('data_import_json', { path: file, mode: 'overwrite' });
  await invoke('data_import_json', { path: file, mode: 'merge' });
  await invoke('data_export_json', { path: path.join(dir, 'after.json') });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(dir, 'after.json'))).data,
    v2.data,
  );
  check('schemaVersion=2 完整覆盖往返和无重复合并，三张新表及 Key 防泄漏');
  const v1 = structuredClone(v2);
  v1.schemaVersion = 1;
  for (const k of ['promptVersions', 'aiConversations', 'aiMessages'])
    delete v1.data[k];
  for (const todo of v1.data.todos) {
    delete todo.remind_at;
    delete todo.reminded_at;
  }
  v1.data.prompts = v1.data.prompts.filter(
    (p) => !['breakdown_todos', 'daily_summary'].includes(p.template_key),
  );
  const legacy = path.join(dir, 'v1.json');
  fs.writeFileSync(legacy, JSON.stringify(v1));
  await invoke('data_import_json', { path: legacy, mode: 'overwrite' });
  await invoke('data_export_json', { path: path.join(dir, 'upgraded.json') });
  const upgraded = JSON.parse(fs.readFileSync(path.join(dir, 'upgraded.json')));
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.data.aiMessages.length, 0);
  assert.equal(upgraded.data.ideas.length, v2.data.ideas.length);
  check('真实 IPC 导入 schemaVersion=1 旧备份并补齐 v2 默认字段与模板');
  const afterSnapshot = await invoke('idea_create', {
    contentMd: `${marker} 快照之后`,
    date: today(),
  });
  await go('/settings/data');
  await page
    .getByRole('button', { name: '从备份恢复', exact: true })
    .first()
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认', exact: true })
    .click();
  await until(async () => app.exitCode !== null);
  if (browser) await browser.close().catch(() => {});
  await pause(700);
  await connect();
  const restored = await invoke('prompt_version_list', { id: prompt.id });
  assert(restored.length >= 3);
  assert(
    (await invoke('ai_conversation_get', { id: conversation.id }).catch(
      () => null,
    )) === null,
  ); // The deleted conversation remains a tombstone in full export.
  assert(
    !(await invoke('idea_list', { offset: 0 })).items.some(
      (i) => i.id === afterSnapshot.id,
    ),
  );
  await invoke('data_export_json', { path: path.join(dir, 'restored.json') });
  const restoredData = JSON.parse(
    fs.readFileSync(path.join(dir, 'restored.json')),
  ).data;
  assert(restoredData.aiMessages.length > 0);
  check('设置页确认恢复、Tauri 重启、开库前替换与历史表恢复');
  assert(
    authorizations.every(Boolean),
    'Authorization fixture validation failed',
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));
  check('原生主 WebView 无页面异常和控制台 error/warning');
} catch (error) {
  results.push({
    name: '批次 3 原生验收中断',
    status: 'failed',
    error: String(error).replaceAll(key, '[REDACTED]'),
  });
  console.error(String(error).replaceAll(key, '[REDACTED]'));
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(root, 'docs/evidence/batch3-failure.png') })
      .catch(() => {});
} finally {
  if (page && providerId)
    await invoke('provider_delete', { id: providerId }).catch(() => {});
  await stop();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.writeFileSync(
    path.join(root, 'docs/evidence/batch3-native.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        environment:
          'Windows release WebView2; real Rust/SQLite/keyring; local AI fixture; Browser plugin not available',
        results,
      },
      null,
      2,
    ),
  );
}
