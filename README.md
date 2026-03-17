# Smart Bookmarks - 智能收藏夹管理插件

> 一款智能的浏览器收藏夹管理插件，支持 AI 分类、失效链接检测、快速搜索

## 功能特性

### 核心功能
- **🤖 AI 智能分类** - 自动分析收藏内容，智能推荐分类
- **🔍 智能搜索** - 支持语义搜索，快速找到需要的收藏
- **⚠️ 失效检测** - 一键扫描失效链接，轻松清理
- **💾 备份恢复** - 本地导入导出，防止数据丢失
- **🏷️ 多标签管理** - 一个收藏可归属多个分类

### 技术亮点
- **模块化架构** - 基于事件驱动的松耦合模块设计
- **响应式状态管理** - 集中式状态管理，自动通知UI更新
- **本地数据存储** - IndexedDB 持久化，隐私安全
- **OpenAI 兼容 API** - 支持自定义 AI 服务提供商
- **渐进式网页信息采集** - 智能采集网页元数据
- **无服务器架构** - 完全本地化，无需云端服务

## 安装方法

### Chrome/Edge
1. 下载或克隆本项目
2. 打开浏览器扩展管理页面 (`chrome://extensions/`)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目文件夹

## 配置 AI 功能

插件支持 OpenAI 兼容的 API：

1. 点击插件图标，打开主界面
2. 点击右上角"设置"按钮
3. 在 AI 配置区域填写：
   - API 地址（如 `https://api.openai.com/v1`）
   - API 密钥
   - 模型名称（如 `gpt-3.5-turbo`）
4. 保存配置

## 使用指南

### 首次使用
插件会自动导入浏览器现有收藏夹数据，建立本地副本。

### AI 分类
1. 点击"一键分析"按钮
2. 等待 AI 分析完成
3. 查看分类建议，确认后应用

### 失效检测
1. 点击"失效检测"按钮
2. 确认开始检测
3. 实时查看检测进度（百分比和数量）
4. 检测完成后：
   - 如果无失效链接，显示成功提示
   - 如有失效链接，自动移至"待清理"分类
   - 可查看详情（失效原因：404/超时/DNS失败等）
5. 在"待清理"分类中确认后一键删除

### 搜索收藏
- 直接在搜索框输入关键词
- 配置 AI 后可使用语义搜索

## 项目结构

