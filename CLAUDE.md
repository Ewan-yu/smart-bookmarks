# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

智能收藏夹管理浏览器扩展（Chrome/Edge，Manifest V3），支持 AI 分类、失效链接检测、语义搜索。**无打包器**，源码直接被浏览器加载。

## 构建与加载

```bash
# 构建 CSS（Tailwind，唯一构建步骤）
npm run build

# 开发时监听 CSS 变化
npm run dev

# 加载扩展：chrome://extensions/ → 开发者模式 → 加载已解压扩展 → 选择项目根目录
```

## 核心架构

```
src/
  background/background.js   # Service Worker，处理消息、AI分析、链接检测
  popup/popup.js             # 主界面入口，集中 state 对象管理应用状态
  content/collector.js       # 内容脚本，注入所有页面采集信息
  db/indexeddb.js            # IndexedDB 封装（SmartBookmarksDB v2）
  api/openai.js              # OpenAI 兼容接口，分批调用
  ui/components.js           # 通用 UI 组件（ProgressBar/Toast/etc.）
  ui/renderers.js            # 业务渲染器（TreeRenderer/SearchResultsRenderer）
  utils/                     # bookmark-sync.js / link-checker.js / export.js
  search/                    # local-search.js / ai-search.js
  options/options.js         # 设置页面（API 配置）
```

**通信模式**：popup 通过 `chrome.runtime.sendMessage` 与 background 通信，不直接调用业务逻辑。

## 关键技术约定

### 代码风格
- **ES Module**：所有文件使用 `import/export`，`manifest.json` 声明 `"type": "module"`
- **异步**：全面使用 `async/await`；IndexedDB 回调统一用 `new Promise` 封装
- **状态管理**：`popup.js` 顶层单一 `const state = {}` 对象，不使用框架
- **组件**：Class-based，构造接受 `container` DOM 元素，暴露 `create()`/`update()`/`show()`/`hide()`
- **重试机制**：网络请求用 `fetchWithRetry(fn, MAX_RETRIES=3)` 指数退避（基数 1000 ms）

### 数据库
- 数据库名：`SmartBookmarksDB`，当前版本 **v2**
- Store 名称使用 `STORES` 常量（见 `src/db/indexeddb.js`）
- Schema 变更必须通过 `src/db/migration.js` 的 `MIGRATIONS` 表添加新版本迁移函数
- stores: `bookmarks` / `categories` / `tags` / `metadata` / `sync_log`

### AI API 集成
- 见 `src/api/openai.js`：OpenAI 兼容接口，分批处理（默认 `batchSize=10`）
- 进度回调签名：`onProgress(current, total, message)`
- `parseAIJSON()` 兼容 ```json 和 markdown 代码块响应
- API 配置（`apiUrl`/`apiKey`/`model`）由用户在 Options 页设置，运行时从 `chrome.storage` 读取

### 长任务处理
- **取消令牌**：后台长任务（链接检测、AI分析）通过 `currentCheckCancelToken` / `currentAnalysisCancelToken` 支持中途取消
- **进度暂存**：检测/分析进度暂存于 `chrome.storage`，popup 关闭重新打开后可恢复
- **失效链接**：检测结果写入 bookmark 的 `status` 字段（valid/invalid/uncertain），失效书签移至"待清理"分类

## 待办重点（按 TODO.md）

### P0 - 阻塞发布
- `SYNC_BOOKMARKS` 消息处理函数体为空，需实现将本地 DB 数据写回浏览器收藏夹 API
- 在 Chrome/Edge 上完整走一遍核心流程确认无 JS 报错

### P1 - 重要优化
- `deleteBookmark()` 的 onConfirm 回调中 `// TODO: 调用删除 API` 尚未实现
- `handleImport()` 读取文件后 `// TODO: 导入数据到数据库` 尚未实现
- `handleGetBookmarks()` 返回 `tags: []` 硬编码，需从 DB 查询实际标签
- 搜索降级策略：未配置 AI 时 smartSearch 调用 AI 搜索会失败，需确认降级到本地搜索

### P2 - 功能增强
- 单条链接检测 `checkSingleLink()` 标注为 TODO
- 分类/标签管理 CRUD（新建/编辑/删除/拖拽排序）
- 定期自动检测（Alarm API 代码已存在但未暴露 UI）

## UI 结构

- **主界面**：全屏标签页（`src/popup/popup.html`），非 popup 弹窗
- **布局**：左侧目录树 + 右侧主区域（书签列表/搜索结果）
- **任务面板**：右下角可展开，显示 AI 分析/链接检测进度
- **快捷键**：`Ctrl+Shift+B` 打开主界面

## CSS 开发

- 入口：`src/popup/tailwind.input.css`
- 输出：`src/popup/tailwind.css`（由 Tailwind CLI 生成）
- **勿直接修改** `tailwind.css`，会被覆盖
- UI 组件使用 Tailwind 类名，自定义样式写在 `<style>` 标签中

## 文档参考

- `docs/TODO.md` - 详细待办清单和已知问题
- `docs/需求设计说明书.md` - 产品需求
- `docs/AI分类设计文档.md` - AI 功能设计
- `docs/UI重设计方案.md` - UI 架构说明
