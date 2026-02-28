# AI 智能分类功能 — 详细设计文档

> 版本: v1.0  
> 日期: 2025-02-28  
> 状态: 设计稿

---

## 1. 功能概述

用户点击「🤖 分析」按钮后，系统将所有收藏发送至 OpenAI 兼容的大模型 API，由 AI 返回分类方案（包含分类名称、置信度、归属书签、标签），用户确认后一键写入数据库。

---

## 2. 现有实现流程

```
popup.js handleAnalyze()
  ↓ chrome.runtime.sendMessage({ type: 'AI_ANALYZE', bookmarkIds: [...] })
  ↓
background.js handleAIAnalyze()
  ├── getAllBookmarks() / getAllCategories()
  ├── chrome.storage.local.get('aiConfig')
  └── analyzeBookmarks(config, bookmarks, existingCategoryNames, batchSize=10, onProgress)
        ↓ (逐批调用)
        openai.js
          ├── buildAnalysisPrompt(batch, existingCategories)
          ├── callOpenAI(apiUrl, apiKey, model, prompt)
          ├── fetchWithRetry(fn, MAX_RETRIES=3)
          ├── parseAIJSON(raw)
          └── 跨批合并分类（Map by lowercase name）
  ↓ return { categories, tags, summary }
  ↓
popup.js showAnalysisConfirmDialog(result)
  ↓ 用户点击「应用分类」
  ↓ chrome.runtime.sendMessage({ type: 'APPLY_CATEGORIES', categories })
  ↓
background.js handleApplyCategories()
  ├── 创建新分类 addCategory({ id: 'cat_${name}', ... })
  └── 遍历 cat.bookmarkIds → bookmark.categoryId = 'cat_${name}'
```

### 2.1 System Prompt（当前）

```
你是一个专业的收藏夹智能分类助手。你的职责是：
1. 分析收藏的标题、URL和描述，将它们智能分类
2. 优先使用用户已有的分类体系
3. 当需要创建新分类时，使用简洁明了的名称（如"前端开发"、"AI工具"、"学习资料"）
4. 一个链接可以属于多个分类
5. 提取有意义的标签，标签应比分类更细粒度
6. 确保分类结果准确、合理、易于理解
```

### 2.2 User Prompt 模板（当前）

```
用户已有的分类：xxx、yyy（优先使用这些分类）

请分析以下收藏链接，并返回 JSON 格式的分类结果：

1. [ID: xxx] 标题
   URL: https://...
   描述: ...

请返回以下 JSON 格式：
{
  "categories": [
    { "name": "分类名称", "confidence": 0.95, "bookmarkIds": ["id1", "id2"] }
  ],
  "tags": [
    { "name": "标签名", "bookmarkId": "收藏ID" }
  ]
}

要求：
1. 分类名称应简洁明了（2-6个字最佳）
2. confidence 表示分类的可信度（0-1之间，0.7以上较可信）
3. 一个链接可以属于多个分类
4. 标签应比分类更细粒度，例如"React"、"教程"、"工具"等
5. 返回的 bookmarkIds 必须存在于输入中
6. 优先使用用户已有的分类
```

---

## 3. 问题诊断

通过代码分析，发现以下 **7 类问题**：

### 3.1 ❌ 分类只能单归属（最严重）

**文件**: `background.js` `handleApplyCategories()` 第 554 行

```javascript
for (const bookmarkId of cat.bookmarkIds) {
  const bookmark = await getBookmark(bookmarkId);
  if (bookmark) {
    bookmark.categoryId = `cat_${cat.name}`;  // ← 直接覆盖
    ...
  }
}
```

categories 数组按顺序遍历，如果一个 bookmark 被多个分类引用，最后一个分类的 `categoryId` 覆盖前面的。**Prompt 明确说"一个链接可以属于多个分类"，但实际只保留了最后一个**。

**根因**: 数据库 bookmark 记录只有一个 `categoryId` 字段（字符串），不支持多分类。

### 3.2 ❌ 标签从未被应用

`analyzeBookmarks()` 返回了 `tags` 数组，但 `handleApplyCategories()` 完全忽略了标签：

```javascript
async function handleApplyCategories(request, sendResponse) {
  const { categories } = request;  // ← 只取了 categories，tags 被丢弃
  ...
}
```

AI 每次请求都在生成标签，消耗了 token，但结果从未写入数据库。

