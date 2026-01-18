// Smart Bookmarks - 数据导出工具
// 支持导出为 JSON 和 HTML 格式

/**
 * 导出选项
 */
export const ExportFormat = {
  JSON: 'json',
  HTML: 'html',
  CSV: 'csv',
  MARKDOWN: 'markdown'
};

/**
 * 导出为 JSON 格式
 * @param {Object} data - 要导出的数据
 * @param {Object} options - 导出选项
 * @returns {string} JSON 字符串
 */
export function exportToJson(data, options = {}) {
  const {
    pretty = true,
    includeMetadata = true
  } = options;

  try {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      format: 'json'
    };

    if (includeMetadata) {
      exportData.metadata = {
        count: data.bookmarks?.length || 0,
        categories: data.categories?.length || 0,
        tags: data.tags?.length || 0
      };
    }

    // 合并数据
    Object.assign(exportData, data);

    return JSON.stringify(exportData, null, pretty ? 2 : 0);
  } catch (error) {
    throw new Error(`JSON 导出失败: ${error.message}`);
  }
}

/**
 * 导出为 HTML 格式（标准浏览器书签格式）
 * @param {Object} data - 要导出的数据
 * @param {Object} options - 导出选项
 * @returns {string} HTML 字符串
 */
export function exportToHtml(data, options = {}) {
  const {
    title = 'Smart Bookmarks',
    includeTimestamp = true,
    includeDates = true,
    groupByFolder = true
  } = options;

  try {
    const bookmarks = data.bookmarks || [];
    const categories = data.categories || [];

    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!--
    This is an automatically generated file.
    It will be read and overwritten.
    DO NOT EDIT!
-->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>${escapeHtml(title)}</TITLE>
<H1>${escapeHtml(title)}</H1>
<DL><p>
`;

    if (includeTimestamp) {
      html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}" LAST_MODIFIED="${Math.floor(Date.now() / 1000)}">导出时间</H3>\n`;
      html += `    <DL><p>\n`;
      html += `        <DT><A HREF="about:blank" ADD_DATE="${Math.floor(Date.now() / 1000)}">${new Date().toLocaleString('zh-CN')}</A>\n`;
      html += `    </DL><p>\n`;
    }

    if (groupByFolder && categories.length > 0) {
      // 按文件夹分组导出
      html += exportBookmarksByFolder(bookmarks, categories, includeDates);
    } else {
      // 直接导出所有书签
      html += exportBookmarksFlat(bookmarks, includeDates);
    }

    html += `</DL><p>\n`;

    return html;
  } catch (error) {
    throw new Error(`HTML 导出失败: ${error.message}`);
  }
}

/**
 * 按文件夹分组导出书签
 * @param {Array} bookmarks - 书签数组
 * @param {Array} categories - 分类数组
 * @param {boolean} includeDates - 是否包含日期
 * @returns {string}
 */
function exportBookmarksByFolder(bookmarks, categories, includeDates) {
  let html = '';

  // 构建分类树
  const categoryTree = buildCategoryTree(categories);

  // 导出每个分类
  for (const category of categoryTree) {
    html += exportCategory(category, bookmarks, includeDates, 1);
  }

  // 导出未分类的书签
  const uncategorized = bookmarks.filter(b =>
    !b.categories || b.categories.length === 0
  );

  if (uncategorized.length > 0) {
    html += `    <DT><H3>未分类</H3>\n`;
    html += `    <DL><p>\n`;
    for (const bookmark of uncategorized) {
      html += exportBookmarkItem(bookmark, includeDates, 2);
    }
    html += `    </DL><p>\n`;
  }

  return html;
}

/**
 * 递归导出分类
 * @param {Object} category - 分类对象
 * @param {Array} bookmarks - 书签数组
 * @param {boolean} includeDates - 是否包含日期
 * @param {number} level - 缩进级别
 * @returns {string}
 */
