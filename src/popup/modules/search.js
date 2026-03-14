/**
 * 搜索模块
 * 负责本地搜索、AI搜索和搜索建议
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml, debounce, highlightKeyword } from '../utils/helpers.js';
import bookmarkManager from './bookmarks.js';

/**
 * 搜索管理器
 */
class SearchManager {
  constructor() {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
    this.useAISearch = false;
    this.searchSuggestions = [];
  }

  /**
   * 初始化搜索
   */
  init() {
    this._bindEvents();
    this._setupSearchInput();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听搜索执行事件
    eventBus.on(eventBus.Events.SEARCH_PERFORMED, (data) => {
      this.performSearch(data.query, data.useAI);
    });

    // 监听搜索清除事件
    eventBus.on(eventBus.Events.SEARCH_CLEARED, () => {
      this.clearSearch();
    });
  }

  /**
   * 设置搜索输入
   * @private
   */
  _setupSearchInput() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    // 防抖搜索
    const debouncedSearch = debounce((value) => {
      this.performSearch(value, this.useAISearch);
    }, 300);

    searchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      this.searchQuery = value;

      if (value.trim().length === 0) {
        this.clearSearch();
      } else {
        debouncedSearch(value);
        this._showSuggestions(value);
      }
    });

    // 回车键直接搜索
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.performSearch(this.searchQuery, this.useAISearch);
        this._hideSuggestions();
      } else if (e.key === 'Escape') {
        this._hideSuggestions();
        searchInput.blur();
      }
    });
  }

  /**
   * 执行搜索
   * @param {string} query - 搜索词
   * @param {boolean} useAI - 是否使用AI搜索
   * @returns {Promise<Object>} 搜索结果
   */
  async performSearch(query, useAI = false) {
    if (!query || query.trim().length === 0) {
      this.clearSearch();
      return { results: [], count: 0 };
    }

    this.isSearching = true;
    this.searchQuery = query;
    this.useAISearch = useAI;

    eventBus.emit(eventBus.Events.SEARCH_PERFORMED, { query, useAI });

    try {
      let results = [];

      if (useAI) {
        // AI 语义搜索
        results = await this._aiSearch(query);
      } else {
        // 本地文本搜索
        results = this._localSearch(query);
      }

      this.searchResults = results;
      this.isSearching = false;

      eventBus.emit(eventBus.Events.SEARCH_RESULTS_UPDATED, {
        results,
        count: results.length,
        query
      });

      return { results, count: results.length };
    } catch (error) {
      console.error('[SearchManager] Search error:', error);
      this.isSearching = false;
      return { results: [], count: 0, error: error.message };
    }
  }

  /**
   * 本地搜索
   * @param {string} query - 搜索词
   * @returns {Array} 搜索结果
   * @private
   */
  _localSearch(query) {
    const bookmarks = bookmarkManager.getAll();
    const term = query.toLowerCase().trim();

    return bookmarks
      .filter(bm => this._matchBookmark(bm, term))
      .map(bm => ({
        ...bm,
        highlights: this._getHighlights(bm, term)
      }))
      .sort((a, b) => {
        // 按相关性排序：标题 > 概述 > URL
        const aScore = this._getRelevanceScore(a, term);
        const bScore = this._getRelevanceScore(b, term);
        return bScore - aScore;
      });
  }

  /**
   * AI 语义搜索
   * @param {string} query - 搜索词
   * @returns {Promise<Array>} 搜索结果
   * @private
   */
  async _aiSearch(query) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_SEARCH',
        query: query,
        bookmarks: bookmarkManager.getAll()
      });

      if (response && response.success) {
        return response.results || [];
      }

      // AI 搜索失败，回退到本地搜索
      console.warn('[SearchManager] AI search failed, falling back to local search');
      return this._localSearch(query);
    } catch (error) {
      console.error('[SearchManager] AI search error:', error);
      // 回退到本地搜索
      return this._localSearch(query);
    }
  }

  /**
   * 检查书签是否匹配搜索词
   * @param {Object} bookmark - 书签对象
   * @param {string} term - 搜索词
   * @returns {boolean} 是否匹配
   * @private
   */
  _matchBookmark(bookmark, term) {
    // 搜索标题
    if (bookmark.title && bookmark.title.toLowerCase().includes(term)) {
      return true;
    }

    // 搜索URL
    if (bookmark.url && bookmark.url.toLowerCase().includes(term)) {
      return true;
    }

    // 搜索概述
    if (bookmark.summary && bookmark.summary.toLowerCase().includes(term)) {
      return true;
    }

    // 搜索标签
    if (bookmark.tags && bookmark.tags.some(tag => tag.toLowerCase().includes(term))) {
      return true;
    }

    // 搜索分类
    const category = bookmarkManager.categories.find(c => c.id === bookmark.categoryId);
    if (category && category.name.toLowerCase().includes(term)) {
      return true;
    }

    return false;
  }

  /**
   * 获取高亮位置
   * @param {Object} bookmark - 书签对象
   * @param {string} term - 搜索词
   * @returns {Object} 高亮信息
   * @private
   */
  _getHighlights(bookmark, term) {
    const highlights = {};

    if (bookmark.title && bookmark.title.toLowerCase().includes(term)) {
      highlights.title = true;
    }

    if (bookmark.summary && bookmark.summary.toLowerCase().includes(term)) {
      highlights.summary = true;
    }

    if (bookmark.url && bookmark.url.toLowerCase().includes(term)) {
      highlights.url = true;
    }

    return highlights;
  }

  /**
   * 计算相关性分数
   * @param {Object} bookmark - 书签对象
   * @param {string} term - 搜索词
   * @returns {number} 分数（越高越相关）
   * @private
   */
  _getRelevanceScore(bookmark, term) {
    let score = 0;
    const lowerTitle = (bookmark.title || '').toLowerCase();
    const lowerSummary = (bookmark.summary || '').toLowerCase();
    const lowerUrl = (bookmark.url || '').toLowerCase();

    // 标题完全匹配
    if (lowerTitle === term) return 100;

    // 标题开头匹配
    if (lowerTitle.startsWith(term)) return 80;

    // 标题包含
    if (lowerTitle.includes(term)) score += 50;

    // 概述包含
    if (lowerSummary.includes(term)) score += 20;

    // URL 包含
    if (lowerUrl.includes(term)) score += 10;

    return score;
  }

  /**
   * 显示搜索建议
   * @param {string} query - 搜索词
   * @private
   */
  _showSuggestions(query) {
    const suggestionsContainer = document.getElementById('searchSuggestions');
    if (!suggestionsContainer) return;

    // 获取建议（基于历史、标签、分类等）
    const suggestions = this._getSuggestions(query);

    if (suggestions.length === 0) {
      suggestionsContainer.style.display = 'none';
      return;
    }

    suggestionsContainer.innerHTML = suggestions.map(suggestion => `
      <div class="suggestion-item" data-query="${escapeHtml(suggestion.query)}">
        <span class="suggestion-icon">${suggestion.icon || '🔍'}</span>
        <span class="suggestion-text">${escapeHtml(suggestion.text)}</span>
        ${suggestion.type ? `<span class="suggestion-type">${escapeHtml(suggestion.type)}</span>` : ''}
      </div>
    `).join('');

    suggestionsContainer.style.display = 'block';

    // 绑定点击事件
    suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const query = item.dataset.query;
        document.getElementById('searchInput').value = query;
        this.performSearch(query, false);
        this._hideSuggestions();
      });
    });
  }

  /**
   * 获取搜索建议
   * @param {string} query - 搜索词
   * @returns {Array} 建议列表
   * @private
   */
  _getSuggestions(query) {
    const suggestions = [];
    const lowerQuery = query.toLowerCase();

    // 标签建议
    const tags = bookmarkManager.tags;
    tags.forEach(tag => {
      if (tag.toLowerCase().startsWith(lowerQuery) && tag.toLowerCase() !== lowerQuery) {
        suggestions.push({
          query: tag,
          text: tag,
          icon: '🏷️',
          type: '标签'
        });
      }
    });

    // 分类建议
    const categories = bookmarkManager.categories;
    categories.forEach(cat => {
      if (cat.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          query: cat.name,
          text: cat.name,
          icon: '📁',
          type: '分类'
        });
      }
    });

    // 限制建议数量
    return suggestions.slice(0, 5);
  }

  /**
   * 隐藏搜索建议
   * @private
   */
  _hideSuggestions() {
    const suggestionsContainer = document.getElementById('searchSuggestions');
    if (suggestionsContainer) {
      suggestionsContainer.style.display = 'none';
    }
  }

  /**
   * 清除搜索
   */
  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
    }

    this._hideSuggestions();

    eventBus.emit(eventBus.Events.SEARCH_CLEARED);
  }

  /**
   * 切换 AI 搜索模式
   * @param {boolean} enabled - 是否启用
   */
  toggleAISearch(enabled) {
    this.useAISearch = enabled;

    // 如果有搜索词，重新搜索
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      this.performSearch(this.searchQuery, enabled);
    }
  }

  /**
   * 渲染搜索结果
   * @param {Array} results - 搜索结果
   */
  renderResults(results) {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) return;

    if (results.length === 0) {
      bookmarkList.innerHTML = `
        <div class="empty-state">
          <h3>未找到结果</h3>
          <p>尝试使用其他关键词搜索</p>
        </div>
      `;
      return;
    }

    bookmarkList.innerHTML = `
      <div class="search-results-header">
        <span class="search-results-count">${results.length} 个结果</span>
        <span class="search-results-query">"${escapeHtml(this.searchQuery)}"</span>
      </div>
      ${results.map(result => this._renderResultItem(result)).join('')}
    `;
  }

  /**
   * 渲染单个搜索结果
   * @param {Object} result - 搜索结果
   * @returns {string} HTML
   * @private
   */
  _renderResultItem(result) {
    const highlightedTitle = result.highlights?.title
      ? highlightKeyword(result.title, this.searchQuery, 'search-highlight')
      : escapeHtml(result.title);

    const highlightedSummary = result.highlights?.summary
      ? highlightKeyword(result.summary || '', this.searchQuery, 'search-highlight')
      : escapeHtml(result.summary || '');

    return `
      <div class="search-result-item" data-bookmark-id="${result.id}">
        <div class="search-result-title">${highlightedTitle}</div>
        <div class="search-result-url">${escapeHtml(result.url)}</div>
        ${result.summary ? `<div class="search-result-summary">${highlightedSummary}</div>` : ''}
        ${result.tags && result.tags.length > 0 ? `
          <div class="search-result-tags">
            ${result.tags.map(tag => `<span class="search-tag">#${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }
}

// 创建单例实例
const searchManager = new SearchManager();

export default searchManager;
