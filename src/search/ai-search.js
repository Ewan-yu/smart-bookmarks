// Smart Bookmarks - AI 语义搜索模块
/**
 * AI 语义搜索实现
 * 使用 AI 模型理解查询语义并找到最相关的收藏
 */

import { semanticSearch as openaiSemanticSearch } from '../api/openai.js';

/**
 * AI 搜索缓存
 * 避免重复的 API 调用
 */
class SearchCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * 生成缓存键
   */
  getKey(query, bookmarkIds) {
    return `${query}:${bookmarkIds.sort().join(',')}`;
  }

  /**
   * 获取缓存
   */
  get(query, bookmarkIds) {
    const key = this.getKey(query, bookmarkIds);
    const item = this.cache.get(key);

    if (item && Date.now() - item.timestamp < 5 * 60 * 1000) {
      // 缓存5分钟有效
      return item.results;
    }

    return null;
  }

  /**
   * 设置缓存
   */
  set(query, bookmarkIds, results) {
    const key = this.getKey(query, bookmarkIds);

    // 如果缓存已满，删除最旧的
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }
}

// 全局缓存实例
const searchCache = new SearchCache();

/**
 * AI 语义搜索
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} config - AI 配置
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>} 匹配的收藏列表
 */
export async function aiSemanticSearch(query, bookmarks, config, options = {}) {
  const {
    fallbackToLocal = true,  // AI 失败时是否回退到本地搜索
    useCache = true,         // 是否使用缓存
    timeout = 10000          // 超时时间（毫秒）
  } = options;

  // 空查询返回空数组
  if (!query || !query.trim()) {
    return [];
  }

  // 如果没有配置 AI，直接返回空（或回退到本地搜索）
  if (!config || !config.apiUrl || !config.apiKey) {
    if (fallbackToLocal) {
      console.log('AI not configured, falling back to local search');
      return null;  // 返回 null 表示需要回退
    }
    return [];
  }

  // 检查缓存
  const bookmarkIds = bookmarks.map(b => b.id);
  if (useCache) {
    const cached = searchCache.get(query, bookmarkIds);
    if (cached) {
      console.log('Using cached search results');
      return cached;
    }
  }

  try {
    // 使用超时机制
    const results = await Promise.race([
      performAISearch(query, bookmarks, config),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), timeout)
      )
    ]);

    // 缓存结果
    if (useCache && results) {
      searchCache.set(query, bookmarkIds, results);
    }

    return results;
  } catch (error) {
    console.error('AI semantic search failed:', error);

    if (fallbackToLocal) {
      console.log('Falling back to local search due to error');
      return null;  // 返回 null 表示需要回退
    }

    throw error;
  }
}

/**
 * 执行 AI 搜索
 */
async function performAISearch(query, bookmarks, config) {
  // 调用 OpenAI API 进行语义搜索
  const matchedIds = await openaiSemanticSearch(config, query, bookmarks);

  if (!matchedIds || matchedIds.length === 0) {
    return [];
  }

  // 根据 ID 获取完整的收藏信息
  const idMap = new Map(bookmarks.map(b => [b.id, b]));

  // 按相关性排序（AI 返回的顺序就是相关性顺序）
  const results = matchedIds
    .map(id => idMap.get(id))
    .filter(b => b !== undefined)
    .map((bookmark, index) => ({
      ...bookmark,
      _score: 100 - index,  // 基于位置的得分
      _aiRank: index + 1,   // AI 排名
      _searchType: 'ai'     // 标记为 AI 搜索
    }));

  return results;
}

/**
 * 混合搜索：结合本地搜索和 AI 搜索
 * 本地搜索快速过滤，AI 搜索进行语义理解
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} config - AI 配置
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>} 匹配的收藏列表
 */
export async function hybridSearch(query, bookmarks, config, options = {}) {
  const {
    localLimit = 50,         // 本地搜索结果限制
    aiLimit = 20,            // AI 搜索结果限制
    mergeStrategy = 'union'  // 合并策略：'union'（并集）、'intersect'（交集）、'ai-first'（AI优先）
  } = options;

  // 并行执行本地搜索和 AI 搜索
  const [localResults, aiResults] = await Promise.allSettled([
    import('./local-search.js').then(m => m.localSearch(bookmarks, query, { limit: localLimit })),
    aiSemanticSearch(query, bookmarks, config, { ...options, fallbackToLocal: false })
  ]);

  const local = localResults.status === 'fulfilled' ? localResults.value : [];
  const ai = aiResults.status === 'fulfilled' ? aiResults.value : [];

  // 如果 AI 搜索失败或未配置，回退到本地搜索
  if (!ai || ai.length === 0) {
    return local;
  }

  // 根据合并策略组合结果
  switch (mergeStrategy) {
    case 'intersect':
      // 交集：同时出现在本地搜索和 AI 搜索中的结果
      return intersectResults(local, ai);

    case 'ai-first':
      // AI 优先：主要使用 AI 结果，补充本地搜索结果
      return aiResults;

    case 'union':
    default:
      // 并集：合并两者结果，去重
      return mergeResults(local, ai, aiLimit);
  }
}

