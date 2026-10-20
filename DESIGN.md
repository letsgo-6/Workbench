---
colors:
  primary: '#305f4e'
  background: '#fcfbf8'
  foreground: '#26372f'
  sidebar: '#f0f1e9'
  border: '#dfe3d9'
  muted-foreground: '#657167'
typography:
  heading:
    fontFamily: 'Segoe UI, Microsoft YaHei UI, PingFang SC, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Segoe UI, Microsoft YaHei UI, PingFang SC, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.65
rounded:
  control: '7px'
  capture: '12px'
spacing:
  field: '20px'
  page: '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.control}'
    height: '36px'
---

## Overview

Operate 模式：供个人每天捕捉、检索与编辑内容。界面用暖白纸面、松绿色活动状态和稳定三栏组织信息。
实际依据为 `src/styles/globals.css`、shadcn 基础组件及发布版原生窗口截图。

## Colors

浅色以 `#fcfbf8` 为主面、`#f0f1e9` 为侧栏、`#305f4e` 为操作色。
深色对应主面 `#1c2521`、文字 `#e4e9e1`、操作色 `#91c6a7`。
所有业务组件使用语义 CSS 变量，编辑器沿用这些变量。

## Typography

使用系统中文字体；页面标题 26px，列表标题 22px，区段标题 17px，正文 14px。
编辑与预览区最大 74ch。辅助时间与统计使用等宽数字。

## Layout

侧栏 218px，可折叠为 76px；列表与详情可拖拽调宽，列表至少 280px、详情至少 360px。
桌面主界面最小宽度 980px。1100px 以下压缩页面边距，当前未交付移动端布局。
批次 2 增加右侧 AI 抽屉，沿用语义颜色与单像素边界；结果预览和原文并列，明确提示写回需点击。快速记录使用独立轻量窗口与短键盘提示。设置按外观、模型、模板、快捷键、数据、通用分组。

## Elevation & Depth

常驻界面主要用单像素分隔线与表面颜色区分层次；上下文菜单和模态框使用轻阴影。

## Shapes

控件半径 5–7px，快速输入与技巧卡片 12px。标签使用紧凑胶囊。

## Components

基础控件来自 shadcn Radix；按钮采用内建 variant 与 size。
列表具备选中、星标、多选和键盘焦点状态。详情明确显示保存中、已保存与失败重试。
空态提供新建入口；删除进入回收站，彻底删除要求确认。

## Do's and Don'ts

- 保持侧栏、列表、详情的位置稳定。
- 从本机真实数据派生数量和列表，不预填演示记录。
- 用集中中文文案、语义颜色和统一图标维护一致性。
- 后续批次功能在启用前不进入当前操作流程。
