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
    │   ├── popup.js        # 应用入口，模块初始化
    │   ├── modules/        # 业务模块（11个）
    │   │   ├── state.js           # 状态管理
    │   │   ├── bookmarks.js       # 书签管理
    │   │   ├── navigation.js      # 导航管理
    │   │   ├── search.js          # 搜索功能
    │   │   ├── ai-analysis.js     # AI 分析
    │   │   ├── link-checker.js    # 链接检测
    │   │   ├── drag-drop.js       # 拖拽排序
    │   │   ├── context-menu.js    # 右键菜单
    │   │   ├── keyboard.js        # 键盘快捷键
    │   │   ├── folder-manager.js  # 文件夹管理
    │   │   └── dialog.js          # 对话框管理
    │   ├── utils/          # 工具函数
    │   │   ├── event-bus.js       # 事件总线
    │   │   ├── helpers.js         # 辅助函数
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

| 模块 | 文件 | 职责 |
|------|------|------|
| 状态管理 | `state.js` | 集中管理应用状态，提供响应式更新 |
| 书签管理 | `bookmarks.js` | 书签CRUD操作、加载和统计 |
| 导航管理 | `navigation.js` | 侧边栏导航、文件夹选择、面包屑 |
| 搜索功能 | `search.js` | 搜索输入、结果展示、搜索历史 |
| AI 分析 | `ai-analysis.js` | AI分类分析、进度跟踪、结果应用 |
| 链接检测 | `link-checker.js` | 失效链接检测、断点续检 |
| 拖拽排序 | `drag-drop.js` | 书签拖拽移动、排序 |
| 右键菜单 | `context-menu.js` | 右键菜单显示和操作 |
| 键盘快捷键 | `keyboard.js` | 全局键盘事件处理 |
| 文件夹管理 | `folder-manager.js` | 文件夹CRUD、树结构维护 |
| 对话框管理 | `dialog.js` | 各种对话框的显示和交互 |

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
- [x] Phase 4: 模块化重构
  - [x] Phase 4.1: 工具函数模块提取
  - [x] Phase 4.2: 核心模块重构
  - [x] Phase 4.3: 功能模块提取
  - [x] Phase 4.4: UI 模块提取
- [ ] Phase 5: 测试和优化
  - [ ] Phase 5.1: 完整回归测试
  - [ ] Phase 5.2: 性能测试和优化
  - [ ] Phase 5.3: Bug 修复和代码审查
  - [ ] Phase 5.4: 文档更新
  - [ ] Phase 5.5: 上线准备
- [ ] Phase 6: 未来功能
  - [ ] AI 语义搜索
  - [ ] 定期自动检测
  - [ ] 分类/标签管理增强

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
