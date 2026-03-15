# Smart Bookmarks 架构设计文档

## 1. 概述

Smart Bookmarks 采用**模块化架构**和**事件驱动通信模式**，将复杂功能拆分为独立的、可复用的模块。这种架构使得代码易于维护、测试和扩展。

### 1.1 核心设计原则

- **单一职责原则（SRP）**：每个模块只负责一个具体功能
- **开闭原则（OCP）**：对扩展开放，对修改封闭
- **依赖倒置原则（DIP）**：模块依赖抽象（事件），不依赖具体实现
- **接口隔离原则（ISP）**：模块间通过最小化的事件接口通信

### 1.2 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                     Presentation Layer                   │
│                  (UI Components/DOM)                     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                     Business Layer                       │
│                    (Feature Modules)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Bookmarks│  │ Search   │  │AI Analysis│  │ Checker│  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                     Service Layer                        │
│              (State Management/Event Bus)                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                     Data Layer                           │
│           (IndexedDB/Chrome Storage/API)                 │
└─────────────────────────────────────────────────────────┘
```

## 2. 模块化架构

### 2.1 模块分类

项目包含 **11 个业务模块**和 **3 个工具模块**：

#### 业务模块（`src/popup/modules/`）

| 模块 | 文件 | 职责 | 主要API |
|------|------|------|---------|
| **状态管理** | `state.js` | 集中式状态管理，响应式更新 | `get()`, `set()`, `subscribe()` |
| **书签管理** | `bookmarks.js` | 书签CRUD、加载、统计 | `load()`, `add()`, `update()`, `delete()` |
| **导航管理** | `navigation.js` | 侧边栏导航、文件夹选择 | `selectFolder()`, `navigateTo()` |
| **搜索功能** | `search.js` | 搜索输入、结果展示 | `performSearch()`, `clearSearch()` |
| **AI 分析** | `ai-analysis.js` | AI分类、进度跟踪 | `startAnalysis()`, `applyResults()` |
| **链接检测** | `link-checker.js` | 失效检测、断点续检 | `startCheck()`, `resumeCheck()` |
| **拖拽排序** | `drag-drop.js` | 拖拽移动、排序 | `handleDragStart()`, `handleDrop()` |
| **右键菜单** | `context-menu.js` | 右键菜单显示和操作 | `showMenu()`, `hideMenu()` |
| **键盘快捷键** | `keyboard.js` | 全局键盘事件 | `registerShortcut()`, `handleKey()` |
| **文件夹管理** | `folder-manager.js` | 文件夹CRUD、树结构 | `createFolder()`, `deleteFolder()` |
| **对话框管理** | `dialog.js` | 对话框显示和交互 | `showDialog()`, `closeDialog()` |

#### 工具模块（`src/popup/utils/`）

| 模块 | 文件 | 职责 |
|------|------|------|
| **事件总线** | `event-bus.js` | 发布-订阅模式，模块间通信 |
| **辅助函数** | `helpers.js` | 通用工具函数（格式化、转义等） |
| **常量定义** | `constants.js` | 全局常量（事件名、状态码等） |

### 2.2 模块初始化流程

```
应用启动 (popup.js)
    ↓
初始化工具模块 (eventBus, state)
    ↓
并行初始化业务模块
    ├─ bookmarks.init()
    ├─ navigation.init()
    ├─ search.init()
    ├─ ai-analysis.init()
    ├─ link-checker.init()
    ├─ drag-drop.init()
    ├─ context-menu.init()
    ├─ keyboard.init()
    ├─ folder-manager.init()
    └─ dialog.init()
    ↓
加载数据 (bookmarks.load())
    ↓
订阅事件，建立模块间连接
    ↓
渲染UI
```

## 3. 事件驱动通信

### 3.1 事件总线设计

事件总线（Event Bus）是实现模块间解耦的核心机制：

```javascript
class EventBus {
  // 订阅事件
  on(eventName, callback)

  // 取消订阅
  off(eventName, callback)

  // 发布事件
  emit(eventName, data)

