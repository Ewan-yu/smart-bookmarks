/**
 * 链接检测模块
 * 负责检测失效链接、进度显示和结果展示
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml, truncateUrl, formatDate } from '../utils/helpers.js';
import bookmarkManager from './bookmarks.js';
import dialogManager from './dialog.js';

/**
 * 链接检测管理器
 */
class LinkCheckerManager {
  constructor() {
    this.isChecking = false;
    this.checkProgress = {
      current: 0,
      total: 0,
      eta: 0
    };
    this.checkResults = [];
    this.brokenBookmarks = [];
    this.cancelToken = null;
  }

  /**
   * 初始化链接检测
   */
  init() {
    this._cacheDOMElements();
    this._bindEvents();
  }

  /**
   * 缓存DOM元素引用
   * @private
   */
  _cacheDOMElements() {
    // 缓存进度UI元素，避免重复查询
    this._progressElements = {
      section: document.getElementById('checkProgressSection'),
      fill: document.getElementById('checkProgressFill'),
      count: document.getElementById('checkProgressCount'),
      sub: document.getElementById('checkProgressSub'),
      cancelBtn: document.getElementById('cancelCheckBtn'),
      taskPanel: document.getElementById('taskPanel'),
      taskPanelToggle: document.getElementById('taskPanelToggle')
    };
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听检测进度
    eventBus.on(eventBus.Events.CHECK_PROGRESS, (progress) => {
      this.checkProgress = progress;
      this._updateProgressUI();
    });

    // 监听检测完成
    eventBus.on(eventBus.Events.CHECK_COMPLETED, (results) => {
      this.isChecking = false;
      this.checkResults = results;
      this.brokenBookmarks = results.filter(r => r.status === 'invalid' || r.status === 'uncertain');
      this._hideProgressUI();
      this._showResultsDialog(results);
    });

    // 监听检测取消
    eventBus.on(eventBus.Events.CHECK_CANCELLED, () => {
      this.isChecking = false;
      this._hideProgressUI();
      Toast.info('链接检测已取消');
    });
  }

