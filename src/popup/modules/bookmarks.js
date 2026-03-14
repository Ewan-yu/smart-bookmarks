/**
 * 书签管理模块
 * 负责书签的加载、CRUD 操作和渲染
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml, truncateUrl } from '../utils/helpers.js';

/**
 * 书签管理器
 */
class BookmarkManager {
  constructor() {
    this.bookmarks = [];
    this.categories = [];
    this.tags = [];
  }

  /**
   * 加载所有书签和分类
   * @returns {Promise<Object>} 加载结果
   */
  async load() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ALL_DATA'
      });

      if (response && response.success) {
        this.bookmarks = response.bookmarks || [];
        this.categories = response.categories || [];
        this.tags = response.tags || [];

        // 发送事件通知
        eventBus.emit(eventBus.Events.BOOKMARKS_LOADED, {
          bookmarks: this.bookmarks,
          categories: this.categories,
          tags: this.tags
        });

        return {
          success: true,
          bookmarks: this.bookmarks,
          categories: this.categories,
          tags: this.tags
        };
      }

      return { success: false, error: '加载数据失败' };
    } catch (error) {
      console.error('[BookmarkManager] Load error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取所有书签
   * @returns {Array} 书签列表
   */
  getAll() {
    return this.bookmarks;
  }

  /**
   * 根据ID获取书签
   * @param {string} id - 书签ID
   * @returns {Object|null} 书签对象
   */
  getById(id) {
    return this.bookmarks.find(bm => bm.id === id) || null;
  }

  /**
   * 根据分类ID获取书签
   * @param {string} categoryId - 分类ID
   * @returns {Array} 书签列表
   */
  getByCategory(categoryId) {
    if (!categoryId) return this.bookmarks;
    return this.bookmarks.filter(bm => bm.categoryId === categoryId);
  }

  /**
   * 根据标签获取书签
   * @param {string} tag - 标签名
   * @returns {Array} 书签列表
   */
  getByTag(tag) {
    return this.bookmarks.filter(bm => bm.tags && bm.tags.includes(tag));
  }

  /**
   * 搜索书签
   * @param {string} searchTerm - 搜索词
   * @returns {Array} 匹配的书签列表
   */
  search(searchTerm) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return this.bookmarks;
    }

    const term = searchTerm.toLowerCase().trim();

    return this.bookmarks.filter(bm => {
      // 搜索标题
      if (bm.title && bm.title.toLowerCase().includes(term)) {
        return true;
      }

      // 搜索URL
      if (bm.url && bm.url.toLowerCase().includes(term)) {
        return true;
      }

      // 搜索概述
      if (bm.summary && bm.summary.toLowerCase().includes(term)) {
        return true;
      }

      // 搜索标签
      if (bm.tags && bm.tags.some(tag => tag.toLowerCase().includes(term))) {
        return true;
      }

      return false;
    });
  }

  /**
   * 添加书签
   * @param {Object} bookmarkData - 书签数据
   * @returns {Promise<Object>} 结果
   */
  async add(bookmarkData) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_BOOKMARK',
        bookmark: bookmarkData
      });

      if (response && response.success) {
        // 添加到本地列表
        this.bookmarks.push(response.bookmark);

        eventBus.emit(eventBus.Events.BOOKMARK_ADDED, response.bookmark);
        return { success: true, bookmark: response.bookmark };
      }

      return { success: false, error: response?.error || '添加失败' };
    } catch (error) {
      console.error('[BookmarkManager] Add error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新书签
   * @param {string} id - 书签ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 结果
   */
  async update(id, updates) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        id: id,
        updates: updates
      });

      if (response && response.success) {
        // 更新本地列表
        const index = this.bookmarks.findIndex(bm => bm.id === id);
        if (index > -1) {
          this.bookmarks[index] = { ...this.bookmarks[index], ...updates };
        }

        eventBus.emit(eventBus.Events.BOOKMARK_UPDATED, { id, updates });
        return { success: true, bookmark: this.bookmarks[index] };
      }

      return { success: false, error: response?.error || '更新失败' };
    } catch (error) {
      console.error('[BookmarkManager] Update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除书签
   * @param {string|Array} ids - 书签ID或ID列表
   * @returns {Promise<Object>} 结果
   */
  async delete(ids) {
    try {
      const idsArray = Array.isArray(ids) ? ids : [ids];
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_BOOKMARKS_BATCH',
        bookmarkIds: idsArray
      });

      if (response && response.success) {
        // 从本地列表中移除
        this.bookmarks = this.bookmarks.filter(bm => !idsArray.includes(bm.id));

        eventBus.emit(eventBus.Events.BOOKMARKS_DELETED, {
          ids: idsArray,
          count: response.deletedCount || idsArray.length
        });

        return { success: true, deletedCount: response.deletedCount || idsArray.length };
      }

      return { success: false, error: response?.error || '删除失败' };
    } catch (error) {
      console.error('[BookmarkManager] Delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 移动书签到指定文件夹
   * @param {string} bookmarkId - 书签ID
   * @param {string} targetFolderId - 目标文件夹ID
   * @returns {Promise<Object>} 结果
   */
  async moveToFolder(bookmarkId, targetFolderId) {
    try {
      const bookmark = this.getById(bookmarkId);
      if (!bookmark) {
        return { success: false, error: '书签不存在' };
      }

      const response = await chrome.runtime.sendMessage({
        type: 'MOVE_BOOKMARK',
        bookmarkId: bookmarkId,
        targetCategoryId: targetFolderId
      });

      if (response && response.success) {
        // 更新本地数据
        bookmark.categoryId = targetFolderId;

        eventBus.emit(eventBus.Events.BOOKMARK_UPDATED, {
          id: bookmarkId,
          updates: { categoryId: targetFolderId }
        });

        return { success: true };
      }

      return { success: false, error: response?.error || '移动失败' };
    } catch (error) {
      console.error('[BookmarkManager] Move error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 重新生成概述
   * @param {string} bookmarkId - 书签ID
   * @returns {Promise<Object>} 结果
   */
  async regenerateSummary(bookmarkId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REGENERATE_SUMMARY',
        id: bookmarkId
      });

      if (response && response.success) {
        // 更新本地数据
        const bookmark = this.getById(bookmarkId);
        if (bookmark) {
          bookmark.summary = response.summary;
        }

        return { success: true, summary: response.summary };
      }

      return { success: false, error: response?.error || '生成失败' };
    } catch (error) {
      console.error('[BookmarkManager] Regenerate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 拖拽排序书签
   * @param {string} draggedId - 拖拽的书签ID
   * @param {string} targetId - 目标位置的书签ID
   * @param {number} clientY - 鼠标Y坐标（用于确定插入位置）
   * @returns {Promise<Object>} 结果
   */
  async reorder(draggedId, targetId, clientY) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REORDER_BOOKMARK',
        draggedId: draggedId,
        targetId: targetId,
        position: 'after' // 简化处理，可以改进
      });

      if (response && response.success) {
        return { success: true };
      }

      return { success: false, error: response?.error || '排序失败' };
    } catch (error) {
      console.error('[BookmarkManager] Reorder error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取书签统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      total: this.bookmarks.length,
      byCategory: this._countByCategory(),
      byTag: this._countByTag(),
      recentCount: this.bookmarks.filter(bm => {
        const daysDiff = (Date.now() - bm.createdAt) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7; // 最近7天
      }).length
    };
  }

  /**
   * 统计各分类的书签数量
   * @private
   */
  _countByCategory() {
    const counts = {};
    this.bookmarks.forEach(bm => {
      const catId = bm.categoryId || 'uncategorized';
      counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }

  /**
   * 统计各标签的书签数量
   * @private
   */
  _countByTag() {
    const counts = {};
    this.bookmarks.forEach(bm => {
      if (bm.tags) {
        bm.tags.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      }
    });
    return counts;
  }
}

// 创建单例实例
const bookmarkManager = new BookmarkManager();

export default bookmarkManager;