/**
 * 合并搜索结果（去重）
 */
function mergeResults(localResults, aiResults, limit) {
  const seen = new Set();
  const merged = [];

  // 优先添加 AI 结果（相关性更高）
  for (const result of aiResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push(result);
    }
  }

  // 添加本地搜索中的额外结果
  for (const result of localResults) {
    if (!seen.has(result.id) && merged.length < limit) {
      seen.add(result.id);
      merged.push({
        ...result,
        _searchType: 'local'  // 标记为本地搜索
      });
    }
  }

  return merged.slice(0, limit);
}

/**
 * 取搜索结果的交集
 */
function intersectResults(localResults, aiResults) {
  const aiIds = new Set(aiResults.map(r => r.id));
  return localResults.filter(r => aiIds.has(r.id));
}

/**
 * 智能搜索：根据配置自动选择搜索方式
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} aiConfig - AI 配置（可选）
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>} 匹配的收藏列表
 */
export async function smartSearch(query, bookmarks, aiConfig, options = {}) {
  const {
    preferAI = false,         // 优先使用 AI
    aiThreshold = 5,          // 少于这个数量的本地结果时启用 AI
    useHybrid = true          // 使用混合搜索
  } = options;

  // 检查是否配置了 AI
  const hasAI = aiConfig && aiConfig.apiUrl && aiConfig.apiKey;

  // 如果没有 AI 配置，只使用本地搜索
  if (!hasAI) {
    const { localSearch } = await import('./local-search.js');
    return localSearch(bookmarks, query, options);
  }

  // 如果优先使用 AI 或使用混合搜索
  if (preferAI || useHybrid) {
    if (useHybrid) {
      return hybridSearch(query, bookmarks, aiConfig, options);
    } else {
      return aiSemanticSearch(query, bookmarks, aiConfig, options);
    }
  }

  // 否则先尝试本地搜索，根据结果数量决定是否使用 AI
  const { localSearch } = await import('./local-search.js');
  const localResults = localSearch(bookmarks, query, options);

  if (localResults.length < aiThreshold) {
    // 结果太少，使用 AI 增强搜索
    const aiResults = await aiSemanticSearch(query, bookmarks, aiConfig, {
      ...options,
      fallbackToLocal: true
    });

    return aiResults || localResults;
  }

  return localResults;
}

/**
 * 清空搜索缓存
 */
export function clearSearchCache() {
  searchCache.clear();
}

/**
 * 获取搜索建议（基于 AI）
 * @param {string} query - 当前查询
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} config - AI 配置
 * @returns {Promise<Array>} 建议列表
 */
export async function getAISuggestions(query, bookmarks, config) {
  // 如果没有配置 AI，返回空数组
  if (!config || !config.apiUrl || !config.apiKey) {
    return [];
  }

  // 如果查询太短，不需要 AI 建议
  if (query.length < 2) {
    return [];
  }

  try {
    const prompt = `用户正在搜索"${query}"，请根据收藏列表提供5个相关的搜索建议。

${bookmarks.slice(0, 20).map((bm, i) => `${i + 1}. ${bm.title}`).join('\n')}

请返回 JSON 格式：
{
  "suggestions": ["建议1", "建议2", ...]
}`;

    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是搜索建议助手，根据用户输入提供相关的搜索建议。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return [];
    }

    const result = JSON.parse(content);
    return result.suggestions || [];
  } catch (error) {
    console.error('Failed to get AI suggestions:', error);
    return [];
  }
}

/**
 * 分析查询意图
 * @param {string} query - 搜索查询
 * @param {Object} config - AI 配置
 * @returns {Promise<Object>} 查询意图分析结果
 */
export async function analyzeQueryIntent(query, config) {
  if (!config || !config.apiUrl || !config.apiKey) {
    return {
      type: 'keyword',
      confidence: 0.5
    };
  }

  try {
    const prompt = `分析用户的搜索查询意图："${query}"

请判断这是哪种类型的搜索：
- keyword: 关键词搜索
- semantic: 语义搜索（需要理解上下文）
- specific: 具体查询（查找特定内容）
- exploratory: 探索性搜索（广泛了解某个主题）

请返回 JSON 格式：
{
  "type": "类型",
  "confidence": 0.95,
  "expandedQuery": "扩展后的查询（如果需要）"
}`;

    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是搜索意图分析助手。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { type: 'keyword', confidence: 0.5 };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to analyze query intent:', error);
    return { type: 'keyword', confidence: 0.5 };
  }
}