### 3.3 ❌ 分类 ID 生成方式有碰撞风险

```javascript
id: `cat_${cat.name}`
```

- 若 AI 返回"AI工具"和"ai工具"（大小写不同），会生成不同 ID：`cat_AI工具` 和 `cat_ai工具`
- 而 `analyzeBookmarks()` 中合并分类时用的是 `name.toLowerCase()` 做 key，合并后 name 取第一个出现的大小写
- `isNew` 判断用 `!existingCategories.includes(cat.name)`（大小写敏感），可能将已有分类误判为新分类

### 3.4 ⚠️ 跨批一致性无保障

每批 10 个 bookmark 独立调用 API，不同批次的 AI：
- 可能创建名称相近但不完全相同的分类（如"前端开发" vs "前端技术"）
- 不知道前面批次已经创建了哪些分类
- 仅靠 `existingCategories`（固定不变）来引导复用

合并策略仅靠 `name.toLowerCase()` 完全匹配，"前端开发" ≠ "前端技术" 会被视为两个分类。

### 3.5 ⚠️ 无 API 交互日志

- `callOpenAI()` 不记录请求体和响应体
- `fetchWithRetry()` 仅在重试时输出一行 `console.log`
- 调试时无法看到发给 AI 的 prompt、也看不到 AI 的原始响应
- 出问题时只有一个笼统的 error message

### 3.6 ⚠️ 返回数据无校验

- AI 返回的 `bookmarkIds` 没有与输入列表交叉验证
- `confidence` 值没有范围检查
- `name` 没有空值/过长检查
- JSON 解析失败后整批报错，无法 graceful 跳过

### 3.7 ⚠️ 全量分析无法局部测试

`handleAnalyze()` 固定发送所有 bookmark ID，没有批量选择或小规模测试入口。批量调大模型 API 成本高、调试慢。

---

## 4. 改进方案

### 4.1 数据模型改进

#### 方案 A：bookmark 增加 `categoryIds` 数组字段（推荐）

```javascript
bookmark = {
  id: "xxx",
  categoryId: "cat_xxx",       // 保留兼容（主分类）
  categoryIds: ["cat_xxx", "cat_yyy"],  // 新增：多分类
  tags: ["React", "教程"],     // 复用已有 tags 字段
  ...
}
```

- 不改 DB 版本，`categoryIds` 和 `tags` 都是普通字段，不需要 schema 变更
- `TreeRenderer` 渲染分类树时，一个 bookmark 会出现在多个分类下
- 向后兼容：`categoryId` 继续作为"主分类"使用

#### 方案 B：独立多对多关系表

创建 `bookmark_categories` store（keyPath: `[bookmarkId, categoryId]`）。更规范但改动大，浏览器扩展场景过重，不推荐。

### 4.2 分类应用逻辑修复

```javascript
// handleApplyCategories 修改后逻辑
async function handleApplyCategories(request, sendResponse) {
  const { categories, tags } = request;  // 同时接收标签
  
  // 1. 创建新分类
  for (const cat of categories) {
    if (cat.isNew) {
      const catId = generateCategoryId(cat.name);
      const existing = await get(STORES.CATEGORIES, catId);
      if (!existing) {
        await addCategory({ id: catId, name: cat.name, ... });
      }
    }
  }
  
  // 2. 构建 bookmark → categoryIds 映射
  const bookmarkCategoryMap = new Map();
  for (const cat of categories) {
    const catId = generateCategoryId(cat.name);
    for (const bmId of cat.bookmarkIds) {
      if (!bookmarkCategoryMap.has(bmId)) {
        bookmarkCategoryMap.set(bmId, new Set());
      }
      bookmarkCategoryMap.get(bmId).add(catId);
    }
  }
  
  // 3. 构建 bookmark → tags 映射
  const bookmarkTagMap = new Map();
  for (const tag of tags) {
    if (!bookmarkTagMap.has(tag.bookmarkId)) {
      bookmarkTagMap.set(tag.bookmarkId, new Set());
    }
    bookmarkTagMap.get(tag.bookmarkId).add(tag.name);
  }
  
  // 4. 批量更新 bookmark
  for (const [bmId, catIds] of bookmarkCategoryMap) {
    const bookmark = await getBookmark(bmId);
    if (bookmark) {
      const catIdArray = Array.from(catIds);
      bookmark.categoryId = catIdArray[0];            // 主分类
      bookmark.categoryIds = catIdArray;              // 多分类
      bookmark.tags = Array.from(bookmarkTagMap.get(bmId) || []);  // AI标签
      bookmark.updatedAt = Date.now();
      await addBookmark(bookmark);
    }
  }
}
```