  // 订阅一次性事件
  once(eventName, callback)
}
```

### 3.2 事件分类

项目定义了 **40+ 个标准事件**，分为以下类别：

#### 书签事件

```javascript
eventBus.Events.BOOKMARKS_LOADED       // 书签加载完成
eventBus.Events.BOOKMARK_ADDED         // 书签添加
eventBus.Events.BOOKMARK_UPDATED       // 书签更新
eventBus.Events.BOOKMARK_DELETED       // 书签删除
eventBus.Events.BOOKMARKS_DELETED      // 批量删除
```

#### 导航事件

```javascript
eventBus.Events.FOLDER_SELECTED        // 文件夹选择
eventBus.Events.NAVIGATION_CHANGED     // 导航变更
eventBus.Events.BREADCRUMB_CHANGED     // 面包屑变更
```

#### 搜索事件

```javascript
eventBus.Events.SEARCH_PERFORMED       // 执行搜索
eventBus.Events.SEARCH_CLEARED         // 清除搜索
eventBus.Events.SEARCH_RESULTS_UPDATED // 搜索结果更新
```

#### AI 分析事件

```javascript
eventBus.Events.ANALYSIS_STARTED       // 分析开始
eventBus.Events.ANALYSIS_PROGRESS      // 分析进度
eventBus.Events.ANALYSIS_COMPLETED     // 分析完成
eventBus.Events.ANALYSIS_CANCELLED     // 分析取消
```

#### 链接检测事件

```javascript
eventBus.Events.CHECK_STARTED          // 检测开始
eventBus.Events.CHECK_PROGRESS         // 检测进度
eventBus.Events.CHECK_COMPLETED        // 检测完成
eventBus.Events.CHECK_CANCELLED        // 检测取消
```

#### UI 事件

```javascript
eventBus.Events.DIALOG_OPENED          // 对话框打开
eventBus.Events.DIALOG_CLOSED          // 对话框关闭
eventBus.Events.CONTEXT_MENU_SHOWN     // 右键菜单显示
eventBus.Events.SIDEBAR_TOGGLED        // 侧边栏切换
```

#### 状态事件

```javascript
eventBus.Events.STATE_CHANGED          // 状态变更
eventBus.Events.ERROR_OCCURRED         // 错误发生
eventBus.Events.VIEW_CHANGED           // 视图变更
```

### 3.3 通信模式

#### 3.3.1 一对多通信（广播）

一个模块发布事件，多个模块订阅：

```javascript
// bookmarks.js 发布事件
eventBus.emit(eventBus.Events.BOOKMARK_ADDED, bookmark);

// 多个模块订阅
// navigation.js - 更新侧边栏计数
eventBus.on(eventBus.Events.BOOKMARK_ADDED, (bookmark) => {
  this.updateFolderCounts();
});

// search.js - 更新搜索索引
eventBus.on(eventBus.Events.BOOKMARK_ADDED, (bookmark) => {
  this.updateSearchIndex(bookmark);
});
```

#### 3.3.2 请求-响应模式

模块间通过事件进行请求和响应：

```javascript
// 发起请求
eventBus.emit(eventBus.Events.BOOKMARK_DELETED, { id: '123' });

// 等待响应
eventBus.once(eventBus.Events.BOOKMARK_DELETED, (response) => {
  if (response.success) {
    console.log('删除成功');
  }
});
```

#### 3.3.3 状态同步

多个模块监听同一状态变化：

```javascript
// 订阅状态变更
state.subscribe('selectedFolderId', (newId, oldId) => {
  console.log(`Folder changed: ${oldId} → ${newId}`);
});

// 更新状态
state.selectedFolderId = 'folder-456'; // 自动触发所有订阅者
```

## 4. 状态管理

### 4.1 状态结构

应用状态存储在 `state.js` 模块中：

```javascript
const state = {
  // 数据状态
  bookmarks: [],              // 所有书签
  categories: [],             // 所有分类
  tags: [],                   // 所有标签

  // 选择状态
  selectedFolderId: null,     // 当前选中的文件夹
  selectedBookmarkIds: [],    // 当前选中的书签

  // 导航状态
  currentView: 'all',         // 当前视图
  breadcrumb: [],             // 面包屑路径

  // 搜索状态
  searchQuery: '',            // 搜索关键词
  searchResults: [],          // 搜索结果
  isSearching: false,         // 是否正在搜索

  // 任务状态
  isAnalyzing: false,         // 是否正在分析
  isChecking: false,          // 是否正在检测
  isSyncing: false,           // 是否正在同步

  // 进度状态
  analysisProgress: {},       // 分析进度
  checkProgress: {},          // 检测进度

  // UI 状态
  sidebarExpanded: true,      // 侧边栏展开状态
  taskPanelExpanded: false,   // 任务面板展开状态
  isLoading: false,           // 加载状态
  loadError: null             // 加载错误
};
```

### 4.2 响应式状态更新

使用 Proxy 实现响应式状态：

```javascript
// 创建响应式代理
const state = new StateManager();

// 直接访问状态
console.log(state.bookmarks);

// 更新状态（自动触发订阅者）
state.bookmarks = [...newBookmarks];

