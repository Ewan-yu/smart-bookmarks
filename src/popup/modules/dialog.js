/**
 * 对话框模块
 * 统一管理所有对话框的创建、显示和交互
 */

import eventBus from '../utils/event-bus.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * 基础对话框类
 */
class BaseDialog {
  // 焦点选择器常量
  static FOCUSABLE_SELECTORS = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  constructor(options = {}) {
    this.id = options.id || `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.title = options.title || '';
    this.content = options.content || '';
    this.footer = options.footer || null;
    this.size = options.size || 'medium'; // small, medium, large
    this.className = options.className || '';
    this.closeOnOverlay = options.closeOnOverlay !== false;
    this.closeOnEscape = options.closeOnEscape !== false;
    this.showAnimation = options.showAnimation !== false;

    this.element = null;
    this.overlay = null;
    this.previousFocus = null;
    this.isOpen = false;

    this._bindHandlers();
  }

  /**
   * 绑定处理器
   * @private
   */
  _bindHandlers() {
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleOverlayClick = this._handleOverlayClick.bind(this);
  }

  /**
   * 创建对话框元素
   * @private
   */
  _create() {
    // 创建遮罩层
    this.overlay = document.createElement('div');
    this.overlay.className = 'confirm-dialog-overlay';
    this.overlay.id = this.id;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = `confirm-dialog ${this.className}`;
    if (this.size !== 'medium') {
      dialog.style.maxWidth = this.size === 'small' ? '400px' : '700px';
    }

    // 构建对话框内容
    let html = '';

    // 标题栏
    if (this.title) {
      html += `
        <div class="dialog-header">
          <h2>${escapeHtml(this.title)}</h2>
          <button class="dialog-close" data-dialog-close aria-label="关闭">&times;</button>
        </div>
      `;
    }

    // 内容区
    html += `
      <div class="dialog-content">
        ${this.content}
      </div>
    `;

    // 底部按钮区
    if (this.footer) {
      html += `
        <div class="dialog-footer">
          ${this.footer}
        </div>
      `;
    }

    dialog.innerHTML = html;
    this.overlay.appendChild(dialog);

    // 绑定关闭按钮
    const closeBtn = dialog.querySelector('[data-dialog-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    return this.overlay;
  }

  /**
   * 显示对话框
   */
  open() {
    if (this.isOpen) return;

    // 保存当前焦点
    this.previousFocus = document.activeElement;

    // 创建并添加到 DOM
    if (!this.element) {
      this.element = this._create();
    }

    document.body.appendChild(this.element);

    // 绑定事件
    if (this.closeOnEscape) {
      document.addEventListener('keydown', this._handleKeyDown);
    }
    if (this.closeOnOverlay) {
      this.overlay.addEventListener('click', this._handleOverlayClick);
    }

    // 防止背景滚动
    document.body.style.overflow = 'hidden';

    this.isOpen = true;

    // 显示动画
    if (this.showAnimation) {
      requestAnimationFrame(() => {
        this.overlay.classList.add('show');
      });
    } else {
      this.overlay.classList.add('show');
    }

    // 触发事件
    eventBus.emit(eventBus.Events.DIALOG_OPENED, {
      id: this.id,
      type: this.constructor.name
    });

    // 聚焦到第一个可聚焦元素
    this._focusFirstElement();
  }

  /**
   * 关闭对话框
   */
  close() {
    if (!this.isOpen) return;

    // 移除事件监听
    document.removeEventListener('keydown', this._handleKeyDown);
    this.overlay.removeEventListener('click', this._handleOverlayClick);

    // 恢复背景滚动
    document.body.style.overflow = '';

    // 隐藏动画
    if (this.showAnimation) {
      this.overlay.classList.remove('show');
      this.overlay.classList.add('hide');
      setTimeout(() => {
        this._remove();
      }, 300);
    } else {
      this._remove();
    }

    this.isOpen = false;

    // 触发事件
    eventBus.emit(eventBus.Events.DIALOG_CLOSED, {
      id: this.id,
      type: this.constructor.name
    });
  }

  /**
   * 移除对话框元素
   * @private
   */
  _remove() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    // 恢复焦点
    if (this.previousFocus && this.previousFocus.parentNode) {
      this.previousFocus.focus();
    }
  }

  /**
   * 聚焦到第一个可聚焦元素
   * @private
   */
  _focusFirstElement() {
    const dialog = this.overlay.querySelector('.confirm-dialog');
    const focusableElements = dialog.querySelectorAll(BaseDialog.FOCUSABLE_SELECTORS);

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }

  /**
   * 处理键盘事件
   * @private
   */
  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Tab') {
      this._handleTabKey(e);
    }
  }

  /**
   * 处理 Tab 键焦点循环
   * @private
   */
  _handleTabKey(e) {
    const dialog = this.overlay.querySelector('.confirm-dialog');
    const focusableElements = Array.from(dialog.querySelectorAll(BaseDialog.FOCUSABLE_SELECTORS));
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  /**
   * 处理遮罩点击
   * @private
   */
  _handleOverlayClick(e) {
    if (e.target === this.overlay) {
      this.close();
    }
  }

  /**
   * 更新内容
   * @param {string} content - 新内容（已转义的HTML）
   */
  updateContent(content) {
    this.content = content;
    const contentEl = this.overlay?.querySelector('.dialog-content');
    if (contentEl) {
      // 安全：content应该已经被调用者转义，这里直接设置
      // 如果需要设置纯文本，使用textContent
      contentEl.innerHTML = content;
    }
  }

  /**
   * 设置按钮状态
   * @param {string} selector - 按钮选择器
   * @param {boolean} disabled - 是否禁用
   * @param {string} text - 新文本
   */
  setButtonState(selector, disabled, text) {
    const btn = this.overlay?.querySelector(selector);
    if (btn) {
      btn.disabled = disabled;
      if (text) btn.textContent = text;
    }
  }
}

/**
 * 确认对话框
 */
class ConfirmDialog extends BaseDialog {
  constructor(options = {}) {
    super({
      title: options.title || '确认操作',
      content: options.message || '',
      size: options.size || 'small',
      className: options.className || '',
      closeOnOverlay: options.closeOnOverlay,
      closeOnEscape: options.closeOnEscape
    });

    this.confirmText = options.confirmText || '确认';
    this.cancelText = options.cancelText || '取消';
    this.confirmClass = options.confirmClass || 'btn-primary';
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;
    this.danger = options.danger || false;

    this._setupFooter();
  }

  /**
   * 设置底部按钮
   * @private
   */
  _setupFooter() {
    this.footer = `
      <button class="btn btn-cancel" data-dialog-action="cancel">${escapeHtml(this.cancelText)}</button>
      <button class="btn ${this.danger ? 'btn-danger' : this.confirmClass}" data-dialog-action="confirm">
        ${escapeHtml(this.confirmText)}
      </button>
    `;
  }

  /**
   * 创建后绑定按钮事件
   */
  _create() {
    const element = super._create();

    // 绑定按钮事件
    const confirmBtn = this.overlay.querySelector('[data-dialog-action="confirm"]');
    const cancelBtn = this.overlay.querySelector('[data-dialog-action="cancel"]');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirm());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }

    return element;
  }

  /**
   * 确认
   */
  confirm() {
    if (this.onConfirm) {
      this.onConfirm();
    }
    this.close();
  }

  /**
   * 取消
   */
  cancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.close();
  }
}

/**
 * 输入对话框
 */
class PromptDialog extends BaseDialog {
  constructor(options = {}) {
    super({
      title: options.title || '输入',
      size: 'small',
      closeOnOverlay: options.closeOnOverlay
    });

    this.placeholder = options.placeholder || '';
    this.defaultValue = options.defaultValue || '';
    this.inputType = options.inputType || 'text';
    this.confirmText = options.confirmText || '确定';
    this.cancelText = options.cancelText || '取消';
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;

    this._setupContent();
    this._setupFooter();
  }

  /**
   * 设置内容
   * @private
   */
  _setupContent() {
    this.content = `
      <input
        type="${this.inputType}"
        class="dialog-input"
        id="${this.id}-input"
        placeholder="${escapeHtml(this.placeholder)}"
        value="${escapeHtml(this.defaultValue)}"
      />
    `;
  }

  /**
   * 设置底部按钮
   * @private
   */
  _setupFooter() {
    this.footer = `
      <button class="btn btn-cancel" data-dialog-action="cancel">${escapeHtml(this.cancelText)}</button>
      <button class="btn btn-primary" data-dialog-action="confirm">${escapeHtml(this.confirmText)}</button>
    `;
  }

  /**
   * 创建后绑定事件
   */
  _create() {
    const element = super._create();

    const input = this.overlay.querySelector(`#${this.id}-input`);
    const confirmBtn = this.overlay.querySelector('[data-dialog-action="confirm"]');
    const cancelBtn = this.overlay.querySelector('[data-dialog-action="cancel"]');

    // 回车确认
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.confirm();
        }
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirm());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }

    return element;
  }

  /**
   * 获取输入值
   */
  getValue() {
    const input = this.overlay?.querySelector(`#${this.id}-input`);
    return input ? input.value : '';
  }

  /**
   * 确认
   */
  confirm() {
    const value = this.getValue();
    if (this.onConfirm) {
      this.onConfirm(value);
    }
    this.close();
  }

  /**
   * 取消
   */
  cancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.close();
  }

  /**
   * 聚焦输入框
   */
  _focusFirstElement() {
    const input = this.overlay?.querySelector(`#${this.id}-input`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

/**
 * 选择对话框
 */
class SelectDialog extends BaseDialog {
  constructor(options = {}) {
    super({
      title: options.title || '请选择',
      content: '',
      size: options.size || 'medium',
      closeOnOverlay: options.closeOnOverlay
    });

    this.options = options.options || [];
    this.multiple = options.multiple || false;
    this.confirmText = options.confirmText || '确定';
    this.cancelText = options.cancelText || '取消';
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;

    this._setupContent();
    this._setupFooter();
  }

  /**
   * 设置内容
   * @private
   */
  _setupContent() {
    if (this.options.length === 0) {
      this.content = '<p style="text-align: center; color: var(--c-text-muted);">暂无选项</p>';
      return;
    }

    const items = this.options.map((opt, index) => {
      const checked = opt.checked ? 'checked' : '';
      const disabled = opt.disabled ? 'disabled' : '';
      const icon = opt.icon || '';
      const description = opt.description || '';

      return `
        <label class="dialog-select-item ${opt.className || ''}" style="display: block; cursor: pointer; padding: 12px; border: 1px solid var(--c-border); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <input
              type="${this.multiple ? 'checkbox' : 'radio'}"
              name="${this.id}-select"
              value="${escapeHtml(String(opt.value))}"
              data-index="${index}"
              ${checked}
              ${disabled}
              style="flex-shrink: 0;"
            />
            ${icon ? `<span style="font-size: 20px;">${escapeHtml(icon)}</span>` : ''}
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500; color: var(--c-text);">${escapeHtml(opt.label)}</div>
              ${description ? `<div style="font-size: 12px; color: var(--c-text-muted); margin-top: 2px;">${escapeHtml(description)}</div>` : ''}
            </div>
          </div>
        </label>
      `;
    }).join('');

    this.content = `
      <div class="dialog-select-list" style="max-height: 400px; overflow-y: auto;">
        ${items}
      </div>
      <div style="display: flex; gap: 8px; padding-top: 12px;">
        <button class="btn" style="padding: 6px 12px; font-size: 13px;" data-dialog-action="selectAll">全选</button>
        <button class="btn" style="padding: 6px 12px; font-size: 13px;" data-dialog-action="deselectAll">取消全选</button>
      </div>
    `;
  }

  /**
   * 设置底部按钮
   * @private
   */
  _setupFooter() {
    this.footer = `
      <button class="btn btn-cancel" data-dialog-action="cancel">${escapeHtml(this.cancelText)}</button>
      <button class="btn btn-primary" data-dialog-action="confirm">${escapeHtml(this.confirmText)}</button>
    `;
  }

  /**
   * 创建后绑定事件
   */
  _create() {
    const element = super._create();

    const confirmBtn = this.overlay.querySelector('[data-dialog-action="confirm"]');
    const cancelBtn = this.overlay.querySelector('[data-dialog-action="cancel"]');
    const selectAllBtn = this.overlay.querySelector('[data-dialog-action="selectAll"]');
    const deselectAllBtn = this.overlay.querySelector('[data-dialog-action="deselectAll"]');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirm());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => this._selectAll(true));
    }
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => this._selectAll(false));
    }

    // 更新确认按钮文本
    this.overlay.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => this._updateConfirmButton());
    });

    return element;
  }

  /**
   * 全选/取消全选
   * @private
   */
  _selectAll(selected) {
    this.overlay.querySelectorAll('.dialog-select-list input').forEach(input => {
      if (!input.disabled) {
        input.checked = selected;
      }
    });
    this._updateConfirmButton();
  }

  /**
   * 更新确认按钮文本
   * @private
   */
  _updateConfirmButton() {
    if (!this.multiple) return;

    const checkedCount = this.overlay.querySelectorAll('.dialog-select-list input:checked').length;
    const confirmBtn = this.overlay.querySelector('[data-dialog-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.textContent = checkedCount > 0
        ? `${this.confirmText} (${checkedCount})`
        : this.confirmText;
    }
  }

  /**
   * 获取选中的值
   */
  getSelectedValues() {
    const selected = [];
    this.overlay?.querySelectorAll('.dialog-select-list input:checked').forEach(input => {
      const index = parseInt(input.dataset.index);
      if (this.options[index]) {
        selected.push(this.options[index].value);
      }
    });
    return this.multiple ? selected : (selected[0] || null);
  }

  /**
   * 获取选中的选项
   */
  getSelectedOptions() {
    const selected = [];
    this.overlay?.querySelectorAll('.dialog-select-list input:checked').forEach(input => {
      const index = parseInt(input.dataset.index);
      if (this.options[index]) {
        selected.push(this.options[index]);
      }
    });
    return this.multiple ? selected : (selected[0] || null);
  }

  /**
   * 确认
   */
  confirm() {
    const selected = this.getSelectedOptions();
    if (this.onConfirm) {
      this.onConfirm(selected);
    }
    this.close();
  }

  /**
   * 取消
   */
  cancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.close();
  }
}

