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
  popup/
    popup.js                 # 主界面入口（4487 行，持续重构中）
    modules/                 # 功能模块（模块化重构进行中）
      keyboard.js            # 全局快捷键 + 键盘导航（已集成）
      context-menu.js        # 右键菜单管理（已集成）
      dialog.js              # 对话框管理
      drag-drop.js           # 拖拽排序
      search.js              # 搜索管理
      bookmarks.js           # 书签操作
      folder-manager.js      # 文件夹管理
      link-checker.js        # 链接检测
      navigation.js          # 导航管理
      ai-analysis.js         # AI 分析
      state.js               # 状态管理
    utils/
      event-bus.js           # 事件总线（模块间通信）
      helpers.js             # 工具函数
  content/collector.js       # 内容脚本，注入所有页面采集信息
  db/indexeddb.js            # IndexedDB 封装（SmartBookmarksDB v2）
  api/openai.js              # OpenAI 兼容接口，分批调用
  ui/components.js           # 通用 UI 组件（ProgressBar/Toast/etc.）
  ui/renderers.js            # 业务渲染器（TreeRenderer/SearchResultsRenderer）
  options/options.js         # 设置页面（API 配置）
```

**通信模式**：
- popup ↔ background: `chrome.runtime.sendMessage`
- 模块间通信: `eventBus`（发布-订阅模式）
- popup 通过 eventBus 监听模块事件并响应

## 模块化架构（重构进行中）

### 设计原则

1. **事件驱动**：模块通过 eventBus 发送事件，popup.js 监听并处理
   ```javascript
   // 模块发送事件
   eventBus.emit(Events.CONTEXT_MENU_ACTION, { action, item });

   // popup.js 监听
   eventBus.on(Events.CONTEXT_MENU_ACTION, ({ action, item }) => {
     handleContextMenuAction(action);
   });
   ```

2. **松耦合**：模块不直接依赖 popup.js，通过事件通信
3. **单向依赖**：模块 → eventBus ← popup.js
4. **保留 HTML 原始结构**：模块不覆盖 popup.html 中的元素，避免丢失关键属性

### 已集成模块

| 模块 | 功能 | 减少代码 | 状态 |
|------|------|---------|------|
| keyboard.js | 全局快捷键 + 键盘导航 | -41 行 | ✅ 完成 |
| context-menu.js | 右键菜单管理 | -104 行 | ✅ 完成 |

**总计减少**: 145 行（从 4632 → 4487）

### 模块集成检查清单

集成新模块时必须检查：
- [ ] 模块是否覆盖 HTML 中的关键属性（如 `data-for-sidebar-only`）
- [ ] 事件监听器是否会与原生事件冲突
- [ ] 是否需要禁用模块的 `_render()` 方法
- [ ] 事件常量是否使用 `Events` 而不是 `eventBus.Events`

### eventBus 事件分类

```javascript
// 书签事件
BOOKMARKS_LOADED, BOOKMARK_ADDED, BOOKMARK_UPDATED, BOOKMARK_DELETED

// 导航事件
NAVIGATION_CHANGED, FOLDER_SELECTED, BREADCRUMB_CHANGED

// 搜索事件
SEARCH_PERFORMED, SEARCH_CLEARED, SEARCH_RESULTS_UPDATED

// AI 分析事件
ANALYSIS_STARTED, ANALYSIS_PROGRESS, ANALYSIS_COMPLETED

// UI 事件
CONTEXT_MENU_ACTION, KEYBOARD_ACTION, DIALOG_OPENED, DIALOG_CLOSED

// 拖拽事件
DRAG_STARTED, DRAG_ENDED, BOOKMARK_REORDERED
```

## 关键技术约定

### 代码风格
- **ES Module**：所有文件使用 `import/export`，`manifest.json` 声明 `"type": "module"`
- **事件常量导入**：`import eventBus, { Events } from './utils/event-bus.js'`
- **异步**：全面使用 `async/await`；IndexedDB 回调统一用 `new Promise` 封装
- **状态管理**：`popup.js` 顶层单一 `const state = {}` 对象，不使用框架
- **组件**：Class-based，构造接受 `container` DOM 元素，暴露 `create()`/`update()`/`show()`/`hide()`
- **重试机制**：网络请求用 `fetchWithRetry(fn, MAX_RETRIES=3)` 指数退避（基数 1000 ms）

### 数据库
- 数据库名：`SmartBookmarksDB`，当前版本 **v2**
- Store 名称使用 `STORES` 常量（见 `src/db/indexeddb.js`）
- Schema 变更必须通过 `src/db/migration.js` 的 `MIGRATIONS` 表添加新版本迁移函数
- stores: `bookmarks` / `categories` / `tags` / `metadata` / `sync_log`

### 状态管理
- 集中式状态对象：`popup.js` 顶层单一 `const state = {}`
- 可选模块化状态管理：`modules/state.js` 提供响应式更新
- 状态更新通过事件通知 UI 刷新（如 `Events.STATE_CHANGED`）
- 避免直接修改嵌套属性，使用展开运算符创建新对象

### AI API 集成
- 见 `src/api/openai.js`：OpenAI 兼容接口，分批处理（默认 `batchSize=10`）
- 进度回调签名：`onProgress(current, total, message)`
- `parseAIJSON()` 兼容 ```json 和 markdown 代码块响应
- API 配置（`apiUrl`/`apiKey`/`model`）由用户在 Options 页设置，运行时从 `chrome.storage` 读取