  /**
   * 启动链接检测
   * @param {Array} bookmarkIds - 要检测的书签ID列表（可选）
   * @returns {Promise<Object>} 结果
   */
  async start(bookmarkIds = null) {
    if (this.isChecking) {
      Toast.warning('正在检测中，请稍候...');
      return { success: false, error: '检测进行中' };
    }

    const bookmarksToCheck = bookmarkIds
      ? bookmarkManager.bookmarks.filter(bm => bookmarkIds.includes(bm.id))
      : bookmarkManager.bookmarks.filter(bm => bm.url);

    if (bookmarksToCheck.length === 0) {
      Toast.warning('没有需要检测的链接');
      return { success: false, error: '无链接可检测' };
    }

    this.isChecking = true;
    this.checkProgress.total = bookmarksToCheck.length;
    this.checkProgress.current = 0;
    eventBus.emit(eventBus.Events.CHECK_STARTED);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_LINK_CHECK',
        bookmarkIds: bookmarksToCheck.map(bm => bm.id)
      });

      if (response && response.success) {
        this._showProgressUI();
        return { success: true };
      }

      this.isChecking = false;
      return { success: false, error: response?.error || '启动失败' };
    } catch (error) {
      this.isChecking = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * 取消链接检测
   * @returns {Promise<Object>} 结果
   */
  async cancel() {
    if (!this.isChecking) {
      return { success: false, error: '没有正在进行的检测' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CANCEL_LINK_CHECK'
      });

      if (response && response.success) {
        this.isChecking = false;
        eventBus.emit(eventBus.Events.CHECK_CANCELLED);
        return { success: true };
      }

      return { success: false, error: response?.error || '取消失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 显示进度 UI
   * @private
   */
  _showProgressUI() {
    const { section, cancelBtn, taskPanel, taskPanelToggle } = this._progressElements;

    if (section) {
      section.style.display = 'block';
    }

    if (cancelBtn) {
      cancelBtn.style.display = 'inline-flex';
      cancelBtn.disabled = false;
    }

    // 展开任务面板
    if (taskPanel && taskPanel.classList.contains('collapsed')) {
      if (taskPanelToggle) taskPanelToggle.click();
    }
  }

  /**
   * 更新进度 UI
   * @private
   */
  _updateProgressUI() {
    const { fill, count, sub } = this._progressElements;

    if (fill) {
      const percent = this.checkProgress.total > 0
        ? Math.round((this.checkProgress.current / this.checkProgress.total) * 100)
        : 0;
      fill.style.width = `${percent}%`;
    }

    if (count) {
      count.textContent = `${this.checkProgress.current}/${this.checkProgress.total}`;
    }

    if (sub) {
      const remaining = this.checkProgress.total - this.checkProgress.current;
      const CHECK_RATE = 2; // 每秒检测的链接数
      const eta = remaining > 0 ? `约 ${Math.ceil(remaining / CHECK_RATE)} 秒` : '';
      sub.textContent = eta;
    }
  }

  /**
   * 隐藏进度 UI
   * @private
   */
  _hideProgressUI() {
    const { section, cancelBtn } = this._progressElements;

    if (section) {
      section.style.display = 'none';
    }

    if (cancelBtn) {
      cancelBtn.style.display = 'none';
    }
  }

  /**
   * 显示结果对话框
   * @param {Array} results - 检测结果
   * @private
   */
  _showResultsDialog(results) {
    const broken = results.filter(r => r.status === 'invalid' || r.status === 'uncertain');
    const valid = results.filter(r => r.status === 'valid');

    // 构建结果摘要 HTML
    const summaryHtml = `
      <div class="check-result-summary">
        <div class="check-stat-item">
          <span class="check-stat-label">已检测</span>
          <span class="check-stat-value">${results.length}</span>
        </div>
        <div class="check-stat-item">
          <span class="check-stat-label">有效</span>
          <span class="check-stat-value" style="color: var(--c-success);">${valid.length}</span>
        </div>
        <div class="check-stat-item">
          <span class="check-stat-label">失效</span>
          <span class="check-stat-value" style="color: var(--c-danger);">${broken.length}</span>
        </div>
      </div>

      ${broken.length > 0 ? `
        <div class="broken-bookmarks-section">
          <h3 style="font-size: 14px; font-weight: 600; margin: 16px 0 12px;">失效链接</h3>
          <div class="broken-bookmarks-list" style="max-height: 300px; overflow-y: auto;">
            ${broken.map(item => this._renderBrokenItem(item)).join('')}
          </div>
        </div>
      ` : `
        <div class="empty-state">
          <h3>✓ 所有链接都有效</h3>
          <p>没有发现失效链接</p>
        </div>
      `}
    `;

    // 构建按钮配置
    const buttons = [
      {
        text: '关闭',
        class: 'btn-cancel',
        onClick: () => {
          // 点击关闭，只关闭对话框
        }
      }
    ];

    if (broken.length > 0) {
      buttons.push({
        text: '清理失效链接',
        class: 'btn-primary',
        style: 'background: var(--c-danger);',
        onClick: () => {
          this._cleanupBrokenLinks(broken);
        }
      });
    }

    // 使用 dialogManager 创建对话框
    const dialog = dialogManager.custom({
      title: '⚠️ 链接检测结果',
      content: summaryHtml,
      buttons: buttons
    });

    dialog.show();
  }

  /**
   * 渲染失效链接项
   * @param {Object} item - 检测结果项
   * @returns {string} HTML
   * @private
   */
  _renderBrokenItem(item) {
    const bookmark = bookmarkManager.getById(item.bookmarkId);
    if (!bookmark) return '';

    const statusIcon = item.status === 'invalid' ? '❌' : '⚠️';
    const statusText = item.status === 'invalid' ? '失效' : '不确定';
    const statusColor = item.status === 'invalid' ? 'var(--c-danger)' : 'var(--c-warning)';

    return `
      <div class="broken-item" data-bookmark-id="${item.bookmarkId}" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--c-border); border-radius: 8px; margin-bottom: 8px; background: var(--c-bg-alt);">
        <span style="font-size: 18px;">${statusIcon}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: var(--c-text); margin-bottom: 4px;">${escapeHtml(bookmark.title)}</div>
          <div style="font-size: 12px; color: var(--c-text-muted); margin-bottom: 4px;">${escapeHtml(truncateUrl(bookmark.url, 50))}</div>
          <div style="font-size: 11px; color: ${statusColor}; font-weight: 500;">
            ${statusText}${item.statusCode ? ` (${item.statusCode})` : ''}
            ${item.error ? ` - ${escapeHtml(item.error)}` : ''}
          </div>
        </div>
        <button class="btn" style="padding: 4px 10px; font-size: 12px;" data-recheck="${item.bookmarkId}">
          重新检测
        </button>
      </div>
    `;
  }

  /**
   * 清理失效链接
   * @param {Array} brokenItems - 失效项列表
   * @returns {Promise<Object>} 结果
   * @private
   */
  async _cleanupBrokenLinks(brokenItems) {
    const invalidIds = brokenItems
      .filter(item => item.status === 'invalid')
      .map(item => item.bookmarkId);

    if (invalidIds.length === 0) {
      Toast.info('没有需要清理的失效链接');
      return { success: true, cleaned: 0 };
    }

    const confirmed = confirm(`确定要删除 ${invalidIds.length} 个失效链接吗？此操作不可撤销。`);
    if (!confirmed) {
      return { success: false, error: '用户取消' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_BOOKMARKS_BATCH',
        bookmarkIds: invalidIds
      });

      if (response && response.success) {
        Toast.success(`已清理 ${response.deletedCount || invalidIds.length} 个失效链接`);

        // 刷新书签列表
        await bookmarkManager.load();

        eventBus.emit(eventBus.Events.BOOKMARKS_LOADED, {
          bookmarks: bookmarkManager.bookmarks,
          categories: bookmarkManager.categories
        });

        return { success: true, cleaned: response.deletedCount || invalidIds.length };
      }

      return { success: false, error: response?.error || '清理失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取失效链接数量
   * @returns {number} 失效链接数量
   */
  getBrokenCount() {
    return bookmarkManager.bookmarks.filter(bm =>
      bm.status === 'invalid' || bm.status === 'uncertain'
    ).length;
  }
}

// 创建单例实例
const linkCheckerManager = new LinkCheckerManager();

export default linkCheckerManager;
