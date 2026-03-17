/**
 * 对话框构建器工具
 * 提供通用的对话框创建函数
 */

import { escapeHtml } from './helpers.js';
import { Toast } from '../../ui/components.js';

/**
 * 创建单输入对话框
 * @param {Object} options - 对话框选项
 * @param {string} options.title - 对话框标题
 * @param {string} options.message - 提示消息
 * @param {string} options.placeholder - 输入框占位符
 * @param {string} options.confirmText - 确认按钮文本
 * @param {string} options.defaultValue - 输入框默认值
 * @param {Function} options.onConfirm - 确认回调函数，接收输入值
 * @param {Function} options.validator - 可选的验证函数，返回 {valid: boolean, error?: string}
 * @returns {HTMLElement} 对话框元素
 */
export function createInputDialog({
  title,
  message,
  placeholder = '请输入...',
  confirmText = '确定',
  defaultValue = '',
  onConfirm,
  validator = null
}) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  const inputId = `promptInput-${Date.now()}`;

  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width: 400px;">
      <div class="dialog-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="dialog-close" data-prompt-close>&times;</button>
      </div>
      <div class="dialog-content">
        ${message ? `<p style="margin-bottom: 12px; color: var(--c-text-2);">${message}</p>` : ''}
        <div class="edit-field">
          <input type="text" id="${inputId}" class="edit-input"
                 placeholder="${escapeHtml(placeholder)}"
                 value="${escapeHtml(defaultValue)}"
                 style="width: 100%;" />
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" data-prompt-cancel>取消</button>
        <button class="btn btn-primary" data-prompt-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector('[data-prompt-close]');
  const cancelBtn = dialog.querySelector('[data-prompt-cancel]');
  const confirmBtn = dialog.querySelector('[data-prompt-confirm]');
  const input = dialog.querySelector(`#${inputId}`);

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => dialog.remove(), 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  confirmBtn.addEventListener('click', async () => {
    const value = input.value.trim();

    // 验证输入
    if (!value) {
      Toast.warning('请输入内容');
      input.focus();
      return;
    }

    if (validator) {
      const result = validator(value);
      if (!result.valid) {
        Toast.warning(result.error || '输入无效');
        input.focus();
        return;
      }
    }

    // 禁用按钮，防止重复提交
    confirmBtn.disabled = true;
    confirmBtn.textContent = '处理中...';

    try {
      await onConfirm(value);
      closeDialog();
    } catch (error) {
      console.error('Prompt dialog error:', error);
      Toast.error(`操作失败: ${error.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmText;
    }
  });

  // 支持回车键提交
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      confirmBtn.click();
    }
  });

  // 点击遮罩关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  // 自动聚焦并选中文本
  setTimeout(() => {
    input.focus();
    if (defaultValue) {
      input.select();
    }
  }, 100);

  setTimeout(() => dialog.classList.add('show'), 10);

  return dialog;
}

/**
 * 创建选择对话框
 * @param {Object} options - 对话框选项
 * @param {string} options.title - 对话框标题
 * @param {string} options.message - 提示消息
 * @param {Array} options.items - 选项列表，每项包含 {value, label, description}
 * @param {string} options.confirmText - 确认按钮文本
 * @param {Function} options.onConfirm - 确认回调函数，接收选中的值
 * @returns {HTMLElement} 对话框元素
 */
export function createSelectDialog({
  title,
  message,
  items,
  confirmText = '确定',
  onConfirm
}) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';

  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width: 500px;">
      <div class="dialog-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="dialog-close" data-select-close>&times;</button>
      </div>
      <div class="dialog-content">
        ${message ? `<p style="margin-bottom: 16px;">${message}</p>` : ''}
        <div class="select-list" style="max-height: 300px; overflow-y: auto;">
          ${items.map((item, index) => `
            <label class="select-option"
                   style="display: flex; align-items: center; gap: 10px;
                          padding: 10px; border: 1px solid var(--c-border);
                          border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
              <input type="radio" name="selectOption" value="${escapeHtml(String(item.value))}"
                     ${index === 0 ? 'checked' : ''} style="flex-shrink: 0;" />
              <div style="flex: 1;">
                <div style="font-weight: 500;">${escapeHtml(item.label)}</div>
                ${item.description ? `<div style="color: var(--c-text-2); font-size: 13px;">${escapeHtml(item.description)}</div>` : ''}
              </div>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" data-select-cancel>取消</button>
        <button class="btn btn-primary" data-select-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector('[data-select-close]');
  const cancelBtn = dialog.querySelector('[data-select-cancel]');
  const confirmBtn = dialog.querySelector('[data-select-confirm]');

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => dialog.remove(), 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  confirmBtn.addEventListener('click', async () => {
    const selected = dialog.querySelector('input[name="selectOption"]:checked');
    if (!selected) {
      Toast.warning('请选择一个选项');
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '处理中...';

    try {
      await onConfirm(selected.value);
      closeDialog();
    } catch (error) {
      console.error('Select dialog error:', error);
      Toast.error(`操作失败: ${error.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmText;
    }
  });

  // 点击遮罩关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  // 添加选项悬停效果
  dialog.querySelectorAll('.select-option').forEach(option => {
    option.addEventListener('mouseenter', () => {
      option.style.borderColor = 'var(--c-primary)';
      option.style.backgroundColor = 'var(--c-bg-2)';
    });
    option.addEventListener('mouseleave', () => {
      option.style.borderColor = 'var(--c-border)';
      option.style.backgroundColor = '';
    });
  });

  setTimeout(() => dialog.classList.add('show'), 10);

  return dialog;
}
