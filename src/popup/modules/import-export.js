/**
 * 导入导出模块
 * 负责书签数据的导入和导出功能
 */

import {
  exportToJson,
  exportToHtml,
  exportToCsv,
  exportToMarkdown,
  escapeHtml
} from '../../utils/export.js';

/**
 * 导出管理器类
 */
class ExportManager {
  /**
   * 导出书签数据
   * @param {Object} data - 要导出的数据 { bookmarks, categories, tags }
   * @param {string} format - 导出格式 ('json' | 'html' | 'csv' | 'markdown')
   * @param {Object} options - 导出选项
   * @returns {Promise<void>}
   */
  async export(data, format = 'json', options = {}) {
    try {
      let content;
      let mimeType;
      let extension;

      switch (format) {
        case 'json':
          content = exportToJson(data, options);
          mimeType = 'application/json';
          extension = 'json';
          break;

        case 'html':
          content = exportToHtml(data, options);
          mimeType = 'text/html';
          extension = 'html';
          break;

        case 'csv':
          content = exportToCsv(data, options);
          mimeType = 'text/csv';
          extension = 'csv';
          break;

        case 'markdown':
          content = exportToMarkdown(data, options);
          mimeType = 'text/markdown';
          extension = 'md';
          break;

        default:
          throw new Error(`不支持的导出格式: ${format}`);
      }

      // 使用 <a> 标签触发下载（不需要 downloads 权限）
      await this.downloadFile(content, `smart-bookmarks-${this.getTimestamp()}.${extension}`, mimeType);

      return { success: true, format, count: data.bookmarks?.length || 0 };
    } catch (error) {
      console.error('[ExportManager] Export failed:', error);
      throw error;
    }
  }

  /**
   * 导出为 JSON 并下载
   * @param {Object} data - 要导出的数据
   * @returns {Promise<void>}
   */
  async exportJson(data) {
    return this.export(data, 'json', { pretty: true, includeMetadata: true });
  }

  /**
   * 导出为 HTML 并下载
   * @param {Object} data - 要导出的数据
   * @returns {Promise<void>}
   */
  async exportHtml(data) {
    return this.export(data, 'html', { groupByFolder: true });
  }

  /**
   * 下载文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @param {string} mimeType - MIME 类型
   * @returns {Promise<void>}
   */
  async downloadFile(content, filename, mimeType) {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();

        // 清理
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, 100);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取时间戳
   * @returns {string} YYYY-MM-DD 格式的时间戳
   */
  getTimestamp() {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * 导入管理器类
 */
class ImportManager {
  /**
   * 导入书签数据
   * @param {File} file - 要导入的文件
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 导入结果
   */
  async import(file, options = {}) {
    const {
      skipDuplicates = true,
      mergeStrategy = 'merge' // 'merge' | 'replace' | 'skip'
    } = options;

    try {
      // 读取文件内容
      const content = await this.readFile(file);

      // 解析 JSON
      const data = JSON.parse(content);

      if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
        throw new Error('无效的导入文件格式：缺少 bookmarks 数组');
      }

      // 验证数据格式
      this.validateData(data);

      // 导入数据
      const result = await this.importData(data, { skipDuplicates, mergeStrategy });

      return {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('[ImportManager] Import failed:', error);
      throw error;
    }
  }

  /**
   * 读取文件内容
   * @param {File} file - 文件对象
   * @returns {Promise<string>} 文件内容
   */
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));

      reader.readAsText(file);
    });
  }

  /**
   * 验证导入数据格式
   * @param {Object} data - 导入的数据
   * @throws {Error} 数据格式无效时抛出错误
   */
  validateData(data) {
    if (!data.bookmarks) {
      throw new Error('导入文件缺少 bookmarks 字段');
    }

    if (!Array.isArray(data.bookmarks)) {
      throw new Error('bookmarks 必须是数组');
    }

    // 验证书签格式
    for (let i = 0; i < Math.min(data.bookmarks.length, 5); i++) {
      const bookmark = data.bookmarks[i];
      if (!bookmark.url) {
        console.warn(`[ImportManager] Bookmark at index ${i} missing URL`);
      }
    }
  }

  /**
   * 导入数据到数据库
   * @param {Object} data - 要导入的数据
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 导入结果
   */
  async importData(data, options) {
    const { skipDuplicates, mergeStrategy } = options;
    const startTime = Date.now();

    // 发送消息到 background 处理导入
    const response = await chrome.runtime.sendMessage({
      type: 'IMPORT_BOOKMARKS',
      data: data,
      options: {
        skipDuplicates,
        mergeStrategy
      }
    });

    console.log('[ImportManager] Received response from background:', response);
    console.log('[ImportManager] Response type:', typeof response);
    console.log('[ImportManager] Response.success:', response.success);
    console.log('[ImportManager] Response.imported:', response.imported, '(type:', typeof response.imported, ')');
    console.log('[ImportManager] Response.skipped:', response.skipped, '(type:', typeof response.skipped, ')');
    console.log('[ImportManager] Response.failed:', response.failed, '(type:', typeof response.failed, ')');

    if (response.error) {
      throw new Error(response.error);
    }

    const result = {
      imported: response.imported || 0,
      skipped: response.skipped || 0,
      failed: response.failed || 0,
      duration: Date.now() - startTime
    };

    console.log('[ImportManager] Returning result:', result);
    console.log('[ImportManager] Result.imported:', result.imported, '(type:', typeof result.imported, ')');
    return result;
  }

  /**
   * 触发文件选择对话框
   * @param {Function} onFileSelected - 文件选择后的回调函数
   * @returns {void}
   */
  selectFile(onFileSelected) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file && onFileSelected) {
        onFileSelected(file);
      }
    };

    fileInput.click();
  }
}

// 创建单例实例
const exportManager = new ExportManager();
const importManager = new ImportManager();

/**
 * 导出书签
 * @param {Object} data - 要导出的数据
 * @param {string} format - 导出格式
 * @returns {Promise<void>}
 */
export async function exportBookmarks(data, format = 'json') {
  return exportManager.export(data, format);
}

/**
 * 导入书签
 * @param {File} file - 要导入的文件
 * @param {Object} options - 导入选项
 * @returns {Promise<Object>} 导入结果
 */
export async function importBookmarks(file, options) {
  return importManager.import(file, options);
}

/**
 * 触发文件选择对话框
 * @param {Function} onFileSelected - 文件选择回调
 * @returns {void}
 */
export function selectImportFile(onFileSelected) {
  return importManager.selectFile(onFileSelected);
}

// 导出管理器实例（用于高级用法）
export { exportManager, importManager };
export default { exportManager, importManager };
