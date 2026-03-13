// Smart Bookmarks - OpenAI 兼容 API 调用

import CategoryMerger from '../utils/category-merger.js';

/**
 * 最大重试次数
 */
const MAX_RETRIES = 3;

/**
 * 重试延迟基数（毫秒）
 */
const RETRY_DELAY_BASE = 1000;

/**
 * 调用 AI 分析收藏（支持断点续分析、逐批回调、取消）
 * @param {Object} config - API 配置
 * @param {Array}  bookmarks - 待分析的收藏列表
 * @param {Array}  existingCategories - 用户已有的分类（作为参考）
 * @param {Object} options
 * @param {number}   [options.batchSize=10]       - 每批分析的书签数
 * @param {Function} [options.onProgress]          - 进度回调 (current, total, message)
 * @param {Function} [options.onBatchComplete]     - 每批完成回调 async (batchIndex, batchLog)
 * @param {Object}   [options.cancelToken]         - 取消令牌 { cancelled: boolean }
 * @param {number}   [options.startBatchIndex=0]  - 从第几批开始（断点续接）
 * @param {Array}    [options.cachedBatches=[]]    - 已缓存的批次结果（仅含 categories/tags/usage）
 * @returns {Promise<{categories, tags, summary, batchLogs}>}
 */
export async function analyzeBookmarks(
  config,
  bookmarks,
  existingCategories = [],
  options = {}
) {
  const {
    batchSize = 10,
    onProgress,
    onBatchComplete,
    cancelToken,
    startBatchIndex = 0,
    cachedBatches = []
  } = options;

  const { apiUrl, apiKey, model } = config;

  // 确保 existingCategories 是一个数组（防御性编程）
  const categories = Array.isArray(existingCategories) ? existingCategories : [];

  // 分批
  const batches = [];
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }

  const allCategories = new Map();
  const allTags = [];
  const batchLogs = [];

  /**
   * 将一批 categories/tags 合并到汇总 Map 中
   */
  function mergeBatch(cats, tags) {
    if (cats) {
      cats.forEach((cat) => {
        const key = cat.name.toLowerCase();
        if (allCategories.has(key)) {
          const existing = allCategories.get(key);
          existing.bookmarkIds.push(...(cat.bookmarkIds || []));
          existing.confidence = (existing.confidence + (cat.confidence ?? 0.5)) / 2;
        } else {
          allCategories.set(key, {
            name: cat.name,
            confidence: cat.confidence ?? 0.5,
            bookmarkIds: cat.bookmarkIds || [],
            isNew: !categories.includes(cat.name)
          });
        }
      });
    }
    if (tags) {
      tags.forEach(tag => allTags.push({ name: tag.name || tag, bookmarkId: tag.bookmarkId }));
    }
  }

  // ── 重放缓存批次（断点续接时跳过已完成批次）────────────────────────────────
  for (let i = 0; i < Math.min(startBatchIndex, cachedBatches.length); i++) {
    const cached = cachedBatches[i];
    mergeBatch(cached?.categories, cached?.tags);
    batchLogs.push({
      batchIndex: i,
      batchSize: batches[i]?.length ?? batchSize,
      bookmarks: batches[i]?.map(b => ({ id: b.id, title: b.title, url: b.url })) ?? [],
      categories: cached?.categories || [],
      tags: cached?.tags || [],
      usage: cached?.usage || null,
      warnings: [],
      duration: 0,
      fromCache: true
    });
  }

  // ── 逐批发送 API 请求 ────────────────────────────────────────────────────────
  for (let i = startBatchIndex; i < batches.length; i++) {
    // 检查取消令牌
    if (cancelToken?.cancelled) {
      throw new Error('已取消');
    }

    const batch = batches[i];
    if (onProgress) {
      onProgress(i + 1, batches.length, `正在分析第 ${i + 1}/${batches.length} 批（${batch.length} 个）...`);
    }

    const prompt = buildAnalysisPrompt(batch, categories);
    const batchStartTime = Date.now();

    try {
      const { content: rawContent, usage } = await fetchWithRetry(
        () => callOpenAI(apiUrl, apiKey, model, prompt),
        MAX_RETRIES
      );

      const parsed = parseAIJSON(rawContent);
      const inputIds = batch.map(b => String(b.id));
      const { result: validatedParsed, warnings } = validateAIResult(parsed, inputIds);

      mergeBatch(validatedParsed.categories, validatedParsed.tags);

      const batchLog = {
        batchIndex: i,
        batchSize: batch.length,
        bookmarks: batch.map(b => ({ id: b.id, title: b.title })),
        categories: validatedParsed.categories || [],
        tags: validatedParsed.tags || [],
        usage,
        warnings,
        duration: Date.now() - batchStartTime,
        fromCache: false
      };
      batchLogs.push(batchLog);

      if (onBatchComplete) {
        await onBatchComplete(i, batchLog);
      }

    } catch (error) {
      if (cancelToken?.cancelled) throw error; // 取消错误直接透传
      console.error(`批 ${i + 1} 分析失败:`, error);
      throw new Error(`分析第 ${i + 1}/${batches.length} 批收藏时失败: ${error.message}`);
    }
  }

  // ── 应用智能聚合去重（减少重复分类）────────────────────────────────────────────
  const rawCategories = Array.from(allCategories.values());
  const merger = new CategoryMerger({
    similarityThreshold: 0.75,
    minMergeSupport: 2
  });

  // 执行聚合
  const mergeResult = merger.mergeCategories(rawCategories);
  const mergedCategories = mergeResult.categories;

  // 记录聚合日志到 batchLogs
  if (mergeResult.report.mergedGroups > 0) {
    batchLogs.push({
      batchIndex: -1, // 特殊标记：这是聚合步骤
      batchSize: 0,
      bookmarks: [],
      categories: mergedCategories,
      tags: [],
      usage: null,
      warnings: [],
      duration: 0,
      fromCache: false,
      mergeReport: mergeResult.report
    });
  }

  const summary = generateSummary(
    new Map(mergedCategories.map(c => [c.name.toLowerCase(), c])),
    categories,
    bookmarks.length
  );

  // 在摘要中添加聚合信息
  summary.mergeReport = mergeResult.report;

  return {
    categories: mergedCategories,
    tags: allTags,
    summary,
    batchLogs
  };
}