function exportCategory(category, bookmarks, includeDates, level) {
  const indent = '    '.repeat(level);
  let html = '';

  // 查找属于该分类的书签
  const categoryBookmarks = bookmarks.filter(b =>
    b.categories && b.categories.includes(category.path)
  );

  if (categoryBookmarks.length === 0 && (!category.children || category.children.length === 0)) {
    return html;
  }

  html += `${indent}<DT><H3>${escapeHtml(category.name)}</H3>\n`;
  html += `${indent}<DL><p>\n`;

  // 导出书签
  for (const bookmark of categoryBookmarks) {
    html += exportBookmarkItem(bookmark, includeDates, level + 1);
  }

  // 递归导出子分类
  if (category.children && category.children.length > 0) {
    for (const child of category.children) {
      html += exportCategory(child, bookmarks, includeDates, level + 1);
    }
  }

  html += `${indent}</DL><p>\n`;

  return html;
}

/**
 * 平铺导出所有书签
 * @param {Array} bookmarks - 书签数组
 * @param {boolean} includeDates - 是否包含日期
 * @returns {string}
 */
function exportBookmarksFlat(bookmarks, includeDates) {
  let html = '';

  for (const bookmark of bookmarks) {
    html += exportBookmarkItem(bookmark, includeDates, 1);
  }

  return html;
}

/**
 * 导出单个书签项
 * @param {Object} bookmark - 书签对象
 * @param {boolean} includeDates - 是否包含日期
 * @param {number} level - 缩进级别
 * @returns {string}
 */
function exportBookmarkItem(bookmark, includeDates, level) {
  const indent = '    '.repeat(level);
  const dateAttr = includeDates ? ` ADD_DATE="${Math.floor((bookmark.dateAdded || Date.now()) / 1000)}"` : '';

  return `${indent}<DT><A HREF="${escapeHtml(bookmark.url)}"${dateAttr}>${escapeHtml(bookmark.title)}</A>\n`;
}

/**
 * 导出为 CSV 格式
 * @param {Object} data - 要导出的数据
 * @param {Object} options - 导出选项
 * @returns {string} CSV 字符串
 */
export function exportToCsv(data, options = {}) {
  const {
    delimiter = ',',
    includeHeaders = true
  } = options;

  try {
    const bookmarks = data.bookmarks || [];
    const rows = [];

    // 添加标题行
    if (includeHeaders) {
      rows.push(['标题', 'URL', '分类', '标签', '描述', '添加时间'].join(delimiter));
    }

    // 添加数据行
    for (const bookmark of bookmarks) {
      const row = [
        escapeCsvField(bookmark.title || ''),
        escapeCsvField(bookmark.url || ''),
        escapeCsvField((bookmark.categories || []).join('; ')),
        escapeCsvField((bookmark.tags || []).join('; ')),
        escapeCsvField(bookmark.description || ''),
        escapeCsvField(new Date(bookmark.dateAdded).toLocaleString('zh-CN'))
      ];
      rows.push(row.join(delimiter));
    }

    return rows.join('\n');
  } catch (error) {
    throw new Error(`CSV 导出失败: ${error.message}`);
  }
}

/**
 * 导出为 Markdown 格式
 * @param {Object} data - 要导出的数据
 * @param {Object} options - 导出选项
 * @returns {string} Markdown 字符串
 */
export function exportToMarkdown(data, options = {}) {
  const {
    title = '# 我的书签',
    groupByCategory = true
  } = options;

  try {
    const bookmarks = data.bookmarks || [];
    const categories = data.categories || [];

    let markdown = `${title}\n\n`;
    markdown += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
    markdown += `---\n\n`;

    if (groupByCategory && categories.length > 0) {
      // 按分类分组
      const categoryTree = buildCategoryTree(categories);

      for (const category of categoryTree) {
        markdown += exportCategoryToMarkdown(category, bookmarks, 2);
      }

      // 未分类的书签
      const uncategorized = bookmarks.filter(b =>
        !b.categories || b.categories.length === 0
      );

      if (uncategorized.length > 0) {
        markdown += `## 未分类\n\n`;
        for (const bookmark of uncategorized) {
          markdown += exportBookmarkToMarkdown(bookmark);
        }
      }
    } else {
      // 平铺导出
      for (const bookmark of bookmarks) {
        markdown += exportBookmarkToMarkdown(bookmark);
      }
    }

    return markdown;
  } catch (error) {
    throw new Error(`Markdown 导出失败: ${error.message}`);
  }
}

/**
 * 导出分类为 Markdown
 * @param {Object} category - 分类对象
 * @param {Array} bookmarks - 书签数组
 * @param {number} level - 标题级别
 * @returns {string}
 */