### 4.3 分类 ID 标准化

```javascript
function generateCategoryId(name) {
  return `cat_${name.trim().toLowerCase()}`;
}
```

统一在生成 ID、查找已有分类、判断 `isNew` 时都使用标准化后的 ID。

### 4.4 跨批一致性增强

在后续批次的 prompt 中追加前面批次**已产生的分类名称**：

```javascript
// analyzeBookmarks() 中，每批结束后收集已有分类名
let accumulatedCategoryNames = [...existingCategories];

for (let i = 0; i < batches.length; i++) {
  const prompt = buildAnalysisPrompt(batch, accumulatedCategoryNames);
  ...
  // 批次完成后更新
  parsed.categories.forEach(cat => {
    if (!accumulatedCategoryNames.includes(cat.name)) {
      accumulatedCategoryNames.push(cat.name);
    }
  });
}
```

### 4.5 API 交互日志

新增日志记录模块，将完整的 request/response 保存到内存（可选 IndexedDB），支持在 popup 或 DevTools 中查看：

```javascript
// 日志结构
{
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  type: 'AI_CLASSIFY' | 'AI_SEARCH',
  batchIndex: 0,
  request: {
    model: 'deepseek-chat',
    messages: [...],
    temperature: 0.3
  },
  response: {
    status: 200,
    raw: '原始响应文本',
    parsed: { categories: [...], tags: [...] },
    tokens: { prompt: 1234, completion: 567 }
  },
  duration: 3200,  // ms
  error: null
}
```

### 4.6 返回数据校验

```javascript
function validateAIResult(parsed, inputBookmarkIds) {
  const validIds = new Set(inputBookmarkIds);
  const errors = [];
  
  if (!parsed.categories || !Array.isArray(parsed.categories)) {
    errors.push('categories 字段缺失或非数组');
    parsed.categories = [];
  }
  
  for (const cat of parsed.categories) {
    // 过滤无效 bookmarkIds
    cat.bookmarkIds = (cat.bookmarkIds || []).filter(id => {
      if (!validIds.has(id)) {
        errors.push(`分类"${cat.name}"中的 bookmarkId "${id}" 不存在于输入中`);
        return false;
      }
      return true;
    });
    
    // 校验 confidence
    cat.confidence = Math.min(1, Math.max(0, Number(cat.confidence) || 0.5));
    
    // 校验 name
    if (!cat.name || typeof cat.name !== 'string') {
      errors.push('分类名称为空');
      cat.name = '未分类';
    }
  }
  
  if (errors.length > 0) {
    console.warn('AI 结果校验警告:', errors);
  }
  
  return { result: parsed, errors };
}
```

---

## 5. Demo 模式设计

### 5.1 目标

提供一个「Debug 分析」入口，支持：
- 选择少量书签（1-5个）进行试分析
- 记录完整的 API 请求/响应报文
- 在 UI 中展示原始报文和解析结果
- 不写入数据库，仅用于调试

### 5.2 交互流程

```
用户点击 「🔬 调试分析」按钮
  ↓
弹出 Debug 对话框
  ├── 显示书签列表（可勾选，默认选前 3 个）
  ├── [开始分析] 按钮
  ↓
发送消息 { type: 'AI_ANALYZE_DEBUG', bookmarkIds: [...] }
  ↓
background.js handleAIAnalyzeDebug()
  ├── 与 handleAIAnalyze 类似，但 batchSize=选中数量（不分批）
  ├── 额外记录完整 request body 和 raw response
  └── 返回 { result, debugLogs: [...] }
  ↓
popup 展示 Debug 结果面板
  ├── [请求报文] 可折叠区域：完整 JSON request body
  ├── [原始响应] 可折叠区域：AI 返回的原始文本
  ├── [解析结果] 可折叠区域：parseAIJSON 后的结构化数据
  ├── [校验结果] 可折叠区域：校验错误/警告列表
  └── [耗时/Token] 统计信息
```

### 5.3 实现方案

#### 5.3.1 openai.js 新增 `analyzeBookmarksDebug()`

