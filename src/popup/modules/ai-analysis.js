/**
 * AI 分析模块
 * 负责 AI 分析的启动、进度显示和结果确认
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml, truncateUrl } from '../utils/helpers.js';
import bookmarkManager from './bookmarks.js';
import dialogManager from './dialog.js';

/**
 * AI 分析管理器
 */
class AIAnalysisManager {
  constructor() {
    this.isAnalyzing = false;
    this.analysisProgress = {
      current: 0,
      total: 0,
      message: ''
    };
    this.analysisSession = null;
    this.analysisResult = null;
  }

  /**
   * 初始化 AI 分析
   */
  init() {
    this._bindEvents();
    this._checkExistingSession();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听分析进度
    eventBus.on(eventBus.Events.ANALYSIS_PROGRESS, (progress) => {
      this.analysisProgress = progress;
      this._updateProgressUI();
    });

    // 监听分析完成
    eventBus.on(eventBus.Events.ANALYSIS_COMPLETED, (result) => {
      this.isAnalyzing = false;
      this.analysisResult = result;
      this._hideProgressUI();
      this._showResultDialog(result);
    });

    // 监听分析取消
    eventBus.on(eventBus.Events.ANALYSIS_CANCELLED, () => {
      this.isAnalyzing = false;
      this._hideProgressUI();
      Toast.info('AI 分析已取消');
    });

    // 监听分析失败
    eventBus.on(eventBus.Events.ANALYSIS_FAILED, (error) => {
      this.isAnalyzing = false;
      this._hideProgressUI();
      Toast.error('AI 分析失败：' + error.message);
    });
  }