// 或使用 API
state.set('bookmarks', newBookmarks);
```

### 4.3 状态订阅

```javascript
// 订阅单个状态
state.subscribe('selectedFolderId', (newValue, oldValue) => {
  console.log(`Folder changed: ${oldValue} → ${newValue}`);
});

// 订阅嵌套状态
state.subscribe('analysisProgress.current', (current) => {
  console.log(`Progress: ${current}`);
});

// 取消订阅
const unsubscribe = state.subscribe('bookmarks', callback);
unsubscribe(); // 取消订阅
```

### 4.4 状态持久化

部分状态会持久化到 `chrome.storage`：

```javascript
// 导出状态
const savedState = state.export();

// 保存到 chrome.storage
chrome.storage.local.set({ appState: savedState });

// 恢复状态
chrome.storage.local.get(['appState'], (result) => {
  state.import(result.appState);
});
```

## 5. 数据流

### 5.1 书签加载流程

```
用户打开应用
    ↓
navigation.js 初始化
    ↓
bookmarks.js 加载数据
    ↓
background.js 处理 GET_ALL_DATA
    ↓
从 IndexedDB 读取数据
    ↓
返回数据到 bookmarks.js
    ↓
emit BOOKMARKS_LOADED 事件
    ↓
navigation.js 更新侧边栏
search.js 更新搜索索引
```

### 5.2 搜索流程

```
用户输入搜索关键词
    ↓
search.js 监听输入事件
    ↓
emit SEARCH_PERFORMED 事件
    ↓
local-search.js 执行本地搜索
    ↓
emit SEARCH_RESULTS_UPDATED 事件
    ↓
search.js 渲染搜索结果
```

### 5.3 AI 分析流程

```
用户点击"一键分析"
    ↓
ai-analysis.js 检查配置
    ↓
emit ANALYSIS_STARTED 事件
    ↓
分批调用 OpenAI API
    ↓
emit ANALYSIS_PROGRESS 事件（每批）
    ↓
所有批次完成
    ↓
emit ANALYSIS_COMPLETED 事件
    ↓
dialog.js 显示结果对话框
    ↓
用户确认应用
    ↓
bookmarks.js 更新书签分类
```

### 5.4 链接检测流程

```
用户点击"失效检测"
    ↓
link-checker.js 检查是否有中断会话
    ↓
显示对话框：续检/重新检测
    ↓
emit CHECK_STARTED 事件
    ↓
并发检测链接（10个并发）
    ↓
每个链接检测完成
    ↓
emit CHECK_PROGRESS 事件
    ↓
更新书签状态到 DB
    ↓
所有链接检测完成
    ↓
emit CHECK_COMPLETED 事件
    ↓
显示结果：X个失效，Y个不确定
```

## 6. API 设计

### 6.1 模块 API 设计原则

1. **简洁性**：API 应简单易用，避免过度设计
2. **一致性**：同类操作使用相似的命名和参数
3. **可预测性**：相同输入应产生相同输出
4. **错误处理**：明确返回成功/失败状态

### 6.2 示例：Bookmarks API

```javascript
class BookmarkManager {
  // 数据加载
  async load(): Promise<Result>

  // CRUD 操作
  async add(bookmarkData): Promise<Result>
  async update(id, updates): Promise<Result>
  async delete(ids): Promise<Result>

  // 查询操作
  getAll(): Array<Bookmark>
  getById(id): Bookmark | null
  getByCategory(categoryId): Array<Bookmark>
  getByTag(tag): Array<Bookmark>
  search(searchTerm): Array<Bookmark>

  // 高级操作
  async moveToFolder(bookmarkId, targetFolderId): Promise<Result>
  async regenerateSummary(bookmarkId): Promise<Result>
  async reorder(draggedId, targetId): Promise<Result>

  // 统计操作
  getStats(): Statistics
}
```

### 6.3 跨模块通信 API

所有跨模块通信通过事件总线完成：

```javascript
// 发布事件
eventBus.emit(eventName, data);

// 订阅事件
eventBus.on(eventName, callback);

// 取消订阅
eventBus.off(eventName, callback);

// 一次性订阅
eventBus.once(eventName, callback);
```

## 7. 错误处理

### 7.1 错误传播

```
模块发生错误
    ↓
捕获异常 (try-catch)
    ↓
emit ERROR_OCCURRED 事件
    ↓
dialog.js 显示错误提示
    ↓