/**
 * 从 AI 返回的原始文本中提取并解析 JSON
 * 兼容：
 *   1. 思维链模型输出的 <think>...</think> 推理标签（DeepSeek-R1 等）
 *   2. AI 有时套一层 markdown 代码块 ```json ... ```
 * @param {string} raw - AI 返回的原始文本
 * @returns {Object} 解析后的 JSON 对象
 */
function parseAIJSON(raw) {
  // 1. 剥离 <think>...</think>（含嵌套）
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. 剥离 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // 3. 如果还找不到 JSON 对象，尝试截取第一个 { ... }
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const braceStart = text.indexOf('{');
    const bracketStart = text.indexOf('[');
    const start = braceStart === -1 ? bracketStart
      : bracketStart === -1 ? braceStart
      : Math.min(braceStart, bracketStart);
    if (start !== -1) {
      text = text.slice(start);
    }
  }

  return JSON.parse(text);
}

/**
 * 带重试机制的 Fetch 请求
 * @param {Function} fetchFn - Fetch 函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} attempt - 当前尝试次数
 * @returns {Promise<string>}
 */
async function fetchWithRetry(fetchFn, maxRetries, attempt = 0) {
  try {
    const response = await fetchFn();

    // 先检查 Content-Type，避免把 HTML 错误页当 JSON 解析
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      const err = new Error(
        `API 返回非 JSON 响应 (HTTP ${response.status})，请检查 API 地址是否正确。响应片段: ${text.slice(0, 200)}`
      );
      err.status = response.status;
      throw err;
    }

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || response.statusText;
      const error = new Error(`API 请求失败 ${response.status}: ${errMsg}`);
      error.status = response.status;
      throw error;
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API 返回内容为空');
    }

    return { content, usage: data.usage || null };
  } catch (error) {
    // 429 (Too Many Requests) 或 5xx 错误时重试
    const shouldRetry =
      attempt < maxRetries &&
      ((error.status === 429) || (error.status >= 500 && error.status < 600));

    if (shouldRetry) {
      // 指数退避
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      console.log(`请求失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries})...`);
      await sleep(delay);
      return fetchWithRetry(fetchFn, maxRetries, attempt + 1);
    }

    throw error;
  }
}

/**
 * 调用 OpenAI API
 * @param {string} apiUrl - API 地址
 * @param {string} apiKey - API 密钥
 * @param {string} model - 模型名称
 * @param {string} prompt - 提示词
 * @returns {Promise<Response>}
 */
async function callOpenAI(apiUrl, apiKey, model, prompt) {
  return fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: getSystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
      // 不传 response_format，以兼容不支持该参数的模型（如推理模型）
    })
  });
}

/**
 * 获取系统提示词
 * @returns {string}
 */