### 长任务处理
- **取消令牌**：后台长任务（链接检测、AI分析）通过 `currentCheckCancelToken` / `currentAnalysisCancelToken` 支持中途取消
- **进度暂存**：检测/分析进度暂存于 `chrome.storage`，popup 关闭重新打开后可恢复
- **失效链接**：检测结果写入 bookmark 的 `status` 字段（valid/invalid/uncertain），失效书签移至"待清理"分类

## 重构注意事项

### 常见陷阱

1. **HTML 元素覆盖**
   ```javascript
   // ❌ 错误：覆盖 HTML 中的原始菜单项
   this.menuElement.innerHTML = this._renderMenuItems();

   // ✅ 正确：保留 HTML 原始结构
   // 不调用 _renderMenu()，使用 popup.html 中的原始菜单
   ```

2. **事件监听器冲突**
   ```javascript
   // ❌ 错误：document contextmenu 监听器会与右键点击冲突
   document.addEventListener('contextmenu', (e) => {
     if (this.isVisible) this.hide();
   });

   // ✅ 正确：只监听点击外部关闭
   document.addEventListener('click', (e) => {
     if (this.isVisible && !this.menuElement.contains(e.target)) {
       this.hide();
     }
   });
   ```

3. **事件常量使用错误**
   ```javascript
   // ❌ 错误：Events 不是 eventBus 的属性
   eventBus.emit(eventBus.Events.CONTEXT_MENU_ACTION, data);

   // ✅ 正确：导入 Events 常量
   import eventBus, { Events } from './utils/event-bus.js';
   eventBus.emit(Events.CONTEXT_MENU_ACTION, data);
   ```

4. **无限递归**
   ```javascript
   // ❌ 错误：箭头函数调用自身
   this._handleKeyboard = (e) => this._handleKeyboard(e);

   // ✅ 正确：创建独立的处理器
   this._handleKeyboardHandler = (e) => this._handleKeyboard(e);
   ```

## 调试与测试

### 模块测试
```bash
# 在扩展主界面的控制台中运行：
import './src/popup/test-modules.js';
```

### 调试技巧
1. **查看所有事件**
   ```javascript
   import eventBus from './src/popup/utils/event-bus.js';
   eventBus.eventNames(); // 查看所有已注册事件
   ```

2. **监听事件数量**
   ```javascript
   eventBus.listenerCount('bookmarks:loaded');
   ```

3. **状态快照**
   ```javascript
   import state from './src/popup/modules/state.js';
   state.snapshot(); // 返回当前状态的深拷贝
   ```

### 关键待办（P0 - 阻塞发布）
- **SYNC_BOOKMARKS 实现**：`background.js` 中 `handleSyncBookmarks()` 函数体为空
- **deleteBookmark 删除 API**：`popup.js` 中删除书签功能实际无效
- **handleImport 导入落盘**：`popup.js` 中导入功能无效
- **浏览器加载测试**：在 Chrome/Edge 上完整走一遍核心流程确认无 JS 报错

详细信息见 `docs/TODO.md`

## UI 结构

- **主界面**：全屏标签页（`src/popup/popup.html`），非 popup 弹窗
- **布局**：左侧目录树 + 右侧主区域（书签列表/搜索结果）
- **任务面板**：右下角可展开，显示 AI 分析/链接检测进度
- **快捷键**：
  - `Ctrl+Shift+B` - 打开主界面
  - `Ctrl+K` / `Ctrl+F` - 聚焦搜索框
  - `Escape` - 关闭所有对话框/菜单
  - `F2` - 编辑选中项
  - `Delete` - 删除选中项
  - `方向键` - 导航列表/菜单

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
- `docs/flexible-integration-plan.md` - 模块集成执行计划
- `docs/react-rewrite-evaluation.md` - React 重写评估（已否决）