记录到控制台
```

### 7.2 错误事件

```javascript
eventBus.on(eventBus.Events.ERROR_OCCURRED, (error) => {
  console.error('Application error:', error);

  // 显示用户友好的错误提示
  showToast(error.message || '操作失败，请重试');
});
```

## 8. 性能优化

### 8.1 懒加载

非关键模块延迟加载：

```javascript
// 对话框模块按需加载
async function showDialog(type) {
  if (!dialogModule) {
    dialogModule = await import('./modules/dialog.js');
  }
  dialogModule.show(type);
}
```

### 8.2 防抖和节流

高频事件使用防抖和节流：

```javascript
// 搜索输入防抖（300ms）
debounce(this.handleSearchInput.bind(this), 300);

// 滚动事件节流（100ms）
throttle(this.handleScroll.bind(this), 100);
```

### 8.3 批量操作

大数据量操作分批处理：

```javascript
// AI 分析分批处理（每批10条）
const batchSize = 10;
for (let i = 0; i < bookmarks.length; i += batchSize) {
  const batch = bookmarks.slice(i, i + batchSize);
  await this.processBatch(batch);
}
```

## 9. 测试策略

### 9.1 单元测试

每个模块独立测试：

```javascript
// 测试 Bookmarks 模块
import bookmarks from './modules/bookmarks.js';

test('add() should add a bookmark', async () => {
  const result = await bookmarks.add({
    title: 'Test',
    url: 'https://example.com'
  });

  expect(result.success).toBe(true);
  expect(bookmarks.getAll()).toHaveLength(1);
});
```

### 9.2 集成测试

测试模块间协作：

```javascript
test('search should find newly added bookmark', async () => {
  // 添加书签
  await bookmarks.add({ title: 'Test', url: 'https://example.com' });

  // 搜索书签
  const results = search.search('test');

  expect(results).toHaveLength(1);
});
```

### 9.3 端到端测试

测试完整用户流程：

```javascript
test('complete AI analysis workflow', async () => {
  // 1. 配置 AI
  await configureAI();

  // 2. 开始分析
  await aiAnalysis.start();

  // 3. 等待完成
  await waitForEvent(eventBus.Events.ANALYSIS_COMPLETED);

  // 4. 应用结果
  await aiAnalysis.applyResults();

  // 5. 验证结果
  expect(bookmarks.getByCategory('AI分类')).toHaveLength(10);
});
```

## 10. 扩展指南

### 10.1 添加新功能模块

1. **创建模块文件**：`src/popup/modules/my-feature.js`
2. **定义事件**：在 `event-bus.js` 中添加新事件
3. **实现功能**：遵循模块 API 设计原则
4. **注册模块**：在 `popup.js` 中导入
5. **编写测试**：创建对应的测试用例

### 10.2 添加新UI组件

1. **创建组件文件**：`src/popup/components/my-component.js`
2. **定义组件 API**：`create()`, `update()`, `show()`, `hide()`
3. **使用组件**：在需要的地方导入和使用
4. **样式定义**：使用 Tailwind CSS 或自定义样式

### 10.3 集成新服务

1. **创建服务模块**：`src/api/my-service.js`
2. **定义接口**：统一的请求/响应格式
3. **错误处理**：统一的错误处理机制
4. **测试集成**：确保服务可用性

## 11. 最佳实践

### 11.1 模块设计

- **保持模块小而专注**：单个模块不超过 300 行
- **避免循环依赖**：模块间只通过事件通信
- **使用单例模式**：每个模块导出一个实例
- **文档化 API**：清晰的注释和类型定义

### 11.2 事件命名

- **使用命名空间**：`namespace:action` 格式
- **使用过去式**：`bookmark:added`（动作已完成）
- **语义化命名**：事件名应清晰表达其含义

### 11.3 状态管理

- **最小化状态**：只存储必要的状态
- **派生状态**：通过计算得出，不存储
- **单一数据源**：每个状态只在一个模块中管理
- **不可变更新**：使用展开运算符更新数组/对象

### 11.4 错误处理

- **始终捕获异常**：异步操作使用 try-catch
- **记录错误**：控制台输出详细信息
- **用户友好**：显示简洁的错误提示
- **恢复机制**：提供重试或回退方案

## 12. 架构演进

### 12.1 当前架构（v2.0）

- 模块化架构
- 事件驱动通信
- 响应式状态管理

### 12.2 未来计划

- **Web Workers**：将计算密集型任务移到 Worker
- **虚拟滚动**：优化大数据量渲染
- **增量渲染**：分批渲染提升性能
- **Service Worker 缓存**：离线支持

## 13. 参考资源

- [Chrome Extension MV3 文档](https://developer.chrome.com/docs/extensions/mv3/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Event Sourcing 模式](https://martinfowler.com/eaaDev/EventSourcing.html)
- [发布-订阅模式](https://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern)

---

*文档版本: v1.0*
*创建日期: 2026-03-15*
*最后更新: 2026-03-15*
