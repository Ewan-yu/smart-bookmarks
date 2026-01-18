// Smart Bookmarks - 书签同步工具
// 用于与浏览器原生书签 API 同步

/**
 * 同步结果类
 */
class SyncResult {
  constructor() {
    this.added = 0;
    this.updated = 0;
    this.deleted = 0;
    this.skipped = 0;
    this.failed = 0;
    this.errors = [];
    this.startTime = Date.now();
    this.endTime = null;
  }

  finish() {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    return this;
  }

  addError(message, context = {}) {
    this.errors.push({
      message,
      context,
      timestamp: Date.now()
    });
    this.failed++;
  }

  toJSON() {
    return {
      added: this.added,
      updated: this.updated,
      deleted: this.deleted,
      skipped: this.skipped,
      failed: this.failed,
      errors: this.errors,
      duration: this.duration || 0,
      startTime: this.startTime,
      endTime: this.endTime || Date.now()
    };
  }
}

/**
 * 从浏览器导入所有书签（完整版）
 * @param {Object} options - 导入选项
 * @returns {Promise<SyncResult>}
 */
export async function importFromBrowser(options = {}) {
  const {
    includeFolders = true,
    preserveStructure = true,
    skipDuplicates = true,
    onProgress = null
  } = options;

  const result = new SyncResult();

  try {
    // 获取浏览器书签树
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = [];
    const categories = [];

    // 递归遍历书签树
    function traverse(node, path = [], level = 0) {
      try {
        if (node.url) {
          // 这是一个书签
          const bookmark = {
            id: generateId(),
            title: node.title || extractTitleFromUrl(node.url),
            url: node.url,
            description: '',
            favicon: getFaviconUrl(node.url),
            tags: [],
            categories: path.length > 0 ? [path.join('/')] : [],
            dateAdded: node.dateAdded || Date.now(),
            dateModified: node.dateGroupModified || Date.now(),
            status: 'active',
            browserId: node.id,
            index: node.index || 0
          };

          bookmarks.push(bookmark);

          // 进度回调
          if (onProgress && bookmarks.length % 100 === 0) {
            onProgress({
              type: 'import',
              processed: bookmarks.length,
              message: `已导入 ${bookmarks.length} 个书签`
            });
          }
        }

        // 处理文件夹
        if (includeFolders && node.children && node.children.length > 0) {
          const currentPath = node.title ? [...path, node.title] : path;

          // 如果是文件夹，记录分类信息
          if (node.title && !node.url) {
            categories.push({
              id: generateId(),
              name: node.title,
              path: currentPath.join('/'),
              parentId: path.length > 0 ? path[path.length - 1] : null,
              browserId: node.id,
              dateAdded: node.dateAdded || Date.now(),
              index: node.index || 0
            });
          }

          // 递归处理子节点
          for (const child of node.children) {
            traverse(child, currentPath, level + 1);
          }
        }
      } catch (error) {
        result.addError('遍历书签节点失败', { node, error: error.message });
      }
    }

    // 从根节点开始遍历
    traverse(tree[0]);

    // 去重处理
    let finalBookmarks = bookmarks;
    if (skipDuplicates) {
      finalBookmarks = removeDuplicates(bookmarks);
      result.skipped = bookmarks.length - finalBookmarks.length;
    }

    result.added = finalBookmarks.length;

    // 构建分类树结构
    let finalCategories = categories;
    if (preserveStructure) {
      finalCategories = buildCategoryTree(categories);
    }

    return {
      result: result.finish(),
      bookmarks: finalBookmarks,
      categories: finalCategories
    };
  } catch (error) {
    result.addError('导入书签失败', { error: error.message });
    throw new Error(`导入失败: ${error.message}`);
  }
}

/**
 * 同步书签到浏览器（完整版）
 * @param {Array} localBookmarks - 本地书签数组
 * @param {Object} options - 同步选项
 * @returns {Promise<SyncResult>}
 */