/**
 * 自定义内容对话框
 */
class CustomDialog extends BaseDialog {
  constructor(options = {}) {
    super({
      id: options.id,
      title: options.title || '',
      content: options.content || '',
      footer: options.footer || null,
      size: options.size || 'medium',
      className: options.className || '',
      closeOnOverlay: options.closeOnOverlay,
      closeOnEscape: options.closeOnEscape
    });

    this.onOpen = options.onOpen || null;
    this.onClose = options.onClose || null;
  }

  /**
   * 显示对话框
   */
  open() {
    super.open();
    if (this.onOpen) {
      this.onOpen(this.element);
    }
  }

  /**
   * 关闭对话框
   */
  close() {
    if (this.onClose) {
      const shouldClose = this.onClose(this.element);
      if (shouldClose === false) {
        return;
      }
    }
    super.close();
  }
}

/**
 * 对话框管理器
 */
const dialogManager = {
  /**
   * 显示确认对话框
   */
  confirm(options) {
    const dialog = new ConfirmDialog(options);
    dialog.open();
    return dialog;
  },

  /**
   * 显示输入对话框
   */
  prompt(options) {
    const dialog = new PromptDialog(options);
    dialog.open();
    return dialog;
  },

  /**
   * 显示选择对话框
   */
  select(options) {
    const dialog = new SelectDialog(options);
    dialog.open();
    return dialog;
  },

  /**
   * 显示自定义对话框
   */
  custom(options) {
    const dialog = new CustomDialog(options);
    dialog.open();
    return dialog;
  },

  /**
   * 关闭所有对话框
   */
  closeAll() {
    document.querySelectorAll('.confirm-dialog-overlay').forEach(overlay => {
      overlay.classList.remove('show');
      overlay.classList.add('hide');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    });
  },

  /**
   * 检查是否有打开的对话框
   */
  hasOpenDialog() {
    return document.querySelectorAll('.confirm-dialog-overlay.show').length > 0;
  }
};

export default dialogManager;
export { BaseDialog, ConfirmDialog, PromptDialog, SelectDialog, CustomDialog };
