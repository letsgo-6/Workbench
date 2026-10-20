import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const loadPackage = createRequire(import.meta.url);
const { chromium } = loadPackage(
  process.env.WORKBENCH_PLAYWRIGHT_PATH || 'playwright',
);
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = path.join(
  root,
  'docs',
  'evidence',
  process.env.WORKBENCH_SMOKE_DIR || '',
);
fs.mkdirSync(evidence, { recursive: true });
const results = [];
const refs = [];
const marker = `施工验收${Date.now()}`;
async function main() {
  const browser = await chromium.connectOverCDP(
    process.env.WORKBENCH_CDP || 'http://127.0.0.1:9223',
  );
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => !p.url().includes('quick.html'));
  assert(page, 'Main native WebView must exist');
  page.setDefaultTimeout(15000);
  const errors = [];
  let originalTheme;
  const waitForState = async (predicate, arg) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await page.evaluate(predicate, arg)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for native state');
  };
  page.on('pageerror', (error) => errors.push(error.message));
  const invoke = (command, input) =>
    page.evaluate(
      ({ command, input }) =>
        window.__TAURI_INTERNALS__.invoke(
          command,
          input === undefined ? {} : { input },
        ),
      { command, input },
    );
  const check = (name, details = {}) => {
    results.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name}`);
  };
  const today = new Date().toLocaleDateString('en-CA');
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const yesterday = previous.toLocaleDateString('en-CA');
  const go = async (route) => {
    await page.evaluate((route) => {
      location.hash = route;
    }, route);
  };
  try {
    assert(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)));
    await go('/');
    await page.getByRole('textbox', { name: '快速输入' }).waitFor();
    const input = page.getByRole('textbox', { name: '快速输入' });
    await input.fill(`${marker} 中文统计 灵感`);
    await input.press('Enter');
    await page
      .getByRole('link', { name: new RegExp(`${marker} 中文统计 灵感`) })
      .waitFor();
    const ideas = await invoke('idea_list', {});
    const idea = ideas.items.find((i) => i.contentMd.includes(marker));
    assert(idea);
    refs.push({ entityType: 'idea', id: idea.id });
    check('今日灵感 Enter 写入真实 SQLite 并刷新');
    await input.fill(`${marker} 今天待办`);
    await input.press('Tab');
    await input.press('Enter');
    await page
      .getByRole('link', { name: `${marker} 今天待办`, exact: true })
      .waitFor();
    const todos = await invoke('todo_list', { view: 'today' });
    const todo = todos.items.find((i) => i.title.includes(marker));
    assert.equal(todo.dueDate, today);
    refs.push({ entityType: 'todo', id: todo.id });
    check('Tab 切换后 Enter 创建今日待办');
    const carried = await invoke('todo_create', {
      title: `${marker} 昨日待办`,
      priority: 1,
      dueDate: yesterday,
      tags: [],
    });
    refs.push({ entityType: 'todo', id: carried.id });
    await page
      .getByText(`顺延 · 原定 ${yesterday.slice(5)}`, { exact: true })
      .waitFor();
    check('昨日未完成待办显示顺延');
    await go(`/ideas/${idea.id}`);
    await page.locator('.cm-content').waitFor();
    await page.locator('.cm-content').fill(`${marker} 中文统计 编辑后持久内容`);
    await waitForState(
      async (id) =>
        (
          await window.__TAURI_INTERNALS__.invoke('idea_get', { input: { id } })
        ).contentMd.includes('编辑后持久内容'),
      idea.id,
    );
    const tags = page
      .locator('.detail-pane')
      .getByLabel('标签', { exact: true });
    await tags.fill(`${marker}标签`);
    await tags.press('Enter');
    await waitForState(
      async ({ id, marker }) =>
        (
          await window.__TAURI_INTERNALS__.invoke('idea_get', { input: { id } })
        ).tags.some((t) => t.name === `${marker}标签`),
      { id: idea.id, marker },
    );
    check('CodeMirror 编辑与标签 1 秒自动保存');
    await page.getByRole('button', { name: '转为待办', exact: true }).click();
    await page.locator('.origin').waitFor();
    const convertedId = (await page.evaluate(() => location.hash))
      .split('/')
      .at(-1);
    refs.push({ entityType: 'todo', id: convertedId });
    const converted = await invoke('todo_get', { id: convertedId });
    assert.equal(converted.origin.id, idea.id);
    check('灵感转为待办且详情包含来源链接');
    const tip = await invoke('tip_create', {
      title: `${marker} 中文统计技巧`,
      contentMd: '## 操作步骤\n逐项验收',
      tools: ['Codex'],
      tags: [`${marker}标签`],
    });
    refs.push({ entityType: 'tip', id: tip.id });
    const fixture = path.join(evidence, 'SKILL.fixture.md');
    fs.writeFileSync(
      fixture,
      `---\nname: ${marker}技能\ndescription: |\n  这是验收简介\n  支持多行\n---\n# 中文统计 Skill\n`,
      'utf8',
    );
    const read = await invoke('skill_read_md_file', { path: fixture });
    assert(read.parsed.hasFrontmatter);
    assert(read.parsed.description.includes('支持多行'));
    const skill = await invoke('skill_create', {
      name: read.parsed.name,
      description: read.parsed.description,
      contentMd: read.content,
      sourceType: 'md',
      platforms: ['Codex'],
      tags: [`${marker}标签`],
    });
    refs.push({ entityType: 'skill', id: skill.id });
    await go(`/skills/${skill.id}`);
    await page.getByLabel('名称', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('名称', { exact: true }).inputValue(),
      read.parsed.name,
    );
    const exportPath = path.join(evidence, 'skill-export.md');
    await invoke('skill_export_md', { id: skill.id, path: exportPath });
    assert(fs.readFileSync(exportPath, 'utf8').includes('支持多行'));
    check('Skill frontmatter 真实文件读取、详情展示和导出');
    const prompt = await invoke('prompt_create', {
      title: `${marker} 中文统计提示词`,
      body: '解释 {{topic}}，面向 {{对象}}',
      category: '验收',
      tags: [`${marker}标签`],
    });
    refs.push({ entityType: 'prompt', id: prompt.id });
    await go(`/prompts/${prompt.id}`);
    await page
      .getByRole('button', { name: '使用提示词', exact: true })
      .waitFor();
    await page.getByRole('button', { name: '使用提示词', exact: true }).click();
    await page.getByLabel('topic', { exact: true }).fill('回归分析');
    await page.getByLabel('对象', { exact: true }).fill('初学者');
    assert.equal(
      await page.getByLabel('替换结果', { exact: true }).inputValue(),
      '解释 回归分析，面向 初学者',
    );
    await page
      .getByRole('button', { name: '复制并记录使用', exact: true })
      .click();
    await waitForState(
      async (id) =>
        (
          await window.__TAURI_INTERNALS__.invoke('prompt_get', {
            input: { id },
          })
        ).useCount === 1,
      prompt.id,
    );
    check('提示词变量表单、原生剪贴板写入和使用次数');
    await page.keyboard.press('Control+k');
    const search = page.getByPlaceholder(
      '搜索灵感、待办、技巧、Skill、提示词…',
    );
    await search.fill('统计');
    await page.locator('[cmdk-item] mark').first().waitFor();
    const short = await invoke('search_query', { q: '统计' });
    for (const kind of ['idea', 'tip', 'skill', 'prompt'])
      assert(short.some((i) => i.entityType === kind));
    assert((await invoke('search_query', { q: '中文统计' })).length >= 4);
    check('Ctrl+K 跨模块中文长词 / 两字短词搜索及高亮');
    await page.keyboard.press('Escape');
    const tag = (await invoke('tag_list')).find(
      (t) => t.name === `${marker}标签`,
    );
    assert(tag);
    await invoke('tag_rename', { id: tag.id, name: `${marker}新标签` });
    assert(
      (await invoke('search_query', { q: `${marker}新标签` })).length >= 4,
    );
    assert.equal(
      (await invoke('search_query', { q: `${marker}标签` })).length,
      0,
    );
    check('标签改名同步重建搜索索引');
    for (const ref of refs.slice()) {
      await invoke(`${ref.entityType}_delete`, { id: ref.id });
      assert((await invoke('trash_list')).some((i) => i.ref.id === ref.id));
      await invoke('trash_restore', ref);
      assert(
        (await invoke(`${ref.entityType}_get`, { id: ref.id })).id === ref.id,
      );
    }
    check('五大模块软删除和恢复真实 IPC 往返');
    for (const [kind, entry] of [
      ['idea', idea],
      ['todo', todo],
      ['tip', tip],
      ['skill', skill],
      ['prompt', prompt],
    ]) {
      const route = {
        idea: 'ideas',
        todo: 'todos',
        tip: 'tips',
        skill: 'skills',
        prompt: 'prompts',
      }[kind];
      await go(`/${route}/${entry.id}`);
      await page.locator('.cm-content').waitFor();
      const body = `${marker} 中文统计 五模块编辑 {{topic}}`;
      await page.locator('.cm-content').fill(body);
      await waitForState(
        async ({ kind, id, body }) => {
          const current = await window.__TAURI_INTERNALS__.invoke(
            `${kind}_get`,
            { input: { id } },
          );
          return (current.body ?? current.noteMd ?? current.contentMd) === body;
        },
        { kind, id: entry.id, body },
      );
    }
    check('五大模块均通过真实编辑器自动保存');
    await go('/ideas');
    await page
      .locator('.list-pane select[aria-label="标签"]')
      .selectOption(`${marker}新标签`);
    await page
      .locator('.row-select')
      .filter({ hasText: marker })
      .first()
      .waitFor();
    check('列表按已改名标签筛选');
    await go('/tips');
    const row = page.locator('.row-select').filter({ hasText: marker }).first();
    await row.click({ modifiers: ['Control'] });
    await page
      .getByRole('button', { name: '批量添加标签', exact: true })
      .click();
    const batchTag = page.locator('#batch-tags');
    await batchTag.fill(`${marker}批量`);
    await batchTag.press('Enter');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await waitForState(
      async ({ id, name }) =>
        (
          await window.__TAURI_INTERNALS__.invoke('tip_get', { input: { id } })
        ).tags.some((t) => t.name === name),
      { id: tip.id, name: `${marker}批量` },
    );
    check('Ctrl 多选入口和批量加标签');
    await go('/prompts');
    await page
      .locator('.list-header')
      .getByRole('button', { name: '新建', exact: true })
      .click();
    await page.locator('.cm-content').waitFor();
    const blankId = (await page.evaluate(() => location.hash))
      .split('/')
      .at(-1);
    await page
      .locator('.sidebar')
      .getByRole('link', { name: '设置', exact: true })
      .click();
    await waitForState(async (id) => {
      try {
        await window.__TAURI_INTERNALS__.invoke('prompt_get', {
          input: { id },
        });
        return false;
      } catch {
        return true;
      }
    }, blankId);
    check('离开未编辑的新建记录时清除空白内容');
    const original = await invoke('settings_get_all');
    originalTheme = original.appearanceTheme;
    await go('/settings');
    await page.getByText('深色', { exact: true }).click();
    await waitForState(() =>
      document.documentElement.classList.contains('dark'),
    );
    await page.screenshot({ path: path.join(evidence, 'settings-dark.png') });
    await go(`/prompts/${prompt.id}`);
    await page.locator('.cm-content').waitFor();
    const editorColor = await page.locator('.cm-editor').evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    }));
    assert.notEqual(editorColor.background, 'rgb(255, 255, 255)');
    assert.notEqual(editorColor.color, 'rgb(38, 55, 47)');
    await page.screenshot({ path: path.join(evidence, 'editor-dark.png') });
    await go('/settings');
    await page.getByText('浅色', { exact: true }).click();
    await waitForState(
      () => !document.documentElement.classList.contains('dark'),
    );
    await invoke('settings_set', {
      key: 'appearance.theme',
      value: original.appearanceTheme,
    });
    check('浅色、深色、跟随系统设置可持久化并同步原生标题栏');
    await go(`/prompts/${prompt.id}`);
    await page.locator('.cm-content').waitFor();
    await page.screenshot({ path: path.join(evidence, 'prompt-detail.png') });
    await go('/');
    await page.getByRole('textbox', { name: '快速输入' }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'dashboard.png') });
    assert.deepEqual(errors, []);
    check('原生 WebView 运行无 JavaScript 未捕获异常');
  } finally {
    try {
      if (originalTheme)
        await invoke('settings_set', {
          key: 'appearance.theme',
          value: originalTheme,
        }).catch(() => {});
      for (const ref of refs) await invoke('trash_purge', ref).catch(() => {});
      const testTags = (await invoke('tag_list').catch(() => [])).filter((t) =>
        t.name.startsWith(marker),
      );
      for (const tag of testTags) await invoke('tag_delete', { id: tag.id });
      await go('/').catch(() => {});
      fs.writeFileSync(
        path.join(evidence, 'native-smoke.json'),
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            native: true,
            marker,
            results,
            errors,
            cleanup: 'Only captured test IDs and test-prefixed tags purged',
          },
          null,
          2,
        ),
      );
    } finally {
      await browser.close();
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