export async function syncToBrowser(localBookmarks, options = {}) {
  const {
    createFolders = true,
    updateExisting = true,
    preserveFolderStructure = true,
    onProgress = null
  } = options;

  const result = new SyncResult();

  try {
    // 首先创建文件夹结构
    let folderMap = new Map();
    if (createFolders && preserveFolderStructure) {
      // 从书签中提取所有分类路径
      const allCategories = extractAllCategories(localBookmarks);
      folderMap = await createFolderStructure(allCategories, result);
    }

    // 同步书签
    for (let i = 0; i < localBookmarks.length; i++) {
      const bookmark = localBookmarks[i];

      try {
        let parentFolderId = undefined;

        // 确定父文件夹
        if (preserveFolderStructure && bookmark.categories && bookmark.categories.length > 0) {
          const categoryPath = bookmark.categories[0];
          parentFolderId = folderMap.get(categoryPath);
        }

        if (bookmark.browserId && updateExisting) {
          // 更新现有书签
          await chrome.bookmarks.update(bookmark.browserId, {
            title: bookmark.title
          });
          result.updated++;
        } else if (!bookmark.browserId) {
          // 创建新书签
          const createOptions = {
            title: bookmark.title,
            url: bookmark.url
          };

          if (parentFolderId) {
            createOptions.parentId = parentFolderId;
          }

          const browserResult = await chrome.bookmarks.create(createOptions);
          bookmark.browserId = browserResult.id;
          result.added++;
        } else {
          result.skipped++;
        }

        // 进度回调
        if (onProgress && i % 50 === 0) {
          onProgress({
            type: 'sync',
            processed: i + 1,
            total: localBookmarks.length,
            message: `已同步 ${i + 1}/${localBookmarks.length} 个书签`
          });
        }
      } catch (error) {
        result.addError('同步书签失败', {
          bookmarkId: bookmark.id,
          bookmarkTitle: bookmark.title,
          error: error.message
        });
      }
    }

    return result.finish();
  } catch (error) {
    result.addError('同步过程失败', { error: error.message });
    throw new Error(`同步失败: ${error.message}`);
  }
}

/**
 * 创建浏览器书签文件夹结构（改进版）
 * @param {Array} categories - 分类数组
 * @param {SyncResult} result - 同步结果对象
 * @returns {Promise<Map>}
 */
export async function createFolderStructure(categories, result = null) {
  const folderMap = new Map();

  try {
    // 构建分类树
    const categoryTree = buildCategoryTree(categories);

    // 创建根文件夹
    const rootCategories = categoryTree.filter(c => !c.parentId);

    for (const rootCategory of rootCategories) {
      await createCategoryFolder(rootCategory, null, folderMap, result);
    }

    return folderMap;
  } catch (error) {
    if (result) {
      result.addError('创建文件夹结构失败', { error: error.message });
    }
    throw error;
  }
}

/**
 * 递归创建分类文件夹
 * @param {Object} category - 分类对象
 * @param {string|null} parentId - 父文件夹 ID
 * @param {Map} folderMap - 文件夹映射
 * @param {SyncResult} result - 同步结果对象
 */
async function createCategoryFolder(category, parentId, folderMap, result) {
  try {
    const folder = await chrome.bookmarks.create({
      parentId,
      title: category.name,
      type: 'folder'
    });

    // 存储映射：分类路径 -> 浏览器文件夹 ID
    folderMap.set(category.path || category.name, folder.id);

    // 如果有浏览器 ID，也存储这个映射
    if (category.browserId) {
      folderMap.set(category.browserId, folder.id);
    }

    // 递归创建子文件夹
    if (category.children && category.children.length > 0) {
      for (const child of category.children) {
        await createCategoryFolder(child, folder.id, folderMap, result);
      }
    }
  } catch (error) {
    if (result) {
      result.addError('创建文件夹失败', {
        categoryName: category.name,
        error: error.message
      });
    }
  }
}

/**
 * 从书签中提取所有分类（改进版）
 * @param {Array} bookmarks - 书签数组
 * @returns {Array}
 */
function extractAllCategories(bookmarks) {
  const categoryMap = new Map();

  for (const bookmark of bookmarks) {
    if (bookmark.categories && bookmark.categories.length > 0) {
      for (const categoryPath of bookmark.categories) {
        const parts = categoryPath.split('/');
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          if (!categoryMap.has(currentPath)) {
            categoryMap.set(currentPath, {
              id: generateId(),
              name: part,
              path: currentPath,
              parentId: i > 0 ? parts.slice(0, i).join('/') : null
            });
          }
        }
      }
    }
  }

  return Array.from(categoryMap.values());
}

/**
 * 构建分类树结构
 * @param {Array} categories - 分类数组
 * @returns {Array}
 */
