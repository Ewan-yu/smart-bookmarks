/**
 * 基础任务管理器
 * 为长时间运行的任务（AI分析、链接检测）提供通用功能
 *
 * 子类需要实现：
 * - _getTaskName(): 返回任务名称（如"AI分析"、"链接检测"）
 * - _getEventNames(): 返回事件名称对象
 * - _getProgressElements(): 返回进度UI元素对象
 * - _executeTask(taskIds): 执行任务
 */

import eventBus from '../utils/event-bus.js';

class BaseTaskManager {
  constructor() {
    // 任务状态
    this.isRunning = false;
    this.progress = {
      current: 0,
      total: 0,
      message: ''
    };
    this.session = null;
    this.result = null;

    // 缓存的DOM元素
    this._progressElements = null;
  }

  /**
   * 初始化任务管理器
   */
  init() {
    this._cacheDOMElements();
    this._bindEvents();
    this._checkExistingSession();
  }

  /**
   * 缓存DOM元素引用（子类可重写）
   * @private
   */
  _cacheDOMElements() {
    // 默认实现：子类应重写此方法
    this._progressElements = {};
  }

  /**
   * 绑定事件监听器
   * @private
   */
  _bindEvents() {
    const events = this._getEventNames();

    // 监听进度更新
    eventBus.on(events.PROGRESS, (progress) => {
      this.progress = progress;
      this._updateProgressUI();
    });

    // 监听任务完成
    eventBus.on(events.COMPLETED, (result) => {
      this.isRunning = false;
      this.result = result;
      this._hideProgressUI();
      this._showResultDialog(result);
    });

    // 监听任务取消
    eventBus.on(events.CANCELLED, () => {
      this.isRunning = false;
      this._hideProgressUI();
      this._onCancelled();
    });

    // 监听任务失败
    eventBus.on(events.FAILED, (error) => {
      this.isRunning = false;
      this._hideProgressUI();
      this._onFailed(error);
    });
  }

  /**
   * 启动任务
   * @param {Array} itemIds - 要处理的项目ID列表（可选）
   * @returns {Promise<Object>} 结果
   */
  async start(itemIds = null) {
    if (this.isRunning) {
      const taskName = this._getTaskName();
      Toast.warning(`正在${taskName}中，请稍候...`);
      return { success: false, error: `${taskName}进行中` };
    }

    this.isRunning = true;
    eventBus.emit(this._getEventNames().STARTED);

    try {
      const result = await this._executeTask(itemIds);
      if (result.success) {
        this._showProgressUI();
      }
      return result;
    } catch (error) {
      this.isRunning = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * 取消任务
   * @returns {Promise<Object>} 结果
   */
  async cancel() {
    if (!this.isRunning) {
      const taskName = this._getTaskName();
      return { success: false, error: `没有正在进行的${taskName}` };
    }

    try {
      const response = await this._sendCancelMessage();
      if (response && response.success) {
        this.isRunning = false;
        eventBus.emit(this._getEventNames().CANCELLED);
        return { success: true };
      }
      return { success: false, error: response?.error || '取消失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查是否有未完成的会话（子类可重写）
   * @private
   */
  async _checkExistingSession() {
    // 默认实现：子类可重写此方法
  }

  /**
   * 执行任务（子类必须实现）
   * @param {Array} itemIds - 项目ID列表
   * @returns {Promise<Object>} 结果
   * @protected
   */
  async _executeTask(itemIds) {
    throw new Error('子类必须实现 _executeTask 方法');
  }

  /**
   * 发送取消消息（子类必须实现）
   * @returns {Promise<Object>} 响应
   * @protected
   */
  async _sendCancelMessage() {
    throw new Error('子类必须实现 _sendCancelMessage 方法');
  }

  /**
   * 显示结果对话框（子类必须实现）
   * @param {Object} result - 任务结果
   * @protected
   */
  _showResultDialog(result) {
    throw new Error('子类必须实现 _showResultDialog 方法');
  }

  /**
   * 获取任务名称（子类必须实现）
   * @returns {string} 任务名称
   * @protected
   */
  _getTaskName() {
    throw new Error('子类必须实现 _getTaskName 方法');
  }

  /**
   * 获取事件名称对象（子类必须实现）
   * @returns {Object} 事件名称映射
   * @protected
   */
  _getEventNames() {
    throw new Error('子类必须实现 _getEventNames 方法');
  }

  /**
   * 任务取消时的回调（子类可重写）
   * @protected
   */
  _onCancelled() {
    const taskName = this._getTaskName();
    Toast.info(`${taskName}已取消`);
  }

  /**
   * 任务失败时的回调（子类可重写）
   * @param {Error} error - 错误对象
   * @protected
   */
  _onFailed(error) {
    const taskName = this._getTaskName();
    Toast.error(`${taskName}失败：` + error.message);
  }

  /**
   * 显示进度 UI
   * @private
   */
  _showProgressUI() {
    const elements = this._progressElements;
    const { section, cancelBtn, taskPanel, taskPanelToggle } = elements;

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
   * 更新进度 UI（子类可重写）
   * @private
   */
  _updateProgressUI() {
    const elements = this._progressElements;
    const { fill, count, sub } = elements;

    if (fill) {
      const percent = this.progress.total > 0
        ? Math.round((this.progress.current / this.progress.total) * 100)
        : 0;
      fill.style.width = `${percent}%`;
    }

    if (count) {
      count.textContent = `${this.progress.current}/${this.progress.total}`;
    }

    if (sub && this.progress.message) {
      sub.textContent = this.progress.message;
    }
  }

  /**
   * 隐藏进度 UI
   * @private
   */
  _hideProgressUI() {
    const elements = this._progressElements;
    const { section, cancelBtn } = elements;

    if (section) {
      section.style.display = 'none';
    }

    if (cancelBtn) {
      cancelBtn.style.display = 'none';
    }
  }

  /**
   * 清理资源（子类可重写）
   */
  destroy() {
    // 移除所有事件监听器
    const events = this._getEventNames();
    Object.values(events).forEach(eventName => {
      eventBus.off(eventName);
    });
  }
}

export default BaseTaskManager;