```javascript
export async function analyzeBookmarksDebug(config, bookmarks, existingCategories) {
  const debugLog = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    bookmarks: bookmarks.map(b => ({ id: b.id, title: b.title, url: b.url })),
    existingCategories,
    request: null,
    response: null,
    parsed: null,
    validation: null,
    duration: 0,
    error: null
  };
  
  const startTime = Date.now();
  
  try {
    const prompt = buildAnalysisPrompt(bookmarks, existingCategories);
    const systemPrompt = getSystemPrompt();
    
    const requestBody = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    };
    
    debugLog.request = requestBody;
    
    const response = await fetch(`${config.apiUrl}/chat/completions`, { ... });
    const data = await response.json();
    
    debugLog.response = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: data,
      raw: data.choices?.[0]?.message?.content
    };
    
    const parsed = parseAIJSON(debugLog.response.raw);
    debugLog.parsed = parsed;
    
    const validation = validateAIResult(parsed, bookmarks.map(b => b.id));
    debugLog.validation = validation;
    
    debugLog.duration = Date.now() - startTime;
    
    return debugLog;
  } catch (error) {
    debugLog.error = error.message;
    debugLog.duration = Date.now() - startTime;
    return debugLog;
  }
}
```

#### 5.3.2 background.js 新增消息类型

```javascript
case 'AI_ANALYZE_DEBUG':
  handleAIAnalyzeDebug(request, sendResponse);
  return true;
```

#### 5.3.3 popup.js 新增 UI

- 工具栏新增「🔬」按钮
- Debug 对话框：书签选择列表 + 分析按钮
- 结果面板：多个 `<details>` 折叠区展示各维度数据

---

## 6. Prompt 优化建议

### 6.1 当前问题

1. Prompt 要求 AI 返回 `bookmarkIds` 数组（字符串 ID），但有些模型会返回数字索引而非实际 ID
2. 没有明确限制分类数量上限，可能产生过多碎片分类
3. 没有 few-shot 示例，模型对输出格式的理解完全依赖文字描述
4. `description` 字段通常为空（content collector 未充分利用），AI 缺乏足够上下文

### 6.2 改进后的 System Prompt

```
你是一个专业的收藏夹智能分类助手。

核心原则：
1. 根据收藏的标题和 URL 域名/路径特征进行分类
2. 分类应当具有实用性——帮助用户快速找到想要的链接
3. 分类粒度中等：总分类数控制在 5-15 个之间
4. 每个分类下至少有 2 个收藏（避免只有 1 个收藏的碎片分类）
5. 标签比分类更细粒度，用于辅助搜索

输出规范：
- 严格返回 JSON，不要添加任何解释文字
- bookmarkIds 使用输入中 [ID: xxx] 的 xxx 值，保持原始字符串格式
- confidence 范围 0.0-1.0
```

### 6.3 改进后的 User Prompt

在原有基础上增加 few-shot 示例：

```
请分析以下收藏链接，并返回 JSON 格式的分类结果：

...（书签列表）

示例输出：
{
  "categories": [
    {
      "name": "前端开发",
      "confidence": 0.92,
      "bookmarkIds": ["12", "35", "67"]
    }
  ],
  "tags": [
    { "name": "React", "bookmarkId": "12" },
    { "name": "CSS", "bookmarkId": "35" }
  ]
}
```

---

## 7. 后续规划

| 优先级 | 项目 | 说明 |
|--------|------|------|
| P0 | Debug 分析 Demo | 先确认 AI 返回格式在当前模型下是否可用 |
| P0 | 返回数据校验 | 防止无效数据写入 DB |
| P1 | 分类只能单归属修复 | 改 `categoryId` → `categoryIds` |
| P1 | 标签应用 | 将 AI 标签写入 bookmark.tags |
| P1 | 跨批分类名累加 | 避免近义分类 |
| P2 | Prompt 优化 | few-shot + 格式约束 |
| P2 | 分类 ID 标准化 | 统一 lowercase |
| P3 | 正式日志系统 | API 日志可选持久化 |

---

## 附录 A：相关文件索引

| 文件 | 职责 |
|------|------|
| `src/api/openai.js` | AI API 调用、prompt 构建、结果解析 |
| `src/background/background.js` | 消息路由、分类应用、DB 操作 |
| `src/popup/popup.js` | UI 交互、分析入口、确认对话框 |
| `src/db/indexeddb.js` | IndexedDB 封装 |
| `src/ui/renderers.js` | 分类树渲染 |
| `src/ui/components.js` | 通用 UI 组件 |
