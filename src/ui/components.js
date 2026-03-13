// Smart Bookmarks - UI 组件库
// 提供通用的 UI 组件：进度条、加载动画、提示消息等

/**
 * 进度条组件
 * 用于显示操作进度（如同步、分析等）
 */
class ProgressBar {
  constructor(container) {
    this.container = container;
    this.element = null;
    this.percentageElement = null;
  }

  /**
   * 创建进度条元素
   */
  create() {
    const wrapper = document.createElement('div');
    wrapper.className = 'progress-bar-wrapper';
    wrapper.setAttribute('role', 'progressbar');
    wrapper.setAttribute('aria-valuenow', '0');
    wrapper.setAttribute('aria-valuemin', '0');
    wrapper.setAttribute('aria-valuemax', '100');
    wrapper.setAttribute('aria-live', 'polite');

    this.element = document.createElement('div');
    this.element.className = 'progress-bar';

    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = '0%';
    this.element.appendChild(fill);

    this.percentageElement = document.createElement('div');
    this.percentageElement.className = 'progress-bar-percentage';
    this.percentageElement.textContent = '0%';
    this.percentageElement.setAttribute('aria-hidden', 'true');

    wrapper.appendChild(this.element);
    wrapper.appendChild(this.percentageElement);

    return wrapper;
  }

  /**
   * 更新进度
   * @param {number} percentage - 进度百分比 (0-100)
   * @param {string} text - 可选的文本说明
   */
  update(percentage, text = null) {
    if (!this.element) return;

    const fill = this.element.querySelector('.progress-bar-fill');
    const wrapper = this.container;
    fill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;

    // 更新 ARIA 属性
    wrapper?.setAttribute('aria-valuenow', Math.round(percentage).toString());

    this.percentageElement.textContent = `${Math.round(percentage)}%`;

    if (text) {
      this.percentageElement.textContent = `${text} (${Math.round(percentage)}%)`;
      wrapper?.setAttribute('aria-label', `${text} - ${Math.round(percentage)}%`);
    }
  }

  /**
   * 完成进度
   */
  complete() {
    this.update(100, '完成');
    setTimeout(() => {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
    }, 1000);
  }

  /**
   * 隐藏进度条
   */
  hide() {
    if (this.container && this.container.parentNode) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 显示进度条
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }
}

/**
 * 加载动画组件
 * 用于显示加载状态
 */
class LoadingSpinner {
  constructor(options = {}) {
    this.size = options.size || 'medium'; // small, medium, large
    this.text = options.text || '加载中...';
    this.element = null;
  }

  /**
   * 创建加载动画元素
   */
  create() {
    const wrapper = document.createElement('div');
    wrapper.className = `loading-spinner loading-spinner-${this.size}`;
    wrapper.setAttribute('role', 'status');
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.setAttribute('aria-busy', 'true');
    wrapper.setAttribute('aria-label', this.text);

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const text = document.createElement('div');
    text.className = 'loading-text';
    text.textContent = this.text;
    text.setAttribute('aria-hidden', 'true');

    wrapper.appendChild(spinner);
    if (this.text) {
      wrapper.appendChild(text);
    }

    this.element = wrapper;
    return wrapper;
  }

  /**
   * 更新加载文本
   * @param {string} text - 新的加载文本
   */
  setText(text) {
    this.text = text;
    const textElement = this.element?.querySelector('.loading-text');
    if (textElement) {
      textElement.textContent = text;
    }
    this.element?.setAttribute('aria-label', text);
  }

  /**
   * 显示加载动画
   * @param {HTMLElement} container - 容器元素
   */
  show(container) {
    if (!this.element) {
      this.create();
    }
    container.appendChild(this.element);
  }

  /**
   * 隐藏加载动画
   */
  hide() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

/**
 * 提示消息组件 (Toast)
 * 用于显示操作结果或错误信息
 */
class Toast {
  constructor(options = {}) {
    this.message = options.message || '';
    this.type = options.type || 'info'; // success, error, warning, info
    this.duration = options.duration || 3000;
    this.element = null;
  }

  /**
   * 创建提示消息元素
   */
  create() {
    this.element = document.createElement('div');
    this.element.className = `toast toast-${this.type}`;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');

    const icon = this.getIcon();
    const message = document.createElement('span');
    message.className = 'toast-message';
    message.textContent = this.message;

    if (icon) {
      const iconElement = document.createElement('span');
      iconElement.className = 'toast-icon';
      iconElement.textContent = icon;
      iconElement.setAttribute('aria-hidden', 'true');
      this.element.appendChild(iconElement);
    }

    this.element.appendChild(message);

    // 添加关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', '关闭提示');
    closeBtn.onclick = () => this.hide();
    this.element.appendChild(closeBtn);

    return this.element;
  }

