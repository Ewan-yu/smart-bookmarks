// Smart Bookmarks - 搜索模块入口
/**
 * 统一的搜索接口
 * 根据配置自动选择本地搜索或 AI 搜索
 */

// 导出本地搜索功能
export {
  localSearch,
  highlightMatches,
  getSearchSuggestions,
  isAdvancedQuery,
  getSearchStats
} from './local-search.js';

// 导出 AI 搜索功能
export {
  aiSemanticSearch,
  hybridSearch,
  smartSearch,
  clearSearchCache,
  getAISuggestions,
  analyzeQueryIntent
} from './ai-search.js';

/**
 * 搜索历史管理
 */
class SearchHistory {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.history = [];
    this.storageKey = 'searchHistory';
    this.load();
  }

  /**
   * 从存储加载历史
   */
  async load() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      this.history = result[this.storageKey] || [];
    } catch (error) {
      console.error('Failed to load search history:', error);
      this.history = [];
    }
  }

  /**
   * 保存历史到存储
   */
  async save() {
    try {
      await chrome.storage.local.set({
        [this.storageKey]: this.history
      });
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }

  /**
   * 添加搜索记录
   */
  async add(query) {
    if (!query || !query.trim()) {
      return;
    }

    query = query.trim();

    // 移除重复项
    this.history = this.history.filter(h => h !== query);

    // 添加到开头
    this.history.unshift(query);

    // 限制大小
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(0, this.maxSize);
    }

    await this.save();
  }

  /**
   * 获取所有历史
   */
  getAll() {
    return this.history;
  }

  /**
   * 清空历史
   */
  async clear() {
    this.history = [];
    await this.save();
  }

  /**
   * 删除特定记录
   */
  async remove(query) {
    this.history = this.history.filter(h => h !== query);
    await this.save();
  }

  /**
   * 获取建议（基于历史）
   */
  getSuggestions(query, limit = 5) {
    if (!query || !query.trim()) {
      return this.history.slice(0, limit);
    }

    const queryLower = query.toLowerCase();
    return this.history
      .filter(h => h.toLowerCase().includes(queryLower))
      .slice(0, limit);
  }
}

// 导出搜索历史实例
export const searchHistory = new SearchHistory();

/**
 * 统一搜索接口
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} aiConfig - AI 配置（可选）
 * @param {Object} options - 搜索选项
 * @returns {Promise<Object>} 搜索结果
 */
export async function search(query, bookmarks, aiConfig = null, options = {}) {
  const {
    history = true,          // 是否记录到历史
    suggestions = false,     // 是否返回建议
    useAI = true             // 是否尝试使用 AI
  } = options;

  // 空查询
  if (!query || !query.trim()) {
    return {
      results: [],
      stats: {
        total: bookmarks.length,
        matched: 0,
        query: '',
        hasAdvanced: false,
        timestamp: Date.now()
      },
      suggestions: []
    };
  }

  // 动态导入搜索模块
  const { smartSearch } = await import('./ai-search.js');
  const { getSearchStats, getSearchSuggestions: getLocalSuggestions } = await import('./local-search.js');

  // 执行搜索
  let results;
  if (useAI && aiConfig) {
    results = await smartSearch(query, bookmarks, aiConfig, options);
  } else {
    const { localSearch } = await import('./local-search.js');
    results = localSearch(bookmarks, query, options);
  }

  // 记录到历史
  if (history && results.length > 0) {
    await searchHistory.add(query);
  }

  // 生成统计信息
  const stats = getSearchStats(results, query, bookmarks.length);

  // 生成建议
  let suggestionList = [];
  if (suggestions) {
    // 本地建议
    const historySuggestions = searchHistory.getSuggestions(query);

    // 标签建议（需要从 bookmarks 中提取）
    const allTags = new Set();
    bookmarks.forEach(b => {
      if (b.tags) {
        b.tags.forEach(t => allTags.add(t));
      }
    });

    const localSuggestions = getLocalSuggestions(query, historySuggestions, Array.from(allTags));
    suggestionList = localSuggestions;

    // 如果有 AI 配置，可以添加 AI 建议
    if (useAI && aiConfig) {
      try {
        const { getAISuggestions } = await import('./ai-search.js');
        const aiSuggestionList = await getAISuggestions(query, bookmarks, aiConfig);
        if (aiSuggestionList.length > 0) {
          suggestionList = [
            ...suggestionList,
            ...aiSuggestionList.map(s => ({
              type: 'ai',
              text: s,
              label: s
            }))
          ];
        }
      } catch (error) {
        console.error('Failed to get AI suggestions:', error);
      }
    }
  }

  return {
    results,
    stats,
    suggestions: suggestionList
  };
}

/**
 * 快速搜索（用于实时输入）
 * 只使用本地搜索，不调用 API
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @returns {Array} 匹配的收藏列表
 */
export async function quickSearch(query, bookmarks) {
  if (!query || !query.trim()) {
    return [];
  }

  const { localSearch } = await import('./local-search.js');
  return localSearch(bookmarks, query, {
    limit: 20,  // 实时搜索限制结果数量
    minScore: 1  // 只显示真正匹配的结果
  });
}

/**
 * 高级搜索（支持复杂的查询语法）
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 收藏列表
 * @returns {Array} 匹配的收藏列表
 */