function getSystemPrompt() {
  return `你是专业的收藏夹分类助手。根据标题、URL特征和页面摘要将收藏分类。

## 分类原则（严格遵守）

### 1. 分类类型识别（核心原则）
**首先识别收藏的内容类型，然后应用相应的分类规则**：

**技术类（开发者向）**：
- ✅ 正确：React、Vue、Angular、Spring Boot、.NET、Go、Python
- ❌ 错误：前端、后端、全栈、Web开发、编程语言（太粗糙）
- **细分规则**：
  - 前端框架：React、Vue、Angular、Svelte、Solid.js、Qwik、Next.js、Nuxt.js
  - 后端框架：Java Spring、Spring Boot、Node.js Express、Python Django、Go Gin、.NET Core、PHP Laravel
  - 移动端：iOS Swift、Android Kotlin、React Native、Flutter、Ionic
  - 数据库：MySQL、PostgreSQL、MongoDB、Redis、Elasticsearch
  - 运维工具：Docker、Kubernetes、Linux、Nginx、Jenkins、Git
  - 构建工具：Webpack、Vite、Babel、ESLint、Prettier、Rollup

**设计类（设计师向）**：
- ✅ 正确：UI设计、UX设计、平面设计、产品设计、动效设计
- ❌ 错误：设计（太宽泛）
- **细分规则**：
  - UI/UX：Figma、Sketch、Adobe XD、用户研究、交互设计
  - 平面设计：Photoshop、Illustrator、InDesign、品牌设计
  - 产品设计：产品设计方法、原型设计、设计系统
  - 动效设计：After Effects、Lottie、动画原理

**财经商业类**：
- ✅ 正确：投资理财、股票基金、创业管理、市场营销
- ❌ 错误：财经（太宽泛）
- **细分规则**：
  - 投资理财：股票、基金、债券、保险、个人理财
  - 商业管理：创业、企业管理、战略、人力资源
  - 市场营销：数字营销、SEO、内容营销、社交媒体

**人文社科类**：
- ✅ 正确：历史、哲学、心理学、社会学、政治、法律
- ❌ 错误：人文（太宽泛）
- **细分规则**：
  - 按学科分类：历史、哲学、心理学、社会学、政治学、法学
  - 按主题分类：中国历史、世界史、西方哲学、认知心理学等

**书籍阅读类**：
- ✅ 正确：技术书籍、商业书籍、人文书籍、书单推荐
- ❌ 错误：书籍（太宽泛）
- **细分规则**：
  - 按类型：电子书、书单、阅读笔记、出版社
  - 按领域：技术书单、商业书单、人文书单

**资源工具类**：
- ✅ 正确：设计素材、开发工具、学习资源、模板库
- ❌ 错误：资源（太宽泛）
- **细分规则**：
  - 设计资源：图标、插画、字体、配色、模板
  - 开发资源：API文档、开源项目、代码片段
  - 学习资源：在线课程、视频教程、文档中心

### 2. 优先复用用户现有分类（最高优先级 - 必须严格遵守）
**重要：用户的现有分类是最优的，必须优先使用！**

**禁止规则（绝对违反）**：
- ❌ **禁止创建与用户现有分类相似的新分类**
- ❌ **禁止将用户的精准分类合并为宽泛分类**
- ❌ **禁止忽略用户已有的分类目录**

**正确做法**：
- ✅ **必须检查每个书签是否已经属于用户的某个分类**
- ✅ **如果用户已有"Oracle"分类，Oracle相关书签必须归入"Oracle"，不能归入"数据库"**
- ✅ **如果用户已有"前端"分类，前端相关书签必须归入"前端"，不能创建新的"Web开发"分类**
- ✅ **如果用户已有"React"分类，React书签必须归入"React"，不能归入"前端开发"**

**具体判断流程**：
1. 首先检查书签的URL、标题、内容，判断它属于用户的哪个现有分类
2. 如果属于用户的某个现有分类（如"Oracle"），直接归入该分类
3. 如果不属于任何现有分类，才考虑创建新分类
4. 创建新分类时，确保不与用户现有分类重复或相似

**示例**：
- 用户有"Oracle"分类 → Oracle书签 → 归入"Oracle"（不是"数据库"）
- 用户有"前端"分类 → React书签 → 可以创建"React"（子分类），但不能重复创建"前端"
- 用户有"MySQL"分类 → MySQL书签 → 归入"MySQL"（不是"数据库"）

### 3. 内容相关性判断（多维分析）
**不仅看标题，还要综合分析**：
- URL 域名：react.dev → React，spring.io → Spring
- 页面标题：包含 "React" 或 "Component" 或 "Hook"
- 页面摘要：描述的是 React 教程还是通用前端内容
- 路径特征：/docs/react → React 文档，/api/next → Next.js API

**中文标题特别处理**：
- "React 入门教程" → React
- "Vue3 组件开发" → Vue（注意是 Vue3）
- "Spring Boot 实战项目" → Spring Boot
- "Python 数据分析入门" → Python（数据分析方向）

### 4. 分类结构建议（大类+细类）
**合理的分类结构应该包含**：

**推荐结构示例**：

**场景 1：技术类书签较多（30-50 条）**
建议创建：
- 前端开发（通用前端内容：最佳实践、性能优化、工程化）
  - 内容：前端架构、性能优化、工程化实践等跨技术栈内容
- React（React 专项）
  - 内容：React 官方文档、React 教程、React Hooks 等
- Vue（Vue 专项）
  - 内容：Vue.js 文档、Vue3 教程、Vue 组件等
- 构建工具（Webpack、Vite 等）
  - 内容：构建配置、打包优化等

**场景 2：设计类书签较多（20-40 条）**
建议创建：
- UI设计（通用UI内容：设计规范、设计系统）
  - 内容：UI设计原则、设计规范、用户体验等
- Figma（Figma 专项）
  - 内容：Figma 教程、Figma 组件、Figma 插件等
- 平面设计（Photoshop、Illustrator 等）
  - 内容：PS/AI 教程、设计技巧、作品集等
- 设计资源（图标、插画、字体等）
  - 内容：设计素材、资源网站、模板等

**场景 3：财经类书签（15-30 条）**
建议创建：
- 投资理财（通用投资内容）
  - 内容：投资理念、资产配置、理财规划等
- 股票基金（股票和基金专项）
  - 内容：股票分析、基金选择、投资策略等
- 创业管理（创业和企业管理）
  - 内容：创业经验、企业管理、商业案例等

**场景 4：人文社科类书签（20-30 条）**
建议创建：
- 历史（历史类内容）
  - 内容：中国历史、世界史、历史事件等
- 心理学（心理学内容）
  - 内容：认知心理学、社会心理学、心理学应用等
- 哲学（哲学内容）
  - 内容：西方哲学、东方哲学、哲学思想等

**场景 5：书籍阅读类书签（10-20 条）**
建议创建：
- 书单推荐（各类书单）
  - 内容：技术书单、商业书单、人文书单等
- 阅读笔记（读书笔记）
  - 内容：书籍读后感、读书笔记、书评等
- 电子书资源（电子书网站）
  - 内容：PDF 下载、在线阅读、电子书库等

**场景 6：混合内容（技术+设计+其他）**
建议创建：
- 技术类：
  - 前端开发、后端开发、React、Vue 等
- 设计类：
  - UI设计、Figma、设计资源等
- 其他类：
  - 投资理财、心理学、书单推荐等

### 5. 分类粒度评分标准
**优秀分类（5 分）**：
- **技术类**：具体技术栈（React、Vue、Spring Boot），5-30 条
- **设计类**：具体工具（Figma、Photoshop），5-25 条
- **内容类**：具体领域（投资理财、心理学、书单推荐），10-40 条
- **大类**：技术领域（前端开发、UI设计），15-60 条
- 相关性：内容主题一致，边界清晰

**良好分类（3-4 分）**：
- **技术类**：具体技术（3-5 条，或 30-50 条）
- **设计类**：设计领域（UI设计、平面设计），10-40 条
- **内容类**：较宽泛领域（商业管理、人文社科），20-50 条
- **大类**：较宽泛但有意义（开发工具、设计资源），20-80 条
- 相关性：大部分内容相关

**需要改进（1-2 分）**：
- 过宽泛：技术文档、教程合集、学习资源、设计资源（> 80 条）
- 过细分：某个库的特定版本（React Hooks 18 vs 19）
- 数量不当：1-2 条或 > 100 条
- 类型混淆：技术类和设计类混在一起

**拒绝创建（0 分）**：
- 无意义分类：收藏、书签、全部、未分类
- 重复分类：与现有分类语义完全相同

### 6. 分类粒度平衡（大类+细类）
**理想结构：适度的大类 + 具体的细类**

**生成数量建议**：
- 每批书签生成 **8-15 个分类**（大类+细类组合）
- 其中：2-4 个大类（通用内容）+ 6-11 个细类（具体技术/领域）
- 如果书签内容集中在某个技术或领域，可以灵活调整

**技术类书签**：
- **细类（具体技术栈）**：
  - ✅ 单一技术内容 ≥ 5 条：创建独立分类
  - ✅ 例如：React（10 条）、Vue（8 条）、Docker（15 条）
  - ✅ 例如：Spring Boot（12 条）、Python Django（9 条）
- **大类（技术领域）**：
  - ✅ 跨技术栈的通用内容：创建领域分类
  - ✅ 例如：前端开发（20-40 条）：包含性能优化、架构设计等
  - ✅ 例如：后端开发（15-30 条）：包含 API 设计、系统设计等

**设计类书签**：
- **细类（具体工具）**：
  - ✅ 单一工具内容 ≥ 5 条：创建独立分类
  - ✅ 例如：Figma（12 条）、Photoshop（8 条）
  - ✅ 例如：Illustrator（6 条）、Sketch（5 条）
- **大类（设计领域）**：
  - ✅ 跨工具的通用内容：创建领域分类
  - ✅ 例如：UI设计（15-40 条）：包含设计规范、设计系统等
  - ✅ 例如：平面设计（15-35 条）：包含品牌设计、排版等

**内容类书签**（财经、人文、书籍等）：
- **细类（具体主题）**：
  - ✅ 单一主题内容 ≥ 10 条：创建独立分类
  - ✅ 例如：投资理财（15 条）、心理学（12 条）
  - ✅ 例如：书单推荐（10 条）、创业管理（8 条）
- **大类（内容领域）**：
  - ✅ 相关主题的聚合：创建领域分类
  - ✅ 例如：财经商业（20-50 条）：包含投资、创业、营销等
  - ✅ 例如：人文社科（20-50 条）：包含历史、哲学、心理学等
  - ✅ 例如：书籍阅读（15-40 条）：包含书单、阅读笔记等

**何时大类+细类共存**：
- ✅ 前端开发（通用前端内容，20-40 条）
  - React（React 专项，10-20 条）
  - Vue（Vue 专项，8-15 条）
  - Angular（Angular 专项，5-10 条）
- ✅ UI设计（通用UI内容，15-30 条）
  - Figma（Figma 专项，8-15 条）
  - Sketch（Sketch 专项，5-10 条）
- ✅ 财经商业（通用财经内容，20-35 条）
  - 投资理财（投资专项，10-18 条）
  - 创业管理（创业专项，8-12 条）

**分类规模建议**：
- **细类（具体技术）**：5-30 条（React、Vue、Docker）
- **大类（技术领域）**：15-60 条（前端开发、后端开发）
- **避免超大类**：> 80 条需要考虑拆分
- **避免过小类**：< 3 条考虑合并或放入"其他"

### 7. 兜底分类（谨慎使用）
**对于无法明确分类的内容**：
- "其他"（无法归入任何技术栈，< 15 条）
- "工具资源"（通用工具、设计资源，< 15 条）
- "学习资源"（综合教程、文档，< 15 条）
- "未分类"（暂时无法判断的，< 10 条）

**注意**：兜底分类应该尽量少用，尽量归入具体技术或技术领域

### 8. 多分类归属
- 一条收藏可以属于多个分类（最多 3 个）
- 例如：React Hooks 教程 → React + JavaScript
- 例如：Next.js 部署 → Next.js + Docker

## 输出格式

严格返回 JSON，不要添加任何解释文字：

\`\`\`json
{
  "categories": [
    {
      "name": "分类名称（具体技术栈）",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "reason": "分类原因（简短说明）"
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
\`\`\`

## 分类示例

### 示例 1：前端书签混合（推荐大类+细类）
**输入书签**（35 条）：
- React 官方文档、React Hooks 教程、React 性能优化
- Vue.js 3.0 教程、Vue3 Composition API、Vue 组件开发
- Angular 入门、Angular Services
- Next.js 文档、Next.js App Router
- TypeScript 手册、TypeScript 泛型、TS 配置指南
- Tailwind CSS、Tailwind 响应式设计
- Webpack 配置指南、Vite 快速上手
- ESLint 配置、Prettier 使用
- 前端性能优化、Web 最佳实践、前端架构设计
- CSS Grid、Flexbox 布局
- JavaScript 异步编程、ES6+ 新特性

**推荐分类**（大类+细类）：
- 前端开发（5 条：性能优化、最佳实践、架构设计、CSS 布局、JS 进阶）
  - 说明：跨技术栈的通用前端内容
- React（3 条：React 官方文档、Hooks、性能优化）
  - 说明：React 专项内容
- Vue（3 条：Vue.js 教程、Composition API、组件开发）
  - 说明：Vue 专项内容
- Angular（2 条：Angular 入门、Services）
- TypeScript（3 条：TypeScript 手册、泛型、配置）
- 构建工具（2 条：Webpack、Vite）
- 开发工具（2 条：ESLint、Prettier）

**不推荐分类**（太细分）：
- React Hooks（1 条）
- Vue3 组件（1 条）
- CSS Grid（1 条）
- JavaScript 异步（1 条）

**不推荐分类**（太宽泛）：
- 前端（35 条 - 所有内容）
- 技术文档（35 条 - 无意义）

### 示例 2：后端书签混合
**输入书签**（25 条）：
- Spring Boot 官方文档、Spring 教程、Spring Cloud
- Node.js Express 教程、Koa 框架、NestJS 入门
- Python Django 入门、Flask 教程、FastAPI
- Go Gin 框架、Go 标准库
- .NET Core MVC、C# 语言
- Redis 缓存实战、MongoDB 数据库
- MySQL 优化指南、PostgreSQL 教程
- Docker 容器化、Kubernetes 部署
- 微服务架构、RESTful API 设计、系统设计
- Git 使用、GitHub 教程

**推荐分类**（大类+细类）：
- 后端开发（3 条：微服务架构、API 设计、系统设计）
  - 说明：通用的后端架构和设计内容
- Java/Spring（3 条：Spring Boot、Spring Cloud、Spring 教程）
- Node.js（3 条：Express、Koa、NestJS）
- Python（3 条：Django、Flask、FastAPI）
- Go/Golang（2 条：Gin 框架、标准库）
- .NET/C#（2 条：.NET Core、C#）
- 数据库（5 条：Redis、MongoDB、MySQL、PostgreSQL）
  - 说明：数据库专项内容足够多，可以独立分类
- 运维部署（2 条：Docker、Kubernetes）
- 开发工具（2 条：Git、GitHub）

### 示例 3：合理的大类
**何时应该创建大类**：

✅ **推荐创建大类（技术类）**：
- 前端开发（包含：前端架构、性能优化、工程化、最佳实践等跨技术栈内容）
- 后端开发（包含：架构设计、API 设计、系统设计等跨技术栈内容）
- 移动开发（包含：iOS 和 Android 的通用内容）
- 数据库（包含：多种数据库的设计、优化等通用内容）
- 开发工具（包含：Git、IDE、调试工具等）

✅ **推荐创建大类（设计类）**：
- UI设计（包含：设计规范、设计系统、用户体验等）
- 平面设计（包含：品牌设计、排版设计、视觉设计等）
- 设计资源（包含：图标、插画、字体、配色等）

✅ **推荐创建大类（内容类）**：
- 财经商业（包含：投资、创业、营销等商业相关内容）
- 人文社科（包含：历史、哲学、心理学、社会学等）
- 书籍阅读（包含：书单推荐、阅读笔记、电子书资源等）

❌ **不推荐创建大类**：
- 技术文档（太宽泛，所有书签都是文档）
- 教程合集（太宽泛，没有明确主题）
- 编程语言（太宽泛，应该细分到具体语言）
- 学习资料（太宽泛，没有明确分类）
- 设计（太宽泛，应该细分到 UI设计、平面设计等）
- 书籍（太宽泛，应该细分到书单、阅读笔记等）

### 示例 4：设计类书签分类
**输入书签**（25 条）：
- Figma 官方文档、Figma 教程、Figma 组件库
- Sketch 入门、Sketch 插件推荐
- UI设计原则、用户体验设计、设计系统
- Photoshop 教程、PS 抠图技巧
- Illustrator 插画设计、AI 图标设计
- 图标素材网站、免费字体下载、配色方案网站
- Dribbble、Behance 作品集网站
- 设计灵感网站、UI/UX 博客

**推荐分类**（大类+细类）：
- UI设计（3 条：UI设计原则、用户体验设计、设计系统）
  - 说明：通用的 UI/UX 理论和方法
- Figma（3 条：Figma 官方文档、Figma 教程、Figma 组件库）
  - 说明：Figma 专项内容
- 设计资源（5 条：图标素材、免费字体、配色方案、Dribbble、Behance）
  - 说明：设计素材和资源网站
- 设计灵感（2 条：设计灵感网站、UI/UX 博客）
  - 说明：设计参考和灵感
- Photoshop（2 条：PS 教程、PS 抠图技巧）
- Illustrator（2 条：AI 插画设计、AI 图标设计）

### 示例 5：财经类书签分类
**输入书签**（20 条）：
- 股票入门教程、基金定投指南、债券投资基础
- 个人理财规划、理财知识科普、资产配置
- 创业经验分享、创业案例分析
- 企业管理、团队管理、领导力
- 数字营销、SEO 优化、社交媒体营销
- 经济学原理、宏观经济分析
- 财经新闻网站、投资社区

**推荐分类**（大类+细类）：
- 投资理财（5 条：股票、基金、债券、理财规划、资产配置）
  - 说明：个人投资和理财相关内容
- 创业管理（5 条：创业经验、企业管理、团队管理、领导力）
  - 说明：创业和管理相关内容
- 市场营销（3 条：数字营销、SEO、社交媒体营销）
- 经济学（2 条：经济学原理、宏观经济分析）
- 财经资讯（2 条：财经新闻、投资社区）

### 示例 6：人文社科类书签分类
**输入书签**（18 条）：
- 中国通史、世界通史、近代史
- 西方哲学史、中国哲学史、哲学导论
- 认知心理学、社会心理学、心理学与生活
- 社会学概论、政治学原理、法学导论
- 历史纪录片、哲学公开课
- 读书笔记、书评推荐

**推荐分类**（大类+细类）：
- 历史（3 条：中国通史、世界通史、近代史）
  - 说明：历史类内容，数量较少可考虑合并
- 哲学（3 条：西方哲学史、中国哲学史、哲学导论）
- 心理学（3 条：认知心理学、社会心理学、心理学与生活）
- 人文社科（6 条：社会学、政治学、法学、纪录片、公开课）
  - 说明：其他人文社科内容的聚合
- 书籍阅读（3 条：读书笔记、书评推荐）
  - 说明：阅读相关内容

### 示例 7：用户有精准分类时的处理
**输入书签**（15 条）：
- Oracle 官方文档、Oracle 教程、Oracle 性能优化
- MySQL 入门、MySQL 实战、MySQL 优化
- Redis 缓存、Redis 集群

**用户现有分类**：Oracle（5 条）

**推荐分类**（优先使用用户现有分类）：
- Oracle（3 条：Oracle 官方文档、Oracle 教程、Oracle 性能优化）
  - 说明：用户已有Oracle分类，必须优先使用
- MySQL（3 条：MySQL 入门、MySQL 实战、MySQL 优化）
  - 说明：创建MySQL分类
- Redis（2 条：Redis 缓存、Redis 集群）
  - 说明：创建Redis分类

**不推荐分类**：
- 数据库（9 条 - 太宽泛，用户已有精准的Oracle分类）
- 或任何其他与Oracle相似的新分类

**关键判断逻辑**：
- 看到标题/URL包含"Oracle" → 必须归入"Oracle"分类
- 看到标题/URL包含"MySQL" → 归入"MySQL"分类
- 即使"Oracle"分类只有5条书签，也要归入"Oracle"，不要创建"数据库"

**原则**：
- 如果用户已有"Oracle"、"MySQL"、"Redis"等精准分类，永远不要创建"数据库"大类
- 如果用户没有任何数据库分类，才考虑创建"数据库"大类

### 示例 8：避免创建重复分类
**输入书签**（20 条）：
- React 官方文档、React 教程、React Hooks
- Vue.js 文档、Vue 教程
- 前端性能优化、CSS Grid 布局

**用户现有分类**：前端（10 条，包含各种前端技术书签）

**推荐分类**（不创建重复的"前端"分类）：
- React（3 条：React 官方文档、React 教程、React Hooks）
  - 说明：创建React子分类
- Vue（2 条：Vue.js 文档、Vue 教程）
  - 说明：创建Vue子分类
- 前端（2 条：前端性能优化、CSS Grid 布局）
  - 说明：使用用户已有的"前端"分类

**绝对禁止**：
- 重复创建名为"前端"的新分类
- 创建名为"Web开发"、"前端开发"等相似名称的分类

**判断逻辑**：
- 首先检查：用户是否已有"前端"分类？
  - 如果有 → 直接使用，不要创建新分类
  - 如果没有 → 才考虑创建"前端"分类

### 示例 9：混合内容分类（技术+设计+其他）
**输入书签**（50 条）：
- **技术类**（25 条）：React、Vue、Spring Boot、Python、Docker 等
- **设计类**（15 条）：Figma、UI设计、Photoshop、设计资源等
- **财经类**（6 条）：投资理财、股票基金
- **人文类**（4 条）：心理学、历史

**推荐分类**（大类+细类组合）：

**技术类**：
- 前端开发（3 条）
- React（5 条）
- Vue（4 条）
- 后端开发（2 条）
- Python（3 条）
- Docker（3 条）
- 开发工具（5 条）

**设计类**：
- UI设计（3 条）
- Figma（4 条）
- 设计资源（5 条）
- Photoshop（3 条）

**其他类**：
- 投资理财（6 条）
- 心理学（3 条）
- 历史（1 条，建议放入"其他"或"人文社科"大类）

**总计**：14 个分类（3 个大类 + 11 个细类）

## 质量检查清单
输出前必须检查：

**【最优先】用户现有分类检查**：
- [ ] **现有分类使用**：是否充分利用了用户所有现有分类？
- [ ] **避免重复**：是否创建了与用户现有分类相似或重复的新分类？
- [ ] **精准优先**：是否优先使用了用户的精准分类（如"Oracle"）而不是大类（如"数据库"）？
  - 如果用户有"Oracle" → Oracle书签必须归入"Oracle"，不能归入"数据库"
  - 如果用户有"前端" → 不能创建新的"Web开发"、"前端开发"等相似分类
  - 如果用户有"MySQL" → MySQL书签必须归入"MySQL"，不能归入"数据库"

**其他检查项**：
- [ ] **分类粒度**：是否合理的大类+细类组合？
- [ ] **大类检查**：大类（> 60 条）是否有意义？能否拆分为更具体的技术领域？
- [ ] **细类检查**：细类（< 3 条）是否太少？能否合并或放入大类？
- [ ] **分类命名**：分类名称是否清晰明确？
- [ ] **内容相关性**：书签与分类的相关性是否 > 80%？
- [ ] **数量平衡**：是否避免了超大类（> 80 条）和过小类（< 2 条）？

## 注意事项
- bookmarkIds 必须使用输入中 [ID:xxx] 的 xxx 值
- confidence 范围 0-1，表示分类置信度

**【最重要】用户现有分类规则**：
- **绝对禁止创建与用户现有分类相似或重复的新分类**
- **绝对禁止将用户的精准分类合并为宽泛分类**
- **必须将书签归入用户的现有分类，即使该分类书签很少**
- 例如：用户有"Oracle"分类 → Oracle书签必须归入"Oracle"，不能创建"数据库"
- 例如：用户有"前端"分类 → 不能创建新的"Web开发"、"前端开发"等分类

**其他规则**：
- **优先使用具体技术栈名称**，但适当的大类也是允许的
- 目标是**合理的分类结构**：大类+细类，避免过度宽泛或过度细分
- 对于擦边球内容，宁可归入"其他"或相关大类也不要强行归类
- 大类应该有明确的主题（如"前端开发"），而不是泛泛的分类（如"技术文档"）
`;
}

