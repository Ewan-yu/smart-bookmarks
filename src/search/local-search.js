// Smart Bookmarks - 本地搜索模块
/**
 * 本地搜索实现
 * 支持关键词匹配、标签匹配、高级搜索语法
 */

/**
 * 高级搜索语法解析器
 * 支持的语法：
 * - tag:标签名 - 按标签过滤
 * - site:域名 - 按站点过滤
 * - "关键词" - 精确匹配（短语）
 * - 排除:关键词 - 排除包含关键词的结果
 */
class SearchParser {
  constructor(query) {
    this.query = query;
    this.filters = {
      tags: [],      // 标签过滤
      sites: [],     // 站点过滤
      include: [],   // 包含关键词
      exclude: []    // 排除关键词
    };
    this.parse();
  }

  /**
   * 解析搜索查询
   */
  parse() {
    if (!this.query || !this.query.trim()) {
      return;
    }

    // 移除多余空格
    const cleanedQuery = this.query.trim();

    // 解析 tag: 标签过滤
    const tagMatches = cleanedQuery.match(/tag:(\S+)/gi);
    if (tagMatches) {
      this.filters.tags = tagMatches.map(m => m.substring(4).toLowerCase());
    }

    // 解析 site: 站点过滤
    const siteMatches = cleanedQuery.match(/site:(\S+)/gi);
    if (siteMatches) {
      this.filters.sites = siteMatches.map(m => m.substring(5).toLowerCase());
    }

    // 解析排除语法
    const excludeMatches = cleanedQuery.match(/排除:(\S+)/gi);
    if (excludeMatches) {
      this.filters.exclude = excludeMatches.map(m => m.substring(3).toLowerCase());
    }

    // 解析精确匹配（引号包裹的短语）
    const phraseMatches = cleanedQuery.match(/"([^"]+)"/g);
    if (phraseMatches) {
      this.filters.include = phraseMatches.map(p => p.slice(1, -1).toLowerCase());
    }

    // 剩余的关键词作为普通搜索词
    let remainingQuery = cleanedQuery;
    remainingQuery = remainingQuery.replace(/tag:\S+/gi, '');
    remainingQuery = remainingQuery.replace(/site:\S+/gi, '');
    remainingQuery = remainingQuery.replace(/排除:\S+/gi, '');
    remainingQuery = remainingQuery.replace(/"[^"]+"/g, '');
    remainingQuery = remainingQuery.trim();