  /**
   * 获取图标
   */
  getIcon() {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[this.type] || icons.info;
  }

  /**
   * 显示提示消息
   */
  show() {
    if (!this.element) {
      this.create();
    }

    // 获取或创建 toast 容器
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'log');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }

    container.appendChild(this.element);

    // 自动隐藏
    if (this.duration > 0) {
      setTimeout(() => {
        this.hide();
      }, this.duration);
    }
  }

  /**
   * 隐藏提示消息
   */
  hide() {
    if (this.element && this.element.parentNode) {
      this.element.classList.add('toast-hiding');
      setTimeout(() => {
        if (this.element && this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
      }, 300);
    }
  }

  /**
   * 快捷方法：显示成功消息
   */
  static success(message, duration = 3000) {
    const toast = new Toast({ message, type: 'success', duration });
    toast.show();
  }

  /**
   * 快捷方法：显示错误消息
   */
  static error(message, duration = 3000) {
    const toast = new Toast({ message, type: 'error', duration });
    toast.show();
  }

  /**
   * 快捷方法：显示警告消息
   */
  static warning(message, duration = 3000) {
    const toast = new Toast({ message, type: 'warning', duration });
    toast.show();
  }

  /**
   * 快捷方法：显示信息消息
   */
  static info(message, duration = 3000) {
    const toast = new Toast({ message, type: 'info', duration });
    toast.show();
  }
}

/**
 * 空状态组件
 * 用于显示空列表或无数据状态
 */
class EmptyState {
  constructor(options = {}) {
    this.icon = options.icon || '📭';
    this.title = options.title || '暂无数据';
    this.description = options.description || '';
    this.actionText = options.actionText || null;
    this.onAction = options.onAction || null;
  }

  /**
   * 创建空状态元素
   */
  create() {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';
    wrapper.setAttribute('role', 'status');
    wrapper.setAttribute('aria-live', 'polite');

    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.textContent = this.icon;
    icon.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.className = 'empty-state-title';
    title.textContent = this.title;
    title.id = `empty-state-${Math.random().toString(36).substr(2, 9)}`;

    wrapper.appendChild(icon);
    wrapper.appendChild(title);

    if (this.description) {
      const description = document.createElement('div');
      description.className = 'empty-state-description';
      description.textContent = this.description;
      wrapper.appendChild(description);
    }

    if (this.actionText && this.onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'empty-state-action';
      actionBtn.textContent = this.actionText;
      actionBtn.onclick = this.onAction;
      actionBtn.setAttribute('aria-describedby', title.id);
      wrapper.appendChild(actionBtn);
    }

    return wrapper;
  }
}

/**
 * 确认对话框组件
 */
class ConfirmDialog {
  constructor(options = {}) {
    this.title = options.title || '确认操作';
    this.message = options.message || '';
    this.confirmText = options.confirmText || '确认';
    this.cancelText = options.cancelText || '取消';
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;
    this.element = null;
  }

  /**
   * 创建对话框元素
   */
  create() {
    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    // 对话框
    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('div');
    title.className = 'dialog-title';
    title.textContent = this.title;

    const message = document.createElement('div');
    message.className = 'dialog-message';
    message.textContent = this.message;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-btn dialog-btn-cancel';
    cancelBtn.textContent = this.cancelText;
    cancelBtn.onclick = () => this.cancel();

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dialog-btn dialog-btn-confirm';
    confirmBtn.textContent = this.confirmText;
    confirmBtn.onclick = () => this.confirm();

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    this.element = overlay;

    return overlay;
  }

  /**
   * 显示对话框
   */
  show() {
    if (!this.element) {
      this.create();
    }
    document.body.appendChild(this.element);
  }

  /**
   * 确认操作
   */
  confirm() {
    if (this.onConfirm) {
      this.onConfirm();
    }
    this.hide();
  }

  /**
   * 取消操作
   */
  cancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.hide();
  }

  /**
   * 隐藏对话框
   */
  hide() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

// 导出所有组件
export {
  ProgressBar,
  LoadingSpinner,
  Toast,
  EmptyState,
  ConfirmDialog
};
