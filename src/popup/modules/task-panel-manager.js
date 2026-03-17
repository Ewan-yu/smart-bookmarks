/**
 * TaskPanelManager - 任务面板管理模块
 *
 * 负责处理：
 * - 任务面板的展开/折叠
 * - AI 分析进度显示
 * - 失效链接检测进度显示
 * - 进度条更新和 ETA 计算
 */

import eventBus, { Events } from '../utils/event-bus.js';

export class TaskPanelManager {
  /**
   * @param {Object} state - 应用状态对象
   * @param {Object} elements - DOM 元素引用对象
   */
  constructor(state, elements) {
    this.state = state;
    this.elements = elements;

    // 绑定方法到实例
    this.init = this.init.bind(this);
    this.toggle = this.toggle.bind(this);
    this.showProgress = this.showProgress.bind(this);
    this.hideProgress = this.hideProgress.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
  }

  /**
   * 初始化任务面板
   */
  init() {
    const toggle = this.elements.taskPanelToggle;
    if (!toggle) return;

    toggle.addEventListener('click', this.toggle);

    // 监听检测进度事件
    eventBus.on(Events.CHECK_PROGRESS, (data) => {
      this.updateProgress('check', data);
    });

    // 监听分析进度事件
    eventBus.on(Events.ANALYSIS_PROGRESS, (data) => {
      this.updateProgress('analyze', data);
    });

    // 监听检测完成事件
    eventBus.on(Events.CHECK_COMPLETED, (data) => {
      this.handleCheckDone(data);
    });

    // 监听分析完成事件
    eventBus.on(Events.ANALYSIS_COMPLETED, () => {
      this.hideAnalyzeProgress();
    });

    // 监听检测取消事件
    eventBus.on(Events.CHECK_CANCELLED, () => {
      this.hideCheckProgress();
    });

    // 监听分析取消事件
    eventBus.on(Events.ANALYSIS_CANCELLED, () => {
      this.hideAnalyzeProgress();
    });
  }

  /**
   * 切换任务面板展开/折叠
   */
  toggle() {
    this.state.taskPanelExpanded = !this.state.taskPanelExpanded;
    if (this.elements.taskPanel) {
      this.elements.taskPanel.classList.toggle('expanded', this.state.taskPanelExpanded);
      this.elements.taskPanel.classList.toggle('collapsed', !this.state.taskPanelExpanded);
    }

    // 发送面板切换事件
    eventBus.emit(Events.TASK_PANEL_TOGGLED, { expanded: this.state.taskPanelExpanded });
  }

  /**
   * 显示进度（兼容旧接口）
   * @param {string} message - 进度消息
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {string} type - 进度类型: 'check' | 'analyze'（默认 'check'）
   */
  showProgress(message, current, total, type = 'check') {
    const percentage = total > 0 ? (current / total) * 100 : 0;

    if (type === 'check') {
      this.showCheckProgress(message, current, total, percentage);
    } else if (type === 'analyze') {
      this.showAnalyzeProgress(message, current, total, percentage);
    }
  }

  /**
   * 显示检测进度
   * @param {string} message - 进度消息
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {number} percentage - 百分比
   */
  showCheckProgress(message, current, total, percentage) {
    if (this.elements.checkProgressSection) {
      this.elements.checkProgressSection.style.display = '';
      const msgEl = this.elements.checkProgressSection.querySelector('.task-progress-label');
      if (msgEl) msgEl.textContent = message || '检测中...';
      if (this.elements.checkProgressCount) {
        this.elements.checkProgressCount.textContent = `${current}/${total}`;
      }
      if (this.elements.checkProgressFill) {
        this.elements.checkProgressFill.style.width = `${percentage}%`;
      }
    }

    // 展开任务面板
    this.expandIfNeeded();
  }

  /**
   * 显示分析进度
   * @param {string} message - 进度消息
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {number} percentage - 百分比
   */
  showAnalyzeProgress(message, current, total, percentage) {
    if (this.elements.analyzeProgressSection) {
      this.elements.analyzeProgressSection.style.display = '';
      const msgEl = this.elements.analyzeProgressSection.querySelector('.task-progress-label');
      if (msgEl) msgEl.textContent = message || '分析中...';
      if (this.elements.analyzeProgressCount) {
        this.elements.analyzeProgressCount.textContent = `${current}/${total}`;
      }
      if (this.elements.analyzeProgressFill) {
        this.elements.analyzeProgressFill.style.width = `${percentage}%`;
      }
    }

    // 展开任务面板
    this.expandIfNeeded();
  }

  /**
   * 如果任务面板未展开，则展开它
   */
  expandIfNeeded() {
    if (this.elements.taskPanel && !this.state.taskPanelExpanded) {
      this.state.taskPanelExpanded = true;
      this.elements.taskPanel.classList.add('expanded');
      this.elements.taskPanel.classList.remove('collapsed');
    }
  }