    if (remainingQuery) {
      const keywords = remainingQuery.split(/\s+/).filter(k => k);
      this.filters.include.push(...keywords.map(k => k.toLowerCase()));
    }
  }

  /**
   * 检查收藏是否匹配搜索条件
   */
  matches(bookmark) {
    const { title, url, tags = [], description = '' } = bookmark;
    const allText = `${title} ${url} ${description} ${tags.join(' ')}`.toLowerCase();

    // 检查排除条件（如果匹配排除词，则不匹配）
    for (const exclude of this.filters.exclude) {
      if (allText.includes(exclude)) {
        return false;
      }
    }

    // 检查站点过滤
    if (this.filters.sites.length > 0) {
      const urlLower = url.toLowerCase();
      const siteMatch = this.filters.sites.some(site => urlLower.includes(site));
      if (!siteMatch) {
        return false;
      }
    }

    // 检查标签过滤
    if (this.filters.tags.length > 0) {
      const tagsLower = tags.map(t => t.toLowerCase());
      const tagMatch = this.filters.tags.every(tag =>
        tagsLower.some(t => t.includes(tag))
      );
      if (!tagMatch) {
        return false;
      }
    }

    // 检查包含条件
    if (this.filters.include.length > 0) {
      // 如果是精确匹配短语，需要整个短语存在
      const exactPhrases = this.filters.include.filter(f => f.includes(' '));
      for (const phrase of exactPhrases) {
        if (!allText.includes(phrase)) {
          return false;
        }
      }

      // 检查单个关键词（至少匹配一个）
      const singleKeywords = this.filters.include.filter(f => !f.includes(' '));
      if (singleKeywords.length > 0) {
        const hasMatch = singleKeywords.some(keyword => allText.includes(keyword));
        if (!hasMatch) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 计算匹配得分
   * 得分越高表示匹配度越高
   */
  getScore(bookmark) {
    const { title, url, tags = [], description = '' } = bookmark;
    let score = 0;

    // 标题匹配权重最高
    const titleLower = title.toLowerCase();
    for (const keyword of this.filters.include) {
      if (titleLower.includes(keyword)) {
        score += 10;
        // 完全匹配加分更多
        if (titleLower === keyword) {
          score += 20;
        }
      }
    }

    // URL 匹配
    const urlLower = url.toLowerCase();
    for (const keyword of this.filters.include) {
      if (urlLower.includes(keyword)) {
        score += 5;
      }
    }

    // 描述匹配
    const descLower = description.toLowerCase();
    for (const keyword of this.filters.include) {
      if (descLower.includes(keyword)) {
        score += 3;
      }
    }

    // 标签匹配
    const tagsLower = tags.map(t => t.toLowerCase());
    for (const keyword of this.filters.include) {
      for (const tag of tagsLower) {
        if (tag.includes(keyword)) {
          score += 7;
          break;
        }
      }
    }

    // 站点匹配加分
    for (const site of this.filters.sites) {
      if (urlLower.includes(site)) {
        score += 5;
      }
    }

    // 标签过滤加分
    for (const tag of this.filters.tags) {
      for (const bookmarkTag of tagsLower) {
        if (bookmarkTag.includes(tag)) {
          score += 8;
        }
      }
    }

    return score;
  }
}

/**
 * 本地搜索函数
 * @param {Array} bookmarks - 收藏列表
 * @param {string} query - 搜索查询
 * @param {Object} options - 搜索选项
 * @returns {Array} 匹配的收藏列表（按相关性排序）
 */
export function localSearch(bookmarks, query, options = {}) {
  const {
    limit = 50,           // 最多返回结果数
    minScore = 0          // 最低得分阈值
  } = options;

  // 空查询返回空数组
  if (!query || !query.trim()) {
    return [];
  }

  // 解析搜索查询
  const parser = new SearchParser(query);

  // 过滤并计算得分
  const results = bookmarks
    .map(bookmark => ({
      bookmark,
      score: parser.matches(bookmark) ? parser.getScore(bookmark) : -1
    }))
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)  // 按得分降序排序
    .slice(0, limit)
    .map(item => ({
      ...item.bookmark,
      _score: item.score,  // 保留得分用于显示
      _matches: extractMatches(item.bookmark, parser.filters.include)
    }));

  return results;
}

/**
 * 提取匹配的关键词位置
 * 用于高亮显示
 */
function extractMatches(bookmark, keywords) {
  const { title, url, description = '' } = bookmark;
  const matches = {
    title: [],
    url: [],
    description: []
  };

  keywords.forEach(keyword => {
    // 在标题中查找
    let index = title.toLowerCase().indexOf(keyword);
    while (index !== -1) {
      matches.title.push({
        start: index,
        end: index + keyword.length,
        text: title.substring(index, index + keyword.length)
      });
      index = title.toLowerCase().indexOf(keyword, index + 1);
    }

    // 在 URL 中查找
    index = url.toLowerCase().indexOf(keyword);
    while (index !== -1) {
      matches.url.push({
        start: index,
        end: index + keyword.length,
        text: url.substring(index, index + keyword.length)
      });
      index = url.toLowerCase().indexOf(keyword, index + 1);
    }

    // 在描述中查找
    index = description.toLowerCase().indexOf(keyword);
    while (index !== -1) {
      matches.description.push({
        start: index,
        end: index + keyword.length,
        text: description.substring(index, index + keyword.length)
      });
      index = description.toLowerCase().indexOf(keyword, index + 1);
    }
  });

  return matches;
}

/**
 * 高亮文本中的匹配关键词
 * @param {string} text - 原文本
 * @param {Array} matches - 匹配位置数组
 * @returns {string} 带高亮标记的 HTML
 */
export function highlightMatches(text, matches = []) {
  if (!matches || matches.length === 0) {
    return escapeHtml(text);
  }

  // 按位置排序
  const sorted = [...matches].sort((a, b) => a.start - b.start);

  // 合并重叠的匹配
  const merged = [];
  for (const match of sorted) {
    if (merged.length === 0) {
      merged.push({ ...match });
    } else {
      const last = merged[merged.length - 1];
      if (match.start <= last.end) {
        // 重叠，合并
        last.end = Math.max(last.end, match.end);
      } else {
        merged.push({ ...match });
      }
    }
  }

  // 构建带高亮的 HTML
  let result = '';
  let lastIndex = 0;

  for (const match of merged) {
    // 添加匹配前的文本
    result += escapeHtml(text.substring(lastIndex, match.start));
    // 添加高亮的文本
    result += `<mark>${escapeHtml(text.substring(match.start, match.end))}</mark>`;
    lastIndex = match.end;
  }

  // 添加剩余文本
  result += escapeHtml(text.substring(lastIndex));

  return result;
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 获取搜索建议
 * 基于历史搜索和当前输入提供建议
 * @param {string} query - 当前查询
 * @param {Array} searchHistory - 搜索历史
 * @param {Array} tags - 可用标签列表
 * @returns {Array} 建议列表
 */
export function getSearchSuggestions(query, searchHistory = [], tags = []) {
  const suggestions = [];
  const queryLower = query.toLowerCase();

  // 如果输入了冒号，提供语法提示
  if (query.includes(':')) {
    const prefix = query.split(':')[0].toLowerCase();

    if (prefix === 'tag' || prefix === '标签') {
      // 标签建议
      tags.forEach(tag => {
        if (tag.toLowerCase().includes(queryLower.replace(/tag:/, '').trim())) {
          suggestions.push({
            type: 'tag',
            text: `tag:${tag}`,
            label: tag
          });
        }
      });
    } else if (prefix === 'site' || prefix === '站点') {
      // 可以提供常用站点建议
      const commonSites = ['github.com', 'stackoverflow.com', 'developer.mozilla.org'];
      commonSites.forEach(site => {
        if (site.includes(queryLower.replace(/site:/, '').trim())) {
          suggestions.push({
            type: 'site',
            text: `site:${site}`,
            label: site
          });
        }
      });
    }
  } else {
    // 历史搜索建议
    searchHistory
      .filter(h => h.toLowerCase().startsWith(queryLower))
      .slice(0, 5)
      .forEach(h => {
        suggestions.push({
          type: 'history',
          text: h,
          label: h
        });
      });

    // 标签建议（作为快捷方式）
    tags
      .filter(t => t.toLowerCase().includes(queryLower))
      .slice(0, 3)
      .forEach(tag => {
        suggestions.push({
          type: 'tag-quick',
          text: `tag:${tag}`,
          label: `按标签 "${tag}" 搜索`
        });
      });
  }

  return suggestions;
}

/**
 * 检查是否是高级搜索语法
 */
export function isAdvancedQuery(query) {
  return /tag:|site:|排除:|"[^"]+"/.test(query);
}

/**
 * 获取搜索统计信息
 */
export function getSearchStats(results, query, totalBookmarks) {
  return {
    total: totalBookmarks,
    matched: results.length,
    query: query,
    hasAdvanced: isAdvancedQuery(query),
    timestamp: Date.now()
  };
}