```
smart-bookmarks/
├── manifest.json           # 扩展配置（Manifest V3）
├── package.json            # 项目配置
├── tailwind.config.js      # Tailwind CSS 配置
├── docs/                   # 项目文档
│   ├── 需求设计说明书.md
│   ├── AI分类设计文档.md
│   ├── UI重设计方案.md
│   ├── TODO.md
│   └── ARCHITECTURE.md     # 架构文档
├── icons/                  # 图标资源
└── src/
    ├── background/         # 后台脚本（Service Worker）
    │   └── background.js   # 消息处理、AI分析、链接检测
    ├── content/            # 内容脚本
    │   └── collector.js    # 网页信息采集
    ├── popup/              # 主界面（全屏标签页）
    │   ├── popup.html      # 主界面HTML
    │   ├── popup.js        # 应用入口，模块初始化（3485行，已模块化）
    │   ├── modules/        # 业务模块（21个）
    │   │   ├── # 状态管理
    │   │   ├── state.js           # 集中式状态管理
    │   │   ├── # 核心业务（已集成）
    │   │   ├── bookmarks.js       # 书签 CRUD 操作
    │   │   ├── navigation.js      # 旧导航模块（已废弃）
    │   │   ├── search.js          # 旧搜索模块
    │   │   ├── search-manager.js  # 搜索管理器（新）
    │   │   ├── ai-analysis.js     # AI 分析引擎
    │   │   ├── link-checker.js    # 链接检测引擎
    │   │   ├── import-export.js   # 导入导出功能
    │   │   ├── # 交互模块（已集成）
    │   │   ├── keyboard.js        # 全局快捷键 + 键盘导航
    │   │   ├── context-menu.js    # 右键菜单管理
    │   │   ├── drag-drop.js       # 拖拽排序
    │   │   ├── dialog.js          # 对话框基类
    │   │   ├── # UI 管理模块（第二轮重构新增）
    │   │   ├── navigation-manager.js    # 导航管理（450行）
    │   │   ├── task-panel-manager.js    # 任务面板管理（331行）
    │   │   ├── folder-dialog-manager.js # 文件夹对话框（250行）
    │   │   ├── # 辅助模块
    │   │   ├── folder-manager.js  # 文件夹树管理
    │   │   ├── base-task-manager.js # 任务管理基类
    │   │   ├── analysis-resume.js # 分析恢复对话框
    │   │   ├── check-resume.js    # 检测恢复对话框
    │   │   └── debug-dialog.js    # 调试对话框
    │   ├── utils/          # 工具函数
    │   │   ├── event-bus.js       # 事件总线
    │   │   ├── helpers.js         # 辅助函数
    │   │   ├── form-validator.js  # 表单验证
    │   │   ├── dialog-builder.js  # 对话框构建器
    │   │   └── constants.js       # 常量定义
    │   ├── tailwind.input.css # Tailwind 入口
    │   ├── tailwind.css       # Tailwind 编译输出（勿直接修改）
    │   └── test-modules.js  # 模块测试脚本
    ├── options/            # 设置页面
    │   ├── options.html
    │   └── options.js
    ├── db/                 # 数据库操作
    │   ├── indexeddb.js    # IndexedDB 封装（v2）
    │   └── migration.js    # 数据库迁移
    ├── api/                # API 调用
    │   └── openai.js       # OpenAI 兼容接口
    ├── search/             # 搜索模块
    │   ├── local-search.js # 本地搜索
    │   └── ai-search.js    # AI 语义搜索
    └── utils/              # 工具函数
        ├── bookmark-sync.js   # 浏览器收藏同步
        ├── link-checker.js    # 链接检测
        └── export.js          # 数据导出
```

## 模块化架构

本项目采用**模块化架构**，将复杂功能拆分为独立的模块，通过**事件总线**实现松耦合通信。

### 核心设计原则

1. **单一职责** - 每个模块只负责一个具体功能
2. **事件驱动** - 模块间通过事件总线通信，不直接依赖
3. **响应式状态** - 集中式状态管理，自动触发UI更新
4. **可测试性** - 模块独立，易于单元测试

### 模块列表

| 模块 | 文件 | 行数 | 状态 | 职责 |
|------|------|------|------|------|
| **状态管理** | `state.js` | 396 | 待集成 | 集中管理应用状态，提供响应式更新 |
| **核心业务** | | | | |
| 书签管理 | `bookmarks.js` | 363 | ✅ 已集成 | 书签CRUD操作、加载和统计 |
| 搜索管理器 | `search-manager.js` | 210 | ✅ 已集成 | 搜索输入、结果展示、历史记录 |
| AI 分析 | `ai-analysis.js` | 501 | 独立 | AI分类分析、进度跟踪、结果应用 |
| 链接检测 | `link-checker.js` | 387 | 独立 | 失效链接检测、断点续检 |
| 导入导出 | `import-export.js` | 300 | 独立 | 浏览器书签同步、数据导入导出 |
| **交互模块** | | | | |
| 键盘快捷键 | `keyboard.js` | 528 | ✅ 已集成 | 全局快捷键 + 键盘导航 |
| 右键菜单 | `context-menu.js` | 556 | ✅ 已集成 | 右键菜单显示和操作 |
| 拖拽排序 | `drag-drop.js` | 684 | 独立 | 书签拖拽移动、排序 |
| 对话框管理 | `dialog.js` | 795 | 独立 | 对话框基类和通用对话框 |
| **UI 管理模块**（第二轮重构新增）| | | | |
| 导航管理器 | `navigation-manager.js` | 450 | ✅ 已集成 | 侧边栏导航、面包屑、文件夹选择 |
| 任务面板管理 | `task-panel-manager.js` | 331 | ✅ 已集成 | 任务面板、进度显示、ETA计算 |
| 文件夹对话框 | `folder-dialog-manager.js` | 250 | ✅ 已集成 | 文件夹增删改查对话框 |
| **辅助模块** | | | | |
| 文件夹管理 | `folder-manager.js` | 549 | 独立 | 文件夹CRUD、树结构维护 |
| 任务管理基类 | `base-task-manager.js` | 283 | 独立 | 长任务管理基类 |
| 分析恢复对话框 | `analysis-resume.js` | 84 | ✅ 已集成 | AI分析恢复对话框 |
| 检测恢复对话框 | `check-resume.js` | 52 | ✅ 已集成 | 链接检测恢复对话框 |
| 调试对话框 | `debug-dialog.js` | 282 | ✅ 已集成 | 调试工具对话框 |