  /**
   * 隐藏进度
   * @param {string} type - 进度类型: 'check' | 'analyze' | 'all'（默认 'all'）
   */
  hideProgress(type = 'all') {
    if (type === 'check' || type === 'all') {
      this.hideCheckProgress();
    }
    if (type === 'analyze' || type === 'all') {
      this.hideAnalyzeProgress();
    }
  }

  /**
   * 隐藏检测进度
   */
  hideCheckProgress() {
    if (this.elements.checkProgressSection) {
      this.elements.checkProgressSection.style.display = 'none';
    }
    if (this.elements.checkProgressFill) {
      this.elements.checkProgressFill.style.width = '0%';
    }
    if (this.elements.checkProgressCount) {
      this.elements.checkProgressCount.textContent = '';
    }
    if (this.elements.checkProgressEta) {
      this.elements.checkProgressEta.textContent = '';
    }
    if (this.elements.checkProgressSub) {
      this.elements.checkProgressSub.textContent = '';
    }

    // 兼容旧 progressSection
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    if (progressSection) progressSection.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';

    if (this.elements.cancelCheckBtn) {
      this.elements.cancelCheckBtn.style.display = 'none';
    }

    const etaEl = document.getElementById('progressEta');
    const subEl = document.getElementById('progressSub');
    if (etaEl) etaEl.textContent = '';
    if (subEl) subEl.textContent = '';
  }

  /**
   * 隐藏分析进度
   */
  hideAnalyzeProgress() {
    if (this.elements.analyzeProgressSection) {
      this.elements.analyzeProgressSection.style.display = 'none';
    }
    if (this.elements.analyzeProgressFill) {
      this.elements.analyzeProgressFill.style.width = '0%';
    }
    if (this.elements.analyzeProgressCount) {
      this.elements.analyzeProgressCount.textContent = '';
    }
    if (this.elements.analyzeProgressSub) {
      this.elements.analyzeProgressSub.textContent = '';
    }

    if (this.elements.cancelAnalyzeBtn) {
      this.elements.cancelAnalyzeBtn.style.display = 'none';
    }
  }

  /**
   * 统一的进度更新接口
   * @param {string} type - 进度类型: 'check' | 'analyze'
   * @param {Object} data - 进度数据
   */
  updateProgress(type, data) {
    if (type === 'check') {
      this.updateCheckProgress(data);
    } else if (type === 'analyze') {
      this.updateAnalyzeProgress(data);
    }
  }

  /**
   * 更新检测进度
   * @param {Object} data - 进度数据 { completed, total, brokenCount, percentage }
   */
  updateCheckProgress(data) {
    const { completed, total, brokenCount, percentage } = data;

    if (this.elements.checkProgressFill) {
      this.elements.checkProgressFill.style.width = `${percentage}%`;
    }
    if (this.elements.checkProgressCount) {
      this.elements.checkProgressCount.textContent = `${completed}/${total}`;
    }
    if (this.elements.checkProgressSub && brokenCount > 0) {
      this.elements.checkProgressSub.textContent = `已发现 ${brokenCount} 个失效`;
    }

    // 计算并显示预计剩余时间
    if (this.elements.checkProgressEta && completed > 0 && this.state.checkStartTime > 0) {
      const elapsed = Date.now() - this.state.checkStartTime;
      const rate = completed / elapsed;
      const remaining = total - completed;
      const etaMs = remaining / rate;

      if (etaMs < 60000) {
        this.elements.checkProgressEta.textContent = `约 ${Math.ceil(etaMs / 1000)} 秒`;
      } else {
        const mins = Math.ceil(etaMs / 60000);
        this.elements.checkProgressEta.textContent = `约 ${mins} 分钟`;
      }
    }

    // 兼容旧 compat 层
    const progressFill = document.getElementById('progressFill');
    const progressCount = document.getElementById('progressCount');
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressCount) progressCount.textContent = `${completed}/${total}`;
  }

  /**
   * 更新分析进度
   * @param {Object} data - 进度数据 { completed, total, percentage, message }
   */
  updateAnalyzeProgress(data) {
    const { completed, total, percentage, message } = data;

    if (this.elements.analyzeProgressFill) {
      this.elements.analyzeProgressFill.style.width = `${percentage}%`;
    }
    if (this.elements.analyzeProgressCount) {
      this.elements.analyzeProgressCount.textContent = `${completed}/${total}`;
    }
    if (this.elements.analyzeProgressSub && message) {
      this.elements.analyzeProgressSub.textContent = message;
    }
  }

  /**
   * 处理检测完成
   * @param {Object} data - 完成数据 { cancelled, total, brokenCount, skippedCount }
   */
  handleCheckDone(data) {
    const { cancelled, total, brokenCount, skippedCount } = data;

    this.hideProgress('check');

    if (cancelled) {
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'info',
        message: '检测已取消。'
      });
    } else if (brokenCount === 0) {
      const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'success',
        message: `检测完成！所有 ${total} 个收藏链接均有效。${skipNote}`
      });
    } else {
      const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'warning',
        message: `检测完成！发现 ${brokenCount} 个失效链接，已移至「待清理」。${skipNote}`
      });
    }
  }
}

export default TaskPanelManager;