function buildCategoryTree(categories) {
  const categoryMap = new Map();
  const rootCategories = [];

  // 先创建映射
  for (const category of categories) {
    categoryMap.set(category.path, {
      ...category,
      children: []
    });
  }

  // 构建树结构
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
 * 从 URL 提取标题
 * @param {string} url - URL 地址
 * @returns {string}
 */
function extractTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * 去除重复的书签
 * @param {Array} bookmarks - 书签数组
 * @returns {Array}
 */
function removeDuplicates(bookmarks) {
  const seen = new Set();
  const unique = [];

  for (const bookmark of bookmarks) {
    const key = `${bookmark.url}|${bookmark.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(bookmark);
    }
  }

  return unique;
}

/**
 * 获取网站图标 URL
 */
function getFaviconUrl(url) {
  try {
    const origin = new URL(url).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return '';
  }
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 搜索浏览器书签（增强版）
 * @param {string} query - 搜索查询
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>}
 */
export async function searchBrowserBookmarks(query, options = {}) {
  const {
    maxResults = 100,
    includeFolders = false
  } = options;

  try {
    const results = await chrome.bookmarks.search(query);

    // 过滤和限制结果
    let filtered = results;

    if (!includeFolders) {
      filtered = filtered.filter(item => item.url);
    }

    if (maxResults && filtered.length > maxResults) {
      filtered = filtered.slice(0, maxResults);
    }

    return filtered.map(item => ({
      id: item.id,
      title: item.title || extractTitleFromUrl(item.url),
      url: item.url,
      dateAdded: item.dateAdded,
      index: item.index,
      parentId: item.parentId
    }));
  } catch (error) {
    console.error('搜索浏览器书签失败:', error);
    return [];
  }
}

/**
 * 监听书签变化（增强版）
 * @param {Function} callback - 回调函数
 * @returns {Function} - 清理函数
 */
export function onBookmarkChanged(callback) {
  const listeners = {
    changed: (id, changeInfo) => {
      callback({
        type: 'changed',
        id,
        ...changeInfo
      });
    },
    created: (id, bookmark) => {
      callback({
        type: 'created',
        id,
        bookmark
      });
    },
    removed: (id, removeInfo) => {
      callback({
        type: 'removed',
        id,
        ...removeInfo
      });
    },
    moved: (id, moveInfo) => {
      callback({
        type: 'moved',
        id,
        ...moveInfo
      });
    }
  };

  // 注册所有监听器
  chrome.bookmarks.onChanged.addListener(listeners.changed);
  chrome.bookmarks.onCreated.addListener(listeners.created);
  chrome.bookmarks.onRemoved.addListener(listeners.removed);
  chrome.bookmarks.onMoved.addListener(listeners.moved);

  // 返回清理函数
  return () => {
    chrome.bookmarks.onChanged.removeListener(listeners.changed);
    chrome.bookmarks.onCreated.removeListener(listeners.created);
    chrome.bookmarks.onRemoved.removeListener(listeners.removed);
    chrome.bookmarks.onMoved.removeListener(listeners.moved);
  };
}

/**
 * 获取书签统计信息
 * @returns {Promise<Object>}
 */
export async function getBookmarkStats() {
  try {
    const tree = await chrome.bookmarks.getTree();

    const stats = {
      total: 0,
      folders: 0,
      bookmarks: 0,
      depth: 0,
      byFolder: {}
    };

    function traverse(node, depth = 0) {
      stats.depth = Math.max(stats.depth, depth);

      if (node.url) {
        stats.bookmarks++;
        stats.total++;
      } else if (node.title) {
        stats.folders++;
        stats.total++;
        if (!stats.byFolder[node.title]) {
          stats.byFolder[node.title] = 0;
        }
      }

      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
          if (!child.url && child.title && stats.byFolder[child.title] !== undefined) {
            stats.byFolder[child.title] += child.children ? child.children.filter(c => c.url).length : 0;
          }
        }
      }
    }

    traverse(tree[0]);

    return stats;
  } catch (error) {
    console.error('获取书签统计失败:', error);
    return {
      total: 0,
      folders: 0,
      bookmarks: 0,
      depth: 0,
      byFolder: {}
    };
  }
}

/**
 * 导出书签到浏览器（导出操作）
 * @param {Array} bookmarks - 书签数组
 * @param {string} format - 导出格式 ('json' | 'html')
 * @returns {Promise<string>}
 */
export async function exportBookmarks(bookmarks, format = 'json') {
  try {
    if (format === 'html') {
      return exportToHtml(bookmarks);
    } else {
      return JSON.stringify({
        version: '1.0',
        exported: new Date().toISOString(),
        count: bookmarks.length,
        bookmarks
      }, null, 2);
    }
  } catch (error) {
    throw new Error(`导出失败: ${error.message}`);
  }
}

/**
 * 导出为 HTML 格式
 * @param {Array} bookmarks - 书签数组
 * @returns {string}
 */
function exportToHtml(bookmarks) {
  const now = new Date().toLocaleString();

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  // 按分类分组
  const grouped = groupByCategory(bookmarks);

  for (const [category, items] of Object.entries(grouped)) {
    if (category) {
      html += `    <DT><H3>${escapeHtml(category)}</H3>\n`;
      html += `    <DL><p>\n`;
    }

    for (const bookmark of items) {
      const dateAdded = Math.floor(bookmark.dateAdded / 1000);
      html += `        <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${dateAdded}">${escapeHtml(bookmark.title)}</A>\n`;
    }

    if (category) {
      html += `    </DL><p>\n`;
    }
  }

  html += `</DL><p>`;

  return html;
}

/**
 * 按分类分组书签
 * @param {Array} bookmarks - 书签数组
 * @returns {Object}
 */
function groupByCategory(bookmarks) {
  const grouped = { '': [] };

  for (const bookmark of bookmarks) {
    if (bookmark.categories && bookmark.categories.length > 0) {
      const category = bookmark.categories[0];
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(bookmark);
    } else {
      grouped[''].push(bookmark);
    }
  }

  return grouped;
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
  return text.replace(/[&<>"']/g, m => map[m]);
}