### 通信机制

```
┌─────────────┐    emit()    ┌─────────────┐
│   Module A  │ ───────────→ │  Event Bus  │
└─────────────┘              └─────────────┘
                                    │
                                    │ on()
                                    ↓
                             ┌─────────────┐
                             │   Module B  │
                             └─────────────┘
```

所有模块通过 `eventBus` 进行通信：
- **发布事件**：`eventBus.emit(eventBus.Events.XXX, data)`
- **订阅事件**：`eventBus.on(eventBus.Events.XXX, callback)`
- **取消订阅**：`eventBus.off(eventBus.Events.XXX, callback)`

### 状态管理

使用 `state.js` 模块集中管理应用状态：

```javascript
import state from './modules/state.js';

// 读取状态
const bookmarks = state.bookmarks;

// 更新状态（自动通知订阅者）
state.selectedFolderId = 'folder-123';

// 订阅状态变更
state.subscribe('selectedFolderId', (newValue, oldValue) => {
  console.log(`Folder changed from ${oldValue} to ${newValue}`);
});
```

## 开发指南

### 环境准备

```bash
# 克隆项目
git clone https://github.com/your-repo/smart-bookmarks.git
cd smart-bookmarks

# 安装依赖
npm install

# 构建 CSS（Tailwind）
npm run build

# 开发模式（监听 CSS 变化）
npm run dev
```

### 添加新模块

1. **创建模块文件**：在 `src/popup/modules/` 下创建新文件
   ```javascript
   // src/popup/modules/my-module.js
   import eventBus from '../utils/event-bus.js';

   class MyModule {
     constructor() {
       this.init();
     }

     init() {
       // 订阅事件
       eventBus.on(eventBus.Events.SOME_EVENT, this.handleEvent.bind(this));
     }

     handleEvent(data) {
       // 处理事件
     }

     // 发布事件
     doSomething() {
       eventBus.emit(eventBus.Events.MY_EVENT, { data: 'value' });
     }
   }

   export default new MyModule();
   ```

2. **在 popup.js 中注册**：
   ```javascript
   // src/popup/popup.js
   import myModule from './modules/my-module.js';

   // 模块会在导入时自动初始化
   ```

3. **添加事件常量**（如果需要新事件）：
   ```javascript
   // src/popup/utils/event-bus.js
   export const Events = {
     // ... 现有事件
     MY_EVENT: 'my:event',
   };
   ```

### 测试模块

项目提供了模块测试脚本：

```bash
# 在浏览器控制台中运行
# 1. 打开扩展主界面
# 2. 按 F12 打开开发者工具
# 3. 在 Console 中输入：
import './src/popup/test-modules.js';
```

### 调试技巧