/**
 * 每个书签在 prompt 中的最大字符数（含标题+URL+摘要）
 */
const MAX_BOOKMARK_PROMPT_CHARS = 300;

/**
 * 构建分析提示词
 * 支持 _summary 字段（由 page-summarizer 提取的页面摘要信息）
 * @param {Array} bookmarks - 书签数组（可携带 _summary）
 * @param {Array} existingCategories - 现有分类
 * @returns {string}
 */
function buildAnalysisPrompt(bookmarks, existingCategories) {
  // 确保 existingCategories 是一个数组
  const categories = existingCategories || [];

  const bookmarksList = bookmarks.map((bm, index) => {
    let entry = `${index + 1}. [ID:${bm.id}] ${truncateText(bm.title, 80)}\n   URL: ${bm.url}`;

    // 优先使用页面摘要，其次使用 description
    const summary = bm._summary;
    if (summary) {
      // 来源站点标识（URL fallback 时提供）
      if (summary.siteName) {
        entry += `\n   来源: ${summary.siteName}`;
      }
      if (summary.description) {
        entry += `\n   摘要: ${truncateText(summary.description, 120)}`;
      }
      if (summary.keywords && summary.keywords.length > 0) {
        entry += `\n   关键词: ${summary.keywords.slice(0, 5).join(', ')}`;
      }
      if (!summary.description && summary.snippet) {
        entry += `\n   摘要: ${truncateText(summary.snippet, 120)}`;
      }
    } else if (bm.description) {
      entry += `\n   摘要: ${truncateText(bm.description, 120)}`;
    }

    // 控制单条长度
    return entry.length > MAX_BOOKMARK_PROMPT_CHARS
      ? entry.slice(0, MAX_BOOKMARK_PROMPT_CHARS) + '...'
      : entry;
  }).join('\n');

  // 动态生成已有分类说明
  let existingCategoriesText = '';
  if (categories.length > 0) {
    existingCategoriesText = `## 用户现有分类（必须优先使用）

${categories.join('、')}

**重要**: 必须优先使用上述分类，不要创建新的相似分类。
如果书签明确属于某个现有分类，请使用该分类。
`;
  } else {
    existingCategoriesText = `## 用户暂无分类（首次分类）

请根据书签内容创建合理的分类：
- 技术类：React、Vue、Spring Boot、Python、Docker 等
- 设计类：UI设计、Figma、Photoshop、设计资源等
- 财经类：投资理财、创业管理、市场营销等
- 人文类：历史、哲学、心理学等
- 书籍类：书单推荐、阅读笔记等

请采用大类+细类的合理组合。`;
  }

  return `${existingCategoriesText}

## 待分类收藏列表
${bookmarksList}

## 输出要求
严格返回 JSON 格式，不要添加任何解释：

\`\`\`json
{
  "categories": [
    {
      "name": "分类名称",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "reason": "分类理由"
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
\`\`\``;
}