function exportCategoryToMarkdown(category, bookmarks, level) {
  const prefix = '#'.repeat(level);
  let markdown = '';

  const categoryBookmarks = bookmarks.filter(b =>
    b.categories && b.categories.includes(category.path)
  );

  if (categoryBookmarks.length === 0 && (!category.children || category.children.length === 0)) {
    return markdown;
  }

  markdown += `${prefix} ${category.name}\n\n`;

  for (const bookmark of categoryBookmarks) {
    markdown += exportBookmarkToMarkdown(bookmark);
  }

  if (category.children && category.children.length > 0) {
    for (const child of category.children) {
      markdown += exportCategoryToMarkdown(child, bookmarks, level + 1);
    }
  }

  return markdown;
}

/**
 * 导出单个书签为 Markdown
 * @param {Object} bookmark - 书签对象
 * @returns {string}
 */
function exportBookmarkToMarkdown(bookmark) {
  let md = `- [${bookmark.title}](${bookmark.url})`;

  if (bookmark.description) {
    md += ` - ${bookmark.description}`;
  }

  if (bookmark.tags && bookmark.tags.length > 0) {
    md += ` \`${bookmark.tags.map(t => `#${t}`).join(' ')}\``;
  }

  md += '\n';
  return md;
}

/**
 * 构建分类树
 * @param {Array} categories - 分类数组
 * @returns {Array}
 */
function buildCategoryTree(categories) {
  const categoryMap = new Map();
  const rootCategories = [];

  // 创建映射
  for (const category of categories) {
    categoryMap.set(category.path, {
      ...category,
      children: []
    });
  }

  // 构建树
  for (const category of categoryMap.values()) {
    if (category.parentId && categoryMap.has(category.parentId)) {
      categoryMap.get(category.parentId).children.push(category);
    } else {
      rootCategories.push(category);
    }
  }

  return rootCategories;
}

/**
 * HTML 转义
 * @param {string} text - 要转义的文本
 * @returns {string}
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * CSV 字段转义
 * @param {string} field - 字段值
 * @returns {string}
 */
function escapeCsvField(field) {
  const text = String(field);
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 触发文件下载
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME 类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    throw new Error(`下载文件失败: ${error.message}`);
  }
}

/**
 * 导出并下载文件
 * @param {Object} data - 要导出的数据
 * @param {string} format - 导出格式
 * @param {Object} options - 导出选项
 */
export function exportAndDownload(data, format, options = {}) {
  const filename = options.filename || generateFilename(format);

  let content;
  let mimeType;

  switch (format) {
    case ExportFormat.JSON:
      content = exportToJson(data, options);
      mimeType = 'application/json';
      break;
    case ExportFormat.HTML:
      content = exportToHtml(data, options);
      mimeType = 'text/html';
      break;
    case ExportFormat.CSV:
      content = exportToCsv(data, options);
      mimeType = 'text/csv';
      break;
    case ExportFormat.MARKDOWN:
      content = exportToMarkdown(data, options);
      mimeType = 'text/markdown';
      break;
    default:
      throw new Error(`不支持的导出格式: ${format}`);
  }

  downloadFile(content, filename, mimeType);
}

/**
 * 生成文件名
 * @param {string} format - 文件格式
 * @returns {string}
 */
function generateFilename(format) {
  const date = new Date().toISOString().split('T')[0];
  return `smart-bookmarks-${date}.${format}`;
}

/**
 * 导出为备份数据（用于恢复）
 * @param {Object} data - 要导出的数据
 * @returns {string}
 */
export function exportForBackup(data) {
  const backupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    type: 'backup',
    data: {
      bookmarks: data.bookmarks || [],
      categories: data.categories || [],
      tags: data.tags || []
    }
  };

  return JSON.stringify(backupData, null, 2);
}

/**
 * 从备份导入
 * @param {string} backupString - 备份字符串
 * @returns {Object}
 */
export function importFromBackup(backupString) {
  try {
    const backup = JSON.parse(backupString);

    if (backup.type !== 'backup') {
      throw new Error('无效的备份文件格式');
    }

    return {
      bookmarks: backup.data.bookmarks || [],
      categories: backup.data.categories || [],
      tags: backup.data.tags || []
    };
  } catch (error) {
    throw new Error(`导入备份失败: ${error.message}`);
  }
}
