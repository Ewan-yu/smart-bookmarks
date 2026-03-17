/**
 * 表单验证工具模块
 * 提供统一的表单验证和错误显示功能
 */

import { isValidUrl } from './helpers.js';

/**
 * 表单验证器类
 */
class FormValidator {
  /**
   * 验证 URL 格式
   * @param {string} url - URL 字符串
   * @returns {{ valid: boolean, error?: string }} 验证结果
   */
  static validateUrl(url) {
    if (!url || url.trim().length === 0) {
      return { valid: false, error: '请输入网址' };
    }

    if (!isValidUrl(url)) {
      return { valid: false, error: '请输入有效的网址（以 http:// 或 https:// 开头）' };
    }

    return { valid: true };
  }

  /**
   * 验证文件夹名称
   * @param {string} name - 文件夹名称
   * @returns {{ valid: boolean, error?: string }} 验证结果
   */
  static validateFolderName(name) {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: '请输入文件夹名称' };
    }

    if (name.trim().length > 50) {
      return { valid: false, error: '文件夹名称不能超过 50 个字符' };
    }

    // 检查特殊字符
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(name)) {
      return { valid: false, error: '文件夹名称不能包含特殊字符：<>:"/\\|?*' };
    }

    return { valid: true };
  }

  /**
   * 验证书签标题
   * @param {string} title - 书签标题
   * @returns {{ valid: boolean, error?: string }} 验证结果
   */
  static validateTitle(title) {
    if (!title || title.trim().length === 0) {
      return { valid: false, error: '请输入名称' };
    }

    if (title.trim().length > 200) {
      return { valid: false, error: '名称不能超过 200 个字符' };
    }

    return { valid: true };
  }

  /**
   * 显示字段错误
   * @param {HTMLElement} fieldEl - 字段元素
   * @param {string} message - 错误消息
   */
  static showFieldError(fieldEl, message) {
    if (!fieldEl) return;

    fieldEl.setAttribute('aria-invalid', 'true');
    fieldEl.classList.add('input-error');

    // 移除已存在的错误消息
    const existingError = fieldEl.parentElement.querySelector('.field-error');
    if (existingError) existingError.remove();

    // 添加新的错误消息
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    errorEl.id = `${fieldEl.id}-error`;
    errorEl.textContent = message;
    errorEl.setAttribute('role', 'alert');
    errorEl.setAttribute('aria-live', 'polite');

    fieldEl.setAttribute('aria-describedby', errorEl.id);
    fieldEl.parentElement.appendChild(errorEl);
  }

  /**
   * 清除表单中的所有错误
   * @param {HTMLElement} dialog - 对话框元素
   */
  static clearFormErrors(dialog) {
    dialog.querySelectorAll('[aria-invalid="true"]').forEach(el => {
      el.setAttribute('aria-invalid', 'false');
      el.classList.remove('input-error');
    });
    dialog.querySelectorAll('.field-error').forEach(el => el.remove());
  }

  /**
   * 验证书签表单
   * @param {Object} formData - 表单数据 { title, url, summary, tags }
   * @param {string} itemType - 项目类型 ('bookmark' | 'folder')
   * @returns {{ valid: boolean, errors: Object }} 验证结果
   */
  static validateBookmarkForm(formData, itemType = 'bookmark') {
    const errors = {};

    // 验证标题
    const titleResult = this.validateTitle(formData.title);
    if (!titleResult.valid) {
      errors.title = titleResult.error;
    }

    // 验证 URL（仅书签需要）
    if (itemType === 'bookmark' && formData.url) {
      const urlResult = this.validateUrl(formData.url);
      if (!urlResult.valid) {
        errors.url = urlResult.error;
      }
    } else if (itemType === 'bookmark' && !formData.url) {
      errors.url = '请输入网址';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }
}

export default FormValidator;
