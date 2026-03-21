/**
 * 搜索管理模块
 * 负责书签搜索、过滤和结果渲染
 */

import { escapeHtml } from '../utils/helpers.js';

/**
 * 搜索管理器类
 */
export class SearchManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.elements - DOM 元素引用
   * @param {Function} options.createBookmarkRow - 创建书签行的函数
   * @param {Function} options.onRender - 渲染回调函数
   */
  constructor({ elements, createBookmarkRow, onRender }) {
    this.elements = elements;
    this.createBookmarkRow = createBookmarkRow;
    this.onRender = onRender;
    this.searchTerm = '';
  }

  /**
   * 设置搜索词并执行搜索
   * @param {string} term - 搜索词
   * @param {Array} bookmarks - 书签列表
   */
  search(term, bookmarks) {
    this.searchTerm = term;

    if (!term.trim()) {
      if (this.elements.searchStats) this.elements.searchStats.style.display = 'none';
      this.onRender();
      return;
    }

    this.renderSearchResults(bookmarks);
  }

  /**
   * 渲染搜索结果
   * @param {Array} bookmarks - 书签列表
   */
  renderSearchResults(bookmarks) {
    const treeData = this.buildTreeData(bookmarks);
    const results = this.filterBookmarks(treeData, this.searchTerm);
    const container = this.elements.bookmarkList;
    container.innerHTML = '';

    if (this.elements.breadcrumb) {
      this.elements.breadcrumb.innerHTML = `<span class="bc-item current"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>搜索：${escapeHtml(this.searchTerm)}</span>`;
    }

    if (this.elements.searchStats) {
      this.elements.searchStats.textContent = `找到 ${results.length} 项`;
      this.elements.searchStats.style.display = '';
    }
    if (this.elements.folderStats) this.elements.folderStats.textContent = '';

    if (results.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><h3>未找到相关结果</h3><p>请尝试其他关键词</p></div>`;
      return;
    }

    const list = document.createElement('div');
    list.className = 'bm-list';
    results.forEach(bm => list.appendChild(this.createBookmarkRow(bm)));
    container.appendChild(list);
  }

  /**
   * 构建树形数据结构
   * @param {Array} bookmarks - 书签列表
   * @param {Array} categories - 分类列表
   * @returns {Array} 树形数据
   */
  buildTreeData(bookmarks, categories = []) {
    const itemMap = new Map();

    // 先添加所有分类
    if (categories && categories.length > 0) {
      categories.forEach(category => {
        itemMap.set(category.id, {
          ...category,
          title: category.name,
          type: 'folder',
          children: []
        });
      });
    }

    // 添加所有书签
    bookmarks.forEach(bookmark => {
      itemMap.set(bookmark.id, {
        ...bookmark,
        type: 'bookmark',
        children: []
      });
    });

    // 构建父子关系
    const rootItems = [];

    itemMap.forEach(item => {
      let parentId = null;
      if (item.type === 'folder') {
        parentId = item.parentId;
      } else {
        parentId = item.categoryId;
      }

      if (parentId && itemMap.has(parentId)) {
        const parent = itemMap.get(parentId);
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(item);
      } else {
        rootItems.push(item);
      }
    });

    return rootItems;
  }

  /**
   * 过滤书签（搜索功能）
   * @param {Array} items - 书签树形数据
   * @param {string} searchTerm - 搜索词
   * @returns {Array} 过滤后的书签列表
   */
  filterBookmarks(items, searchTerm) {
    const results = [];
    const term = searchTerm.toLowerCase().trim();

    if (!term) return results;

    // 递归搜索函数
    const searchItems = (items, path = '') => {
      items.forEach(item => {
        const titleMatch = item.title && item.title.toLowerCase().includes(term);
        const urlMatch = item.url && item.url.toLowerCase().includes(term);
        const tagMatch = item.tags && item.tags.some(tag =>
          tag.toLowerCase().includes(term)
        );

        if (titleMatch || urlMatch || tagMatch) {
          results.push({
            ...item,
            categoryPath: path || item.categoryName || '根目录'
          });
        }

        // 递归搜索子项
        if (item.children && item.children.length > 0) {
          const childPath = path ? `${path} / ${item.title}` : (item.title || '根目录');
          searchItems(item.children, childPath);
        }
      });
    };

    searchItems(items);
    return results;
  }

  /**
   * 高亮关键词
   * @param {string} text - 文本
   * @param {string} searchTerm - 搜索词
   * @returns {string} 高亮后的 HTML
   */
  highlightKeywords(text, searchTerm) {
    if (!text || !searchTerm) return escapeHtml(text || '');
    const keywords = searchTerm
      .toLowerCase()
      .replace(/tag:\S+/gi, '')
      .replace(/site:\S+/gi, '')
      .replace(/"/g, '')
      .trim()
      .split(/\s+/)
      .filter(k => k);
    if (keywords.length === 0) return escapeHtml(text);
    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  /**
   * 清除搜索
   */
  clear() {
    this.searchTerm = '';
    if (this.elements.searchInput) {
      this.elements.searchInput.value = '';
    }
    if (this.elements.searchStats) {
      this.elements.searchStats.style.display = 'none';
    }
  }
}

/**
 * 创建搜索管理器实例
 * @param {Object} options - 配置选项
 * @returns {SearchManager} 搜索管理器实例
 */
export function createSearchManager(options) {
  return new SearchManager(options);
}
