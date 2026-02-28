# Smart Bookmarks - AI Agent Instructions

## 项目概述

浏览器扩展插件（Manifest V3），实现智能收藏夹管理，含 AI 分类、失效链接检测、语义搜索。**无打包器**，源码直接被浏览器加载（ES Modules）。

## 架构

```
src/
  background/background.js   # Service Worker，处理消息、AI分析、链接检测
  popup/popup.js             # 主界面入口，集中state对象管理状态
  content/collector.js       # 内容脚本，注入所有页面采集信息
  db/indexeddb.js            # IndexedDB封装（SmartBookmarksDB v2）
  api/openai.js              # OpenAI兼容接口，分批调用
  ui/components.js           # 通用UI组件（ProgressBar/Toast/etc.）
  ui/renderers.js            # 业务渲染器（TreeRenderer/SearchResultsRenderer）
  utils/                     # bookmark-sync.js / link-checker.js / export.js
  options/options.js         # 设置页面（API配置）
```

**通信模式**：popup 通过 `chrome.runtime.sendMessage` 与 background 通信，不直接调用业务逻辑。

## 代码风格

- **ES Module**：所有文件使用 `import/export`，`manifest.json` 声明 `"type": "module"`
- **异步**：全面使用 `async/await`；IndexedDB 回调统一用 `new Promise` 封装
- **状态管理**：`popup.js` 顶层单一 `const state = {}` 对象，不使用框架
- **组件**：Class-based，构造接受 `container` DOM 元素，暴露 `create()`/`update()`/`show()`/`hide()`
- **注释**：关键函数添加 JSDoc `@param`/`@returns`
- **重试**：网络请求用 `fetchWithRetry(fn, MAX_RETRIES=3)` 指数退避（基数 1000 ms）

## 构建命令

```bash
# 仅构建 CSS（Tailwind，唯一的构建步骤）
npm run build

# 开发时监听 CSS 变化
npm run dev
```

CSS 入口：[src/popup/tailwind.input.css](../src/popup/tailwind.input.css)，输出：`src/popup/tailwind.css`。  
**加载扩展**：`chrome://extensions/` → 开发者模式 → 加载已解压 → 选择项目根目录。无需其他打包步骤。

## 数据库约定

- DB：`SmartBookmarksDB`，当前版本 **v2**
- Store 名称使用 `STORES` 常量（见 [src/db/indexeddb.js](../src/db/indexeddb.js)）
- Schema 变更必须通过 [src/db/migration.js](../src/db/migration.js) 的 `MIGRATIONS` 表添加新版本迁移函数

## AI API 集成

- 见 [src/api/openai.js](../src/api/openai.js)：OpenAI 兼容接口，分批（默认 `batchSize=10`）
- 进度回调签名：`onProgress(current, total, message)`
- `parseAIJSON()` 兼容 `<think>…</think>` 和 markdown 代码块响应
- API 配置（`apiUrl`/`apiKey`/`model`）由用户在 Options 页设置，运行时从 `chrome.storage` 读取

## 关键约定

- **取消令牌**：后台长任务（链接检测）通过 `currentCheckCancelToken` 字段支持中途取消，新任务开始前重置
- **失效链接**：检测结果写入 bookmark 的 `status` 字段，失效书签移至"待清理"分类
- **popup 不直接操作 DOM**：通过 `renderers.js` 中的渲染器实例间接更新视图
- **快捷键**：`Ctrl+Shift+B` 打开插件主界面（全屏标签页，非 popup 弹窗）