export async function advancedSearch(query, bookmarks) {
  const { isAdvancedQuery, localSearch } = await import('./local-search.js');

  // 如果不是高级查询，使用普通搜索
  if (!isAdvancedQuery(query)) {
    return localSearch(bookmarks, query);
  }

  // 高级查询使用本地搜索（因为高级语法主要是本地过滤）
  return localSearch(bookmarks, query, {
    limit: 100  // 高级搜索可能返回更多结果
  });
}

/**
 * 批量搜索（搜索多个查询）
 * @param {Array<string>} queries - 查询列表
 * @param {Array} bookmarks - 收藏列表
 * @param {Object} aiConfig - AI 配置
 * @returns {Promise<Array>} 每个查询的结果
 */
export async function batchSearch(queries, bookmarks, aiConfig = null) {
  const results = [];

  for (const query of queries) {
    const result = await search(query, bookmarks, aiConfig, {
      history: false,
      suggestions: false
    });
    results.push({
      query,
      ...result
    });
  }

  return results;
}

/**
 * 创建搜索过滤器（用于高级搜索界面）
 * @returns {Object} 搜索过滤器
 */
export function createSearchFilter() {
  return {
    query: '',
    tags: [],
    sites: [],
    dateRange: {
      start: null,
      end: null
    },
    status: [],  // 'valid', 'broken', 'unknown'
    sortBy: 'relevance',  // 'relevance', 'date', 'title'
    sortOrder: 'desc'  // 'asc', 'desc'
  };
}

/**
 * 应用搜索过滤器
 * @param {Object} filter - 搜索过滤器
 * @param {Array} bookmarks - 收藏列表
 * @returns {Array} 过滤后的收藏列表
 */
export function applyFilter(filter, bookmarks) {
  let results = [...bookmarks];

  // 应用标签过滤
  if (filter.tags.length > 0) {
    results = results.filter(b => {
      if (!b.tags || b.tags.length === 0) return false;
      return filter.tags.every(ft => b.tags.some(t => t === ft));
    });
  }

  // 应用站点过滤
  if (filter.sites.length > 0) {
    results = results.filter(b => {
      return filter.sites.some(site => b.url.includes(site));
    });
  }

  // 应用日期过滤
  if (filter.dateRange.start || filter.dateRange.end) {
    results = results.filter(b => {
      if (!b.createdAt) return false;
      const date = new Date(b.createdAt);
      if (filter.dateRange.start && date < filter.dateRange.start) return false;
      if (filter.dateRange.end && date > filter.dateRange.end) return false;
      return true;
    });
  }

  // 应用状态过滤
  if (filter.status.length > 0) {
    results = results.filter(b => filter.status.includes(b.status));
  }

  // 应用查询过滤
  if (filter.query) {
    const { localSearch } = require('./local-search.js');
    const queryResults = localSearch(results, filter.query);
    const queryIds = new Set(queryResults.map(r => r.id));
    results = results.filter(r => queryIds.has(r.id));
  }

  // 排序
  results = sortResults(results, filter.sortBy, filter.sortOrder);

  return results;
}

/**
 * 排序搜索结果
 */
function sortResults(results, sortBy, sortOrder) {
  const sorted = [...results];

  switch (sortBy) {
    case 'date':
      sorted.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
      break;

    case 'title':
      sorted.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return sortOrder === 'asc'
          ? titleA.localeCompare(titleB)
          : titleB.localeCompare(titleA);
      });
      break;

    case 'relevance':
    default:
      // 按得分排序（如果有 _score 字段）
      sorted.sort((a, b) => {
        const scoreA = a._score || 0;
        const scoreB = b._score || 0;
        return sortOrder === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      });
      break;
  }

  return sorted;
}

/**
 * 导出搜索结果
 * @param {Object} searchResult - 搜索结果对象
 * @param {string} format - 导出格式 ('json', 'csv', 'html')
 * @returns {string} 导出内容
 */
export function exportSearchResults(searchResult, format = 'json') {
  const { results, stats } = searchResult;

  switch (format) {
    case 'json':
      return JSON.stringify({ results, stats }, null, 2);

    case 'csv':
      // 生成 CSV 格式
      const headers = ['标题', 'URL', '标签', '描述', '得分'];
      const rows = results.map(r => [
        r.title || '',
        r.url || '',
        (r.tags || []).join('; '),
        r.description || '',
        r._score || 0
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return csvContent;

    case 'html':
      // 生成 HTML 报告
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>搜索结果 - ${stats.query}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; }
    .stats { background: #f5f5f5; padding: 10px; margin-bottom: 20px; }
    .result { margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; }
    .title { font-weight: bold; color: #0066cc; }
    .url { color: #0066cc; font-size: 12px; }
    .description { color: #666; margin-top: 5px; }
    .tags { margin-top: 5px; }
    .tag { background: #e0e0e0; padding: 2px 6px; margin-right: 5px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>搜索结果: ${stats.query}</h1>
  <div class="stats">
    找到 ${stats.matched} 个结果，共 ${stats.total} 个收藏
  </div>
  ${results.map(r => `
    <div class="result">
      <div class="title">${r.title}</div>
      <div class="url">${r.url}</div>
      ${r.description ? `<div class="description">${r.description}</div>` : ''}
      ${r.tags && r.tags.length > 0 ? `
        <div class="tags">
          ${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('')}
</body>
</html>`;

      return html;

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
