/**
 * 文件夹管理模块
 * 负责文件夹的创建、删除、重命名、合并等操作
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml, asyncConfirm } from '../utils/helpers.js';
import bookmarkManager from './bookmarks.js';

/**
 * 文件夹管理器
 */
class FolderManager {
  constructor() {
    this.categories = [];
  }

  /**
   * 初始化
   */
  init() {
    this._bindEvents();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听分类变更
    eventBus.on(eventBus.Events.CATEGORIES_CHANGED, () => {
      this._loadCategories();
    });

    eventBus.on(eventBus.Events.BOOKMARKS_LOADED, (data) => {
      if (data && data.categories) {
        this.categories = data.categories;
      }
    });
  }

  /**
   * 加载分类
   * @private
   */
  async _loadCategories() {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CATEGORIES'
    });

    if (response && response.success) {
      this.categories = response.categories || [];
    }
  }

  /**
   * 创建文件夹
   * @param {string} name - 文件夹名称
   * @param {string} parentId - 父文件夹ID（可选）
   * @returns {Promise<Object>} 结果
   */
  async create(name, parentId = null) {
    if (!name || name.trim().length === 0) {
      return { success: false, error: '请输入文件夹名称' };
    }

    const trimmedName = name.trim();

    // 检查名称是否重复（同级）
    if (parentId) {
      const siblings = this.categories.filter(c => c.parentId === parentId);
      const exists = siblings.some(c => c.name === trimmedName);
      if (exists) {
        return { success: false, error: '同级下已存在同名文件夹' };
      }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_CATEGORY',
        name: trimmedName,
        parentId: parentId
      });

      if (response && response.success) {
        // 添加到本地列表
        this.categories.push(response.category);

        eventBus.emit(eventBus.Events.CATEGORY_ADDED, response.category);

        Toast.success('文件夹创建成功');
        return { success: true, category: response.category };
      }

      return { success: false, error: response?.error || '创建失败' };
    } catch (error) {
      console.error('[FolderManager] Create error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 重命名文件夹
   * @param {string} categoryId - 文件夹ID
   * @param {string} newName - 新名称
   * @returns {Promise<Object>} 结果
   */
  async rename(categoryId, newName) {
    if (!newName || newName.trim().length === 0) {
      return { success: false, error: '请输入文件夹名称' };
    }

    const trimmedName = newName.trim();
    const category = this.categories.find(c => c.id === categoryId);

    if (!category) {
      return { success: false, error: '文件夹不存在' };
    }

    // 检查新名称是否重复（同级）
    const siblings = this.categories.filter(c =>
      c.parentId === category.parentId && c.id !== categoryId
    );
    const exists = siblings.some(c => c.name === trimmedName);
    if (exists) {
      return { success: false, error: '同级下已存在同名文件夹' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_CATEGORY',
        id: categoryId,
        name: trimmedName
      });

      if (response && response.success) {
        // 更新本地数据
        category.name = trimmedName;

        eventBus.emit(eventBus.Events.CATEGORY_UPDATED, {
          id: categoryId,
          name: trimmedName
        });

        Toast.success('文件夹重命名成功');
        return { success: true };
      }

      return { success: false, error: response?.error || '重命名失败' };
    } catch (error) {
      console.error('[FolderManager] Rename error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除文件夹
   * @param {string} categoryId - 文件夹ID
   * @returns {Promise<Object>} 结果
   */
  async delete(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);

    if (!category) {
      return { success: false, error: '文件夹不存在' };
    }

    // 检查是否有子内容
    const hasChildren = this.categories.some(c => c.parentId === categoryId) ||
                      bookmarkManager.bookmarks.some(bm => bm.categoryId === categoryId);

    if (hasChildren) {
      const confirmed = await asyncConfirm({
        title: '删除文件夹',
        message: `删除文件夹 "${category.name}" 后，其子内容将移动到父文件夹。确定删除吗？`,
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true
      });

      if (!confirmed) {
        return { success: false, error: '用户取消' };
      }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_FOLDER',
        folderId: categoryId
      });

      if (response && response.success) {
        // 从本地列表中移除
        this.categories = this.categories.filter(c => c.id !== categoryId);

        eventBus.emit(eventBus.Events.CATEGORY_DELETED, {
          id: categoryId,
          movedCount: response.movedCount || 0
        });

        Toast.success('文件夹已删除');
        return { success: true };
      }

      return { success: false, error: response?.error || '删除失败' };
    } catch (error) {
      console.error('[FolderManager] Delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 合并文件夹
   * @param {string} sourceId - 源文件夹ID
   * @param {string} targetId - 目标文件夹ID
   * @returns {Promise<Object>} 结果
   */
  async merge(sourceId, targetId) {
    const source = this.categories.find(c => c.id === sourceId);
    const target = this.categories.find(c => c.id === targetId);

    if (!source || !target) {
      return { success: false, error: '文件夹不存在' };
    }

    // 检查是否会造成循环嵌套
    if (this._isDescendant(targetId, sourceId)) {
      return { success: false, error: '不能将文件夹合并到其子文件夹' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'MERGE_FOLDERS',
        sourceId: sourceId,
        targetId: targetId
      });

      if (response && response.success) {
        // 从本地列表中移除源文件夹
        this.categories = this.categories.filter(c => c.id !== sourceId);

        eventBus.emit(eventBus.Events.FOLDER_DELETED, {
          id: sourceId,
          targetId: targetId
        });

        Toast.success(`已合并 "${source.name}" 到 "${target.name}"`);
        return { success: true };
      }

      return { success: false, error: response?.error || '合并失败' };
    } catch (error) {
      console.error('[FolderManager] Merge error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查是否为后代
   * @param {string} parentId - 父ID
   * @param {string} childId - 子ID
   * @returns {boolean} 是否为后代
   * @private
   */
  _isDescendant(parentId, childId) {
    let currentId = childId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = this.categories.find(c => c.id === currentId);

      if (!category) break;

      if (category.id === parentId) {
        return true;
      }

      currentId = category.parentId;
    }

    return false;
  }

  /**
   * 生成合并建议
   * @param {Function} getPathCallback - 获取路径的回调函数
   * @returns {Array} 合并建议列表
   */
  generateMergeSuggestions(getPathCallback) {
    // 动态导入 CategoryMerger
    return import('../utils/category-merger.js')
      .then(({ default: CategoryMerger }) => {
        const merger = new CategoryMerger();
        const suggestions = merger.generateMergeSuggestions(this.categories, getPathCallback);

        if (suggestions.length === 0) {
          Toast.info('未检测到需要合并的重复分类');
          return [];
        }

        return suggestions;
      });
  }

  /**
   * 显示合并建议对话框
   * @param {Array} suggestions - 合并建议列表
   */
  showMergeSuggestionsDialog(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      Toast.info('未检测到需要合并的重复分类');
      return;
    }

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog ai-merge-dialog-overlay">
        <div class="confirm-dialog merge-dialog">
          <div class="dialog-header">
            <h2><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:6px;"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>合并建议</h2>
            <button class="dialog-close" id="dialogClose" aria-label="关闭">&times;</button>
          </div>
          <div class="dialog-content">
            <p style="margin-bottom: 16px; color: var(--c-text-2);">
              检测到 ${suggestions.length} 组可能重复的分类，建议合并：
            </p>
            <div class="merge-suggestions-list">
              ${suggestions.map((suggestion, index) => {
                const confidencePercent = Math.round(suggestion.confidence * 100);
                const confidenceLevel = confidencePercent >= 85 ? 'high' : confidencePercent >= 70 ? 'medium' : 'low';
                const confidenceColor = confidenceLevel === 'high' ? '#10b981' : confidenceLevel === 'medium' ? '#f59e0b' : '#6b7280';

                const sourcePath = suggestion.sourcePath || [suggestion.source];
                const targetPath = suggestion.targetPath || [suggestion.target];

                const sourcePathDisplay = sourcePath.map((part, i) => {
                  const isLast = i === sourcePath.length - 1;
                  return `<span style="${isLast ? 'font-weight: 600; color: #ef4444;' : 'color: var(--c-text-2);'}">${escapeHtml(part)}</span>`;
                }).join('<span style="color: var(--c-text-muted); margin: 0 4px;">›</span>');

                const targetPathDisplay = targetPath.map((part, i) => {
                  const isLast = i === targetPath.length - 1;
                  return `<span style="${isLast ? 'font-weight: 600; color: #10b981;' : 'color: var(--c-text-2);'}">${escapeHtml(part)}</span>`;
                }).join('<span style="color: var(--c-text-muted); margin: 0 4px;">›</span>');

                return `
                  <label class="merge-suggestion-item" style="display: block; padding: 14px; border: 1px solid var(--c-border); border-radius: 10px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                      <input type="checkbox" checked data-index="${index}" style="flex-shrink: 0; margin-top: 2px; width: 18px; height: 18px;" />
                      <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 11px; color: var(--c-text-muted); font-weight: 600; text-transform: uppercase; white-space: nowrap; min-width: 60px;">合并源:</span>
                            <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 13px;">
                              ${sourcePathDisplay}
                            </div>
                          </div>
                          <div style="display: flex; align-items: center; gap: 8px; padding-left: 68px;">
                            <div style="flex: 1; height: 1px; background: linear-gradient(to right, var(--c-border), transparent);"></div>
                            <span style="color: var(--c-primary); font-weight: 600; font-size: 14px; padding: 2px 8px; background: var(--c-primary); color: white; border-radius: 4px; white-space: nowrap;">合并到</span>
                            <div style="flex: 1; height: 1px; background: linear-gradient(to left, var(--c-border), transparent);"></div>
                          </div>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 11px; color: var(--c-text-muted); font-weight: 600; text-transform: uppercase; white-space: nowrap; min-width: 60px;">目标:</span>
                            <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 13px;">
                              ${targetPathDisplay}
                            </div>
                          </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; padding-top: 8px; border-top: 1px dashed var(--c-border);">
                          <div style="flex: 1; font-size: 12px; color: var(--c-text-muted);">
                            ${escapeHtml(suggestion.reason)}
                          </div>
                          <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                            <span style="font-size: 11px; color: var(--c-text-muted);">置信度</span>
                            <div style="width: 60px; height: 4px; background: var(--c-bg-alt); border-radius: 2px; overflow: hidden;">
                              <div style="width: ${confidencePercent}%; height: 100%; background: ${confidenceColor}; border-radius: 2px; transition: width 0.3s;"></div>
                            </div>
                            <span style="font-size: 12px; font-weight: 700; color: ${confidenceColor};">${confidencePercent}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
            <div style="padding: 12px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>合并操作将永久删除源文件夹，请确认后再执行。源文件夹的子内容将移动到目标文件夹。
            </div>
          </div>
          <div class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 10px;">
              <button class="btn" id="dialogSelectAll" style="padding: 6px 12px; font-size: 13px;">全选</button>
              <button class="btn" id="dialogDeselectAll" style="padding: 6px 12px; font-size: 13px;">取消全选</button>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-cancel" id="dialogCancel">取消</button>
              <button class="btn btn-primary" id="dialogConfirm">应用合并</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    const closeBtn = dialog.querySelector('#dialogClose');
    const cancelBtn = dialog.querySelector('#dialogCancel');
    const confirmBtn = dialog.querySelector('#dialogConfirm');
    const selectAllBtn = dialog.querySelector('#dialogSelectAll');
    const deselectAllBtn = dialog.querySelector('#dialogDeselectAll');

    const closeDialog = () => {
      dialog.classList.add('hide');
      setTimeout(() => dialog.remove(), 300);
    };

    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);

    selectAllBtn.addEventListener('click', () => {
      dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => cb.checked = true);
      this._updateConfirmButton(dialog, suggestions);
    });

    deselectAllBtn.addEventListener('click', () => {
      dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => cb.checked = false);
      this._updateConfirmButton(dialog, suggestions);
    });

    dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this._updateConfirmButton(dialog, suggestions);
      });
    });

    confirmBtn.addEventListener('click', async () => {
      const selected = this._getSelectedSuggestions(dialog, suggestions);
      if (selected.length === 0) {
        Toast.warning('请至少选择一项');
        return;
      }
      await this._applyMerges(selected);
      closeDialog();
    });

    setTimeout(() => dialog.classList.add('show'), 10);
  }

  /**
   * 更新确认按钮文本
   * @param {Element} dialog - 对话框元素
   * @param {Array} suggestions - 建议列表
   * @private
   */
  _updateConfirmButton(dialog, suggestions) {
    const confirmBtn = dialog.querySelector('#dialogConfirm');
    const selectedCount = dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]:checked').length;
    confirmBtn.textContent = selectedCount > 0 ? `应用合并 (${selectedCount})` : '应用合并';
  }

  /**
   * 获取选中的建议
   * @param {Element} dialog - 对话框元素
   * @param {Array} suggestions - 建议列表
   * @returns {Array} 选中的建议
   * @private
   */
  _getSelectedSuggestions(dialog, suggestions) {
    const selected = [];
    dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]:checked').forEach(cb => {
      const index = parseInt(cb.dataset.index);
      selected.push(suggestions[index]);
    });
    return selected;
  }

  /**
   * 应用合并
   * @param {Array} selected - 选中的建议列表
   * @returns {Promise<Object>} 结果
   * @private
   */
  async _applyMerges(selected) {
    try {
      const results = [];

      for (const suggestion of selected) {
        const sourceCat = this.categories.find(c => c.name === suggestion.source);
        const targetCat = this.categories.find(c => c.name === suggestion.target);

        if (!sourceCat || !targetCat) {
          console.warn('[FolderManager] Category not found:', suggestion);
          continue;
        }

        const result = await this.merge(sourceCat.id, targetCat.id);
        results.push({
          source: sourceCat.name,
          target: targetCat.name,
          success: result.success
        });

        if (!result.success) {
          break; // 停止后续合并
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      if (successCount === totalCount) {
        Toast.success(`已成功合并 ${successCount} 组文件夹`);
        // 刷新数据
        await bookmarkManager.load();
      } else {
        Toast.warning(`部分合并失败：成功 ${successCount}/${totalCount}`);
      }

      return { success: successCount > 0, results };
    } catch (error) {
      console.error('[FolderManager] Apply merges error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取文件夹统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      total: this.categories.length,
      rootCount: this.categories.filter(c => !c.parentId).length,
      hasChildrenCount: this.categories.filter(c =>
        this.categories.some(child => child.parentId === c.id)
      ).length
    };
  }
}

// 创建单例实例
const folderManager = new FolderManager();

export default folderManager;