/**
 * 截断文本到指定长度
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

/**
 * 生成分析摘要
 * @param {Map} categories - 分类映射
 * @param {Array} existingCategories - 现有分类列表
 * @param {number} totalBookmarks - 总书签数
 * @returns {Object} 分析摘要
 */
function generateSummary(categories, existingCategories, totalBookmarks) {
  const newCategories = [];
  const adjustedCategories = [];

  let categorizedCount = 0;
  const categorizedIds = new Set();

  categories.forEach((cat) => {
    cat.bookmarkIds.forEach(id => categorizedIds.add(id));
    categorizedCount = Math.max(categorizedCount, categorizedIds.size);

    if (cat.isNew) {
      newCategories.push(cat.name);
    } else {
      // 现有分类的调整
      adjustedCategories.push({
        name: cat.name,
        addedCount: cat.bookmarkIds.length,
        removedCount: 0 // 暂不跟踪移除的项目
      });
    }
  });

  return {
    totalBookmarks,
    categorizedCount,
    newCategories,
    adjustedCategories
  };
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 校验 AI 返回的分析结果
 * @param {Object} parsed - parseAIJSON 解析后的对象
 * @param {Array<string>} inputBookmarkIds - 输入的 bookmark ID 列表
 * @returns {{ result: Object, warnings: string[] }}
 */
function validateAIResult(parsed, inputBookmarkIds) {
  const validIds = new Set(inputBookmarkIds);
  const warnings = [];

  if (!parsed.categories || !Array.isArray(parsed.categories)) {
    warnings.push('categories 字段缺失或非数组，已修正为空数组');
    parsed.categories = [];
  }

  for (const cat of parsed.categories) {
    // 校验 name
    if (!cat.name || typeof cat.name !== 'string') {
      warnings.push(`分类名称为空或无效，已修正为"未分类"`);
      cat.name = '未分类';
    }

    // 校验 confidence
    if (typeof cat.confidence !== 'number' || isNaN(cat.confidence)) {
      warnings.push(`分类"${cat.name}"的 confidence 无效 (${cat.confidence})，已修正为 0.5`);
      cat.confidence = 0.5;
    } else {
      cat.confidence = Math.min(1, Math.max(0, cat.confidence));
    }

    // 过滤无效 bookmarkIds
    const originalIds = cat.bookmarkIds || [];
    cat.bookmarkIds = originalIds.filter(id => {
      const strId = String(id);
      if (!validIds.has(strId)) {
        warnings.push(`分类"${cat.name}"中的 bookmarkId "${id}" 不存在于输入中，已移除`);
        return false;
      }
      return true;
    });
    // 确保 ID 为字符串
    cat.bookmarkIds = cat.bookmarkIds.map(String);
  }

  if (!parsed.tags || !Array.isArray(parsed.tags)) {
    parsed.tags = [];
  }

  return { result: parsed, warnings };
}

/**
 * Debug 模式分析收藏（不分批，记录完整 API 交互报文）
 * @param {Object} config - API 配置
 * @param {Array} bookmarks - 待分析的收藏列表（建议 1-5 个）
 * @param {Array} existingCategories - 用户已有的分类名称列表
 * @returns {Promise<Object>} 包含 debugLog 的完整调试信息
 */
export async function analyzeBookmarksDebug(config, bookmarks, existingCategories = []) {
  const { apiUrl, apiKey, model } = config;

  // 确保 existingCategories 是一个数组（防御性编程）
  const categories = Array.isArray(existingCategories) ? existingCategories : [];

  const debugLog = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `debug_${Date.now()}`,
    timestamp: Date.now(),
    bookmarkCount: bookmarks.length,
    bookmarks: bookmarks.map(b => ({
      id: b.id, title: b.title, url: b.url,
      hasSummary: !!b._summary,
      summaryPreview: b._summary?.description?.slice(0, 60) || null
    })),
    existingCategories: categories,
    request: null,
    response: null,
    rawContent: null,
    parsed: null,
    validation: null,
    duration: 0,
    error: null
  };

  const startTime = Date.now();

  try {
    // 构建 prompt
    const prompt = buildAnalysisPrompt(bookmarks, categories);
    const systemPrompt = getSystemPrompt();

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    };

    debugLog.request = requestBody;

    console.log('[AI Debug] 发送请求:', JSON.stringify(requestBody, null, 2));

    // 直接调用（不走 fetchWithRetry，方便调试）
    const url = `${apiUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    debugLog.response = {
      status: response.status,
      statusText: response.statusText,
      body: responseData,
      usage: responseData.usage || null
    };

    if (!response.ok) {
      const errMsg = responseData?.error?.message || responseData?.message || response.statusText;
      throw new Error(`API 请求失败 ${response.status}: ${errMsg}`);
    }

    const rawContent = responseData.choices?.[0]?.message?.content;
    debugLog.rawContent = rawContent;

    console.log('[AI Debug] 原始响应:', rawContent);

    if (!rawContent) {
      throw new Error('API 返回内容为空');
    }

    // 解析 JSON
    const parsed = parseAIJSON(rawContent);
    debugLog.parsed = parsed;

    console.log('[AI Debug] 解析结果:', JSON.stringify(parsed, null, 2));

    // 校验
    const inputIds = bookmarks.map(b => String(b.id));
    const validation = validateAIResult(parsed, inputIds);
    debugLog.validation = validation;

    if (validation.warnings.length > 0) {
      console.warn('[AI Debug] 校验警告:', validation.warnings);
    }

    debugLog.duration = Date.now() - startTime;
    return debugLog;

  } catch (error) {
    debugLog.error = error.message;
    debugLog.duration = Date.now() - startTime;
    console.error('[AI Debug] 分析失败:', error);
    return debugLog;
  }
}

/**
 * 语义搜索（增强版）
 * 支持更复杂的查询理解和结果排序
 * @param {Object} config - API 配置
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 书签数组
 * @returns {Promise<Array>} 搜索结果 ID 数组
 */
export async function semanticSearch(config, query, bookmarks) {
  const { apiUrl, apiKey, model } = config;

  // 如果收藏太多，先进行简单的本地过滤，减少 API 调用成本
  let searchBookmarks = bookmarks;
  if (bookmarks.length > 100) {
    // 简单的关键词匹配来缩小范围
    const queryLower = query.toLowerCase();
    searchBookmarks = bookmarks.filter(bm =>
      bm.title.toLowerCase().includes(queryLower) ||
      bm.url.toLowerCase().includes(queryLower) ||
      (bm.description && bm.description.toLowerCase().includes(queryLower)) ||
      (bm.tags && bm.tags.some(t => t.toLowerCase().includes(queryLower)))
    );
  }

  // 构建更详细的搜索提示
  const bookmarkList = searchBookmarks.map((bm, i) => {
    const tags = bm.tags && bm.tags.length > 0 ? ` [标签: ${bm.tags.join(', ')}]` : '';
    const desc = bm.description ? `\n   描述: ${bm.description}` : '';
    return `${i + 1}. [ID: ${bm.id}] ${bm.title}\n   URL: ${bm.url}${tags}${desc}`;
  }).join('\n');

  const prompt = `用户搜索查询："${query}"

请从以下收藏中找出最相关的，并按相关性从高到低排序。

${bookmarkList}

分析要求：
1. 理解用户的搜索意图，而不仅仅是关键词匹配
2. 考虑标题、URL、描述和标签的语义相关性
3. 即使没有完全匹配的关键词，也考虑内容相关的结果
4. 优先返回最相关的前20个结果

请返回 JSON 格式：
{
  "results": ["id1", "id2", ...],
  "reasoning": "简要说明排序依据"
}`;

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个智能搜索助手，擅长理解用户的搜索意图并找出最相关的内容。你会考虑语义相似性、主题相关性，而不仅仅是关键词匹配。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
        // 不传 response_format，以兼容不支持该参数的模型
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.warn('Empty AI response, returning empty results');
      return [];
    }

    // 解析 JSON 结果（兼容 <think> 标签 + markdown 代码块）
    let result;
    try {
      result = parseAIJSON(content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      return [];
    }

    // 验证返回的 ID 是否存在
    const validIds = new Set(searchBookmarks.map(b => b.id));
    const filteredResults = (result.results || []).filter(id => validIds.has(id));

    // 记录推理过程（用于调试）
    if (result.reasoning) {
      console.log('AI Search Reasoning:', result.reasoning);
    }

    return filteredResults;
  } catch (error) {
    console.error('Semantic search failed:', error);
    throw error;
  }
}

/**
 * 测试 API 连接（发送最小化 chat completion 请求）
 * @param {Object} config - API 配置
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testConnection(config) {
  try {
    const apiUrl = (config.apiUrl || '').replace(/\/+$/, '');
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return { ok: false, message: `服务器返回非 JSON 响应 (${response.status})，请检查 API 地址` };
    }

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || response.statusText;
      return { ok: false, message: `${response.status}: ${errMsg}` };
    }

    return { ok: true, message: '连接成功' };
  } catch (error) {
    console.error('Connection test failed:', error);
    return { ok: false, message: error.message };
  }
}
