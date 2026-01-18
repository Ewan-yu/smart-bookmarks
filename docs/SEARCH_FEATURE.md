# Smart Bookmarks 搜索功能说明

## 功能概述

Smart Bookmarks 提供了强大的搜索功能，支持本地关键词搜索和 AI 语义搜索。

## 搜索方式

### 1. 本地搜索（默认）

当未配置 AI 时，系统使用本地搜索：

- **关键词匹配**：在标题、URL、描述中搜索
- **标签匹配**：按标签过滤收藏
- **实时搜索**：输入时即时过滤结果

### 2. AI 语义搜索

配置 OpenAI 兼容的 API 后，可以使用 AI 语义搜索：

- **语义理解**：理解查询意图，而不只是关键词匹配
- **智能排序**：根据相关性对结果排序
- **自动优化**：AI 会考虑标题、URL、描述和标签的语义相关性

## 高级搜索语法

本地搜索支持以下高级语法：

### 按标签搜索
```
tag:React
tag:工作
```

### 按站点搜索
```
site:github.com
site:stackoverflow.com
```

### 精确匹配
```
"JavaScript 教程"
```

### 排除结果
```
排除:广告
排除:视频
```

### 组合搜索
```
tag:React site:github.com 教程
"前端开发" tag:工作
```

## 搜索结果特性

### 结果高亮
- 匹配的关键词会以黄色背景高亮显示
- 支持多个关键词同时高亮

### 相关性得分
- 本地搜索显示相关性百分比（0-100%）
- AI 搜索结果按相关性排序

### 搜索类型标识
- 🔍 本地搜索结果
- 🤖 AI 搜索结果

### 结果统计
- 显示找到的结果数量
- 显示当前搜索关键词

## 搜索历史

- 自动记录搜索历史
- 聚焦搜索框时显示历史记录
- 历史记录最多保存 50 条

## 搜索建议

### 本地建议
- 基于搜索历史的建议
- 基于现有标签的建议
- 支持快速选择标签搜索

### AI 建议
- 配置 AI 后可获取智能搜索建议
- 基于当前输入的语义扩展

## 性能优化

### 实时搜索
- 使用防抖技术（300ms）
- 减少不必要的搜索计算
- 输入时使用快速本地搜索

### AI 搜索优化
- 收藏数量超过 100 时先进行本地过滤
- 搜索结果缓存 5 分钟
- 支持超时控制（默认 10 秒）

### 混合搜索
- 结合本地搜索和 AI 搜索的优势
- 支持多种合并策略（并集、交集、AI 优先）

## API 使用示例

### 基本搜索
```javascript
import { search, quickSearch } from './search/index.js';

// 快速搜索（实时输入）
const results = await quickSearch('React', bookmarks);

// 完整搜索（包含 AI）
const result = await search(
  'React 教程',
  bookmarks,
  aiConfig,
  {
    history: true,
    suggestions: true,
    useAI: true
  }
);
```

### 高级搜索
```javascript
import { advancedSearch, createSearchFilter } from './search/index.js';

// 使用高级语法
const results = await advancedSearch('tag:React site:github.com', bookmarks);

// 使用过滤器
const filter = createSearchFilter();
filter.tags = ['React', 'JavaScript'];
filter.sortBy = 'date';
filter.sortOrder = 'desc';

const results = applyFilter(filter, bookmarks);
```

### 导出搜索结果
```javascript
import { exportSearchResults } from './search/index.js';

// 导出为 JSON
const json = exportSearchResults(searchResult, 'json');

// 导出为 CSV
const csv = exportSearchResults(searchResult, 'csv');

// 导出为 HTML 报告
const html = exportSearchResults(searchResult, 'html');
```

## 配置要求

### 本地搜索
- 无需额外配置
- 自动加载收藏数据
- 即开即用

### AI 搜索
需要配置 OpenAI 兼容的 API：

1. 打开设置页面
2. 填写 API 地址
3. 填写 API Key
4. 选择模型名称
5. 测试连接

## 常见问题

### Q: 搜索速度慢怎么办？
A:
- 使用实时搜索时，系统会自动使用快速本地搜索
- 减少 AI 搜索的超时时间
- 使用混合搜索模式

### Q: AI 搜索结果不准确？
A:
- 检查 API 配置是否正确
- 尝试更换模型
- 使用更明确的搜索词
- 结合高级搜索语法

### Q: 如何查看所有搜索历史？
A:
- 聚焦搜索框会显示最近的历史
- 历史记录保存在 chrome.storage.local 中
- 可以通过浏览器开发者工具查看

## 技术实现

### 本地搜索
- 使用高级查询解析器
- 支持正则表达式匹配
- 计算相关性得分
- 提取匹配位置用于高亮

### AI 搜索
- 调用 OpenAI 兼容 API
- 支持流式响应
- 自动重试机制
- 结果缓存优化

### 混合搜索
- 并行执行本地和 AI 搜索
- 多种结果合并策略
- 智能回退机制
- 性能监控和优化

## 未来改进

- [ ] 支持拼音搜索
- [ ] 支持模糊匹配
- [ ] 支持同义词扩展
- [ ] 支持搜索结果分组
- [ ] 支持保存搜索条件
- [ ] 支持搜索结果排序自定义