1. **查看状态快照**：
   ```javascript
   import state from './src/popup/modules/state.js';
   state.snapshot(); // 返回当前状态的深拷贝
   ```

2. **监听所有事件**：
   ```javascript
   import eventBus from './src/popup/utils/event-bus.js';
   eventBus.eventNames(); // 查看所有已注册事件
   ```

3. **查看事件监听器数量**：
   ```javascript
   eventBus.listenerCount('bookmarks:loaded');
   ```

### 代码规范

- **ES Module**：所有文件使用 `import/export`
- **异步操作**：统一使用 `async/await`
- **错误处理**：使用 try-catch 包裹异步操作
- **事件命名**：使用 `namespace:action` 格式（如 `bookmark:added`）
- **状态更新**：通过 `state.set()` 或 `state.update()` 更新状态
- **常量定义**：使用 `UPPER_CASE` 命名常量

### 提交代码

```bash
# 构建最新 CSS
npm run build

# 提交代码
git add .
git commit -m "feat: 添加新功能"
git push
```

## 开发计划

- [x] Phase 1: 基础架构搭建
- [x] Phase 2: 数据同步与存储
- [x] Phase 3: 失效检测功能
- [x] Phase 4: 模块化重构（第一轮）
  - [x] Phase 4.1: 工具函数模块提取
  - [x] Phase 4.2: 核心模块重构
  - [x] Phase 4.3: 功能模块提取
  - [x] Phase 4.4: UI 模块提取
- [x] **Phase 5: 模块化重构（第二轮）** ✨ 新完成
  - [x] Phase 5.1: 提取 NavigationManager（450行，减少220行）
  - [x] Phase 5.2: 提取 TaskPanelManager（331行，减少65行）
  - [x] Phase 5.3: 提取 FolderDialogManager（250行，减少112行）
  - **成果**: popup.js 从 3882 行减少到 3485 行（-10.2%）
- [ ] Phase 6: 测试和优化
  - [ ] Phase 6.1: 完整回归测试
  - [ ] Phase 6.2: 性能测试和优化
  - [ ] Phase 6.3: Bug 修复和代码审查
  - [ ] Phase 6.4: 移除旧函数转发器
- [ ] Phase 7: 未来功能
  - [ ] AI 语义搜索
  - [ ] 定期自动检测
  - [ ] 分类/标签管理增强
  - [ ] 云端同步（可选）

## 重构历史

### 第一轮模块化重构（2024年）

**目标**：将 monolithic popup.js（4479 行）拆分为独立模块

**成果**：
- 从 4479 行减少到 3882 行（-13.3%）
- 新增 10 个功能模块
- 建立事件驱动架构

### 第二轮模块化重构（2026年3月）

**目标**：继续精简 popup.js，优化架构设计

**成果**：
- popup.js：从 3882 行减少到 3485 行（-10.2%）
- 新增 3 个管理模块（1031 行）
- 总计减少：397 行代码

**新增模块**：
1. **NavigationManager**（450 行）
   - 导航模式切换（全部、最近、失效、标签、文件夹）
   - 侧边栏文件夹树的渲染和交互
   - 面包屑导航的构建和渲染
   - 内容区域的文件夹导航

2. **TaskPanelManager**（331 行）
   - 任务面板的展开/折叠
   - AI 分析进度显示
   - 失效链接检测进度显示
   - 进度条更新和 ETA 计算

3. **FolderDialogManager**（250 行）
   - 合并文件夹对话框
   - 删除文件夹对话框
   - 添加子文件夹对话框
   - 重命名文件夹对话框

**架构改进**：
- 事件驱动架构更完善（新增 6 个事件）
- 模块职责更清晰
- 代码可维护性显著提升
- 向后兼容（保留旧函数作为转发器）

**提交记录**：
- `d6bc2d3` - Phase 1: NavigationManager
- `bfd00b7` - Phase 2: TaskPanelManager
- `db3d687` - Phase 3: FolderDialogManager

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