  /**
   * 检查是否有未完成的分析会话
   * @private
   */
  async _checkExistingSession() {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_ANALYSIS_SESSION'
      });

      if (res?.session && !res.session.completed) {
        const currentIds = bookmarkManager.bookmarks.map(b => b.id).sort().join(',');
        const sessionIds = [...(res.session.bookmarkIds || [])].sort().join(',');

        if (currentIds === sessionIds && res.session.completedBatches > 0) {
          // 显示恢复对话框
          this._showResumeDialog(res.session);
        } else {
          // 清除过期会话
          await chrome.runtime.sendMessage({
            type: 'CLEAR_ANALYSIS_SESSION'
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.debug('[AIAnalysis] Check session error:', error);
    }
  }

  /**
   * 启动 AI 分析
   * @param {Array} bookmarkIds - 要分析的书签ID列表（可选，默认为全部）
   * @returns {Promise<Object>} 结果
   */
  async start(bookmarkIds = null) {
    if (this.isAnalyzing) {
      Toast.warning('正在分析中，请稍候...');
      return { success: false, error: '分析进行中' };
    }

    const bookmarksToAnalyze = bookmarkIds
      ? bookmarkManager.bookmarks.filter(bm => bookmarkIds.includes(bm.id))
      : bookmarkManager.bookmarks;

    if (bookmarksToAnalyze.length === 0) {
      Toast.warning('请先导入收藏');
      return { success: false, error: '无书签可分析' };
    }

    this.isAnalyzing = true;
    eventBus.emit(eventBus.Events.ANALYSIS_STARTED);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_ANALYSIS',
        bookmarkIds: bookmarksToAnalyze.map(bm => bm.id)
      });

      if (response && response.success) {
        this._showProgressUI();
        return { success: true };
      }

      this.isAnalyzing = false;
      return { success: false, error: response?.error || '启动失败' };
    } catch (error) {
      this.isAnalyzing = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * 取消 AI 分析
   * @returns {Promise<Object>} 结果
   */
  async cancel() {
    if (!this.isAnalyzing) {
      return { success: false, error: '没有正在进行的分析' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CANCEL_ANALYSIS'
      });

      if (response && response.success) {
        this.isAnalyzing = false;
        eventBus.emit(eventBus.Events.ANALYSIS_CANCELLED);
        return { success: true };
      }

      return { success: false, error: response?.error || '取消失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 显示恢复对话框
   * @param {Object} session - 分析会话信息
   * @private
   */
  _showResumeDialog(session) {
    const sessionTime = new Date(session.startTime).toLocaleString('zh-CN');
    const { completedBatches, totalBatches, bookmarkCount, lastError } = session;

    // 构建会话信息 HTML
    const sessionInfoHtml = `
      <p style="margin-bottom: 16px; color: var(--c-text-muted); line-height: 1.6;">
        检测到上次未完成的分析任务：
      </p>
      <div style="background: var(--c-bg-alt); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: var(--c-text-muted);">开始时间：</span>
          <span style="color: var(--c-text); font-weight: 500;">${sessionTime}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: var(--c-text-muted);">书签数量：</span>
          <span style="color: var(--c-text); font-weight: 500;">${bookmarkCount}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: var(--c-text-muted);">进度：</span>
          <span style="color: var(--c-text); font-weight: 500;">${completedBatches}/${totalBatches} 批次</span>
        </div>
        ${lastError ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--c-border);">
            <span style="color: var(--c-danger);">⚠️ ${escapeHtml(lastError)}</span>
          </div>
        ` : ''}
      </div>
      <p style="font-size: 13px; color: var(--c-text-muted);">是否继续上次的分析？</p>
    `;

    // 使用 dialogManager 创建对话框
    const dialog = dialogManager.custom({
      title: '📊 继续分析',
      content: sessionInfoHtml,
      buttons: [
        {
          text: '重新开始',
          class: 'btn-cancel',
          onClick: async () => {
            await chrome.runtime.sendMessage({
              type: 'CLEAR_ANALYSIS_SESSION'
            }).catch(() => {});
            this.start(); // 重新开始
          }
        },
        {
          text: '继续分析',
          class: 'btn-primary',
          onClick: () => {
            this._resumeAnalysis();
          }
        }
      ]
    });

    dialog.show();
  }

  /**
   * 恢复分析
   * @private
   */
  async _resumeAnalysis() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RESUME_ANALYSIS'
      });

      if (response && response.success) {
        this.isAnalyzing = true;
        this._showProgressUI();
      } else {
        Toast.error('恢复分析失败');
      }
    } catch (error) {
      console.error('[AIAnalysis] Resume error:', error);
      Toast.error('恢复分析失败：' + error.message);
    }
  }

  /**
   * 显示进度 UI
   * @private
   */
  _showProgressUI() {
    const progressSection = document.getElementById('analyzeProgressSection');
    const cancelBtn = document.getElementById('cancelAnalyzeBtn');

    if (progressSection) {
      progressSection.style.display = 'block';
    }

    if (cancelBtn) {
      cancelBtn.style.display = 'inline-flex';
      cancelBtn.disabled = false;
    }

    // 展开任务面板
    const taskPanel = document.getElementById('taskPanel');
    if (taskPanel && taskPanel.classList.contains('collapsed')) {
      const toggleBtn = document.getElementById('taskPanelToggle');
      if (toggleBtn) toggleBtn.click();
    }
  }

  /**
   * 更新进度 UI
   * @private
   */
  _updateProgressUI() {
    const progressFill = document.getElementById('analyzeProgressFill');
    const progressCount = document.getElementById('analyzeProgressCount');
    const progressSub = document.getElementById('analyzeProgressSub');

    if (progressFill) {
      const percent = this.analysisProgress.total > 0
        ? Math.round((this.analysisProgress.current / this.analysisProgress.total) * 100)
        : 0;
      progressFill.style.width = `${percent}%`;
    }

    if (progressCount) {
      progressCount.textContent = `${this.analysisProgress.current}/${this.analysisProgress.total}`;
    }

    if (progressSub && this.analysisProgress.message) {
      progressSub.textContent = this.analysisProgress.message;
    }
  }

  /**
   * 隐藏进度 UI
   * @private
   */
  _hideProgressUI() {
    const progressSection = document.getElementById('analyzeProgressSection');
    const cancelBtn = document.getElementById('cancelAnalyzeBtn');

    if (progressSection) {
      progressSection.style.display = 'none';
    }

    if (cancelBtn) {
      cancelBtn.style.display = 'none';
    }
  }

  /**
   * 显示结果确认对话框
   * @param {Object} analysisResult - 分析结果
   * @private
   */
  _showResultDialog(analysisResult) {
    const { categories, tags, summary } = analysisResult;
    const newCatCount = categories.filter(c => c.isNew).length;
    const uniqueTagNames = [...new Set(categories.flatMap(c => c.tags || []))];

    // 构建结果内容 HTML
    const resultHtml = `
      <div class="analysis-summary">
        <div class="analysis-summary-item">
          <div class="analysis-summary-value">${summary.totalBookmarks}</div>
          <div class="analysis-summary-label">个收藏</div>
        </div>
        <div class="analysis-summary-item">
          <div class="analysis-summary-value primary">${categories.length}</div>
          <div class="analysis-summary-label">
            个分类${newCatCount > 0 ? ` <span class="analysis-summary-highlight">(${newCatCount} 新增)</span>` : ''}
          </div>
        </div>
        <div class="analysis-summary-item">
          <div class="analysis-summary-value success">${uniqueTagNames.length}</div>
          <div class="analysis-summary-label">个标签建议</div>
        </div>
      </div>

      <details class="analysis-categories-section" open>
        <summary class="analysis-categories-header">
          📁 分类整理方案
        </summary>
        <div class="analysis-categories-list">
          ${this._renderCategories(categories)}
        </div>
      </details>

      ${tags && tags.length > 0 ? `
        <details class="analysis-tags-section">
          <summary class="analysis-tags-header">
            🏷️ 标签建议
          </summary>
          <div class="analysis-tags-list">
            ${tags.map(tag => `
              <span class="analysis-tag-item">${escapeHtml(tag)}</span>
            `).join('')}
          </div>
        </details>
      ` : ''}
    `;

    // 使用 dialogManager 创建对话框
    const dialog = dialogManager.custom({
      title: '🤖 AI 分析完成',
      content: resultHtml,
      contentClass: 'analysis-dialog-content',
      dialogClass: 'analysis-dialog',
      buttons: [
        {
          text: '取消',
          class: 'btn-cancel',
          onClick: () => {
            // 点击取消，只关闭对话框
          }
        },
        {
          text: '应用整理',
          class: 'btn-primary',
          onClick: async () => {
            await this._applyAnalysis(analysisResult);
          }
        }
      ]
    });

    dialog.show();
  }

  /**
   * 渲染分类列表
   * @param {Array} categories - 分类列表
   * @returns {string} HTML
   * @private
   */
  _renderCategories(categories) {
    return categories.map(cat => {
      const badgeClass = cat.isNew ? 'new' : 'existing';
      const badgeText = cat.isNew ? '新建' : '现有';
      const bookmarkItems = (cat.bookmarkIds || [])
        .map(id => {
          const bm = bookmarkManager.getById(id);
          if (!bm) return '';
          return `
            <div class="analysis-bookmark-item">
              <div class="analysis-bookmark-title">${escapeHtml(bm.title)}</div>
              <div class="analysis-bookmark-url">${escapeHtml(bm.url)}</div>
            </div>
          `;
        })
        .join('');

      return `
        <details class="analysis-category-item">
          <summary class="analysis-category-header">
            <span class="analysis-category-badge ${badgeClass}">${badgeText}</span>
            <span class="analysis-category-name">${escapeHtml(cat.name)}</span>
            <span class="analysis-category-count">${cat.bookmarkIds?.length || 0} 个</span>
          </summary>
          <div class="analysis-bookmark-list">
            ${bookmarkItems || '<div class="analysis-empty-state">暂无书签</div>'}
          </div>
        </details>
      `;
    }).join('');
  }

  /**
   * 应用分析结果
   * @param {Object} analysisResult - 分析结果
   * @returns {Promise<Object>} 结果
   * @private
   */
  async _applyAnalysis(analysisResult) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'APPLY_ANALYSIS',
        result: analysisResult
      });

      if (response && response.success) {
        const tagCount = analysisResult.tags?.length || 0;
        Toast.success(`整理完成！已应用 ${analysisResult.categories.length} 个分类${tagCount > 0 ? `，${tagCount} 个标签` : ''}`);

        // 刷新书签列表
        await bookmarkManager.load();

        // 发送更新事件
        eventBus.emit(eventBus.Events.BOOKMARKS_LOADED, {
          bookmarks: bookmarkManager.bookmarks,
          categories: bookmarkManager.categories
        });

        return { success: true };
      }

      return { success: false, error: response?.error || '应用失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 调试分析
   * @param {Array} bookmarkIds - 书签ID列表
   * @returns {Promise<Object>} 结果
   */
  async debugAnalyze(bookmarkIds) {
    if (!bookmarkIds || bookmarkIds.length === 0) {
      return { success: false, error: '请选择要调试的书签' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DEBUG_ANALYZE',
        bookmarkIds: bookmarkIds
      });

      if (response && response.success) {
        this._showResultDialog(response.result);
        return { success: true };
      }

      return { success: false, error: response?.error || '调试分析失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// 创建单例实例
const aiAnalysisManager = new AIAnalysisManager();

export default aiAnalysisManager;
