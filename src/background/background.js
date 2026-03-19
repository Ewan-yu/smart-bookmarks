// Smart Bookmarks - Background Service Worker

// 导入数据库和链接检测工具
import {
  openDB,
  getAllBookmarks,
  addBookmark,
  getBookmark,
  deleteBookmark,
  getAllCategories,
  addCategory,
  deleteCategory,
  getAllTags,
  get,
  addTag,
  clearAllData,
  STORES
} from '../db/indexeddb.js';
import { checkBookmarks, batchMoveToPendingCleanup } from '../utils/link-checker.js';
import { batchExtractSummaries, enrichBookmarks } from '../utils/page-summarizer.js';
import { analyzeBookmarks, analyzeBookmarksDebug } from '../api/openai.js';

console.log('Smart Bookmarks background service worker loaded');

/**
 * 规范化 URL，用于比较和去重
 * 统一 URL 格式，避免因为格式差异导致的重复
 * @param {string} url - 原始 URL
 * @returns {string} 规范化后的 URL
 */
function normalizeUrl(url) {
  if (!url) return '';

  try {
    let normalized = url.trim();

    // 移除尾部斜杠（但不保留根路径的斜杠）
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    // 转换为小写（域名和协议部分不区分大小写）
    // 但保留路径的大小写（某些服务器区分大小写）
    try {
      const urlObj = new URL(normalized);
      normalized = urlObj.origin + urlObj.pathname;
      // 移除 pathname 的尾部斜杠（已经在上面处理）
      if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
    } catch (e) {
      // URL 解析失败，返回原始 URL
      console.warn(`Failed to normalize URL: ${url}`, e);
    }

    return normalized;
  } catch (e) {
    console.error(`Error normalizing URL: ${url}`, e);
    return url;
  }
}

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
  // 打开主界面（全屏页面）
  await chrome.tabs.create({
    url: 'src/popup/popup.html',
    active: true
  });
});

// 数据库实例
let db = null;

// 当前链接检测任务的取消令牌
let currentCheckCancelToken = null;
// 当前检测进度快照（popup 重新打开时用于恢复 UI）
let currentCheckProgress = null;

// 当前 AI 分析任务的取消令牌
let currentAnalysisCancelToken = null;

// 初始化数据库
async function initDatabase() {
  if (!db) {
    db = await openDB();
  }
  return db;
}

/**
 * 智能提取用户的有意义分类
 * 过滤掉通用分类，保留有意义的分类（技术、设计、财经、人文、书籍等）
 * @param {Array} categories - 所有分类
 * @returns {Array<string>} 有意义的分类名称列表
 */
function extractTechStackCategories(categories) {
  // 通用分类关键词（这些不是有意义的分类，应该过滤掉）
  const genericKeywords = [
    '全部', '收藏', '书签', '未分类', '其他', '待清理',
    '最近', '添加', '失效', '链接', '标签', '视图',
    '我的', '常用', '工作', '生活', '娱乐',
    'to-do', 'todo', 'inbox', 'done', 'archive'
  ];

  // 技术类关键词
  const techKeywords = [
    // 前端框架 & 库
    'react', 'vue', 'angular', 'svelte', 'solid', 'qwik',
    'nextjs', 'nuxtjs', 'remix', 'astro',
    'typescript', 'javascript', 'html', 'css', 'tailwind', 'bootstrap',
    // 后端框架
    'java', 'spring', 'node', 'nodejs', 'express', 'python', 'django', 'flask',
    'go', 'golang', '.net', 'c#', 'php', 'ruby', 'rust',
    // 数据库
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    // 移动端
    'ios', 'android', 'flutter', 'reactnative', 'dart',
    // 运维 & 工具
    'docker', 'kubernetes', 'linux', 'nginx', 'git', 'webpack', 'vite',
    // 技术领域（中文）
    '前端', '后端', '全栈', '数据库', '运维', '测试', '算法', '架构'
  ];

  // 设计类关键词
  const designKeywords = [
    'figma', 'sketch', 'adobe', 'photoshop', 'illustrator', 'xd',
    'ui', 'ux', '产品设计', '交互设计', '平面设计',
    '图标', '插画', '字体', '配色', '设计资源',
    '设计', '原型', '动效', '品牌', '视觉'
  ];

  // 财经商业类关键词
  const financeKeywords = [
    '投资', '理财', '股票', '基金', '债券', '保险',
    '创业', '企业管理', '营销', 'seo', '商业',
    '经济', '财经', '金融', '市场', '战略'
  ];

  // 人文社科类关键词
  const humanitiesKeywords = [
    '历史', '哲学', '心理学', '社会学', '政治', '法律',
    '文学', '艺术', '文化', '宗教', '人类学'
  ];

  // 书籍阅读类关键词
  const bookKeywords = [
    '书单', '书籍', '电子书', '阅读', '读书笔记', '书评',
    'library', 'book', 'reading'
  ];

  // 所有有意义的关键词
  const meaningfulKeywords = [
    ...techKeywords,
    ...designKeywords,
    ...financeKeywords,
    ...humanitiesKeywords,
    ...bookKeywords
  ];

  const categoryNames = categories.map(c => c.name.toLowerCase());

  // 过滤出有意义的分类
  const meaningfulCategories = categories.filter(category => {
    const name = category.name.toLowerCase();

    // 排除通用分类（精确匹配或包含）
    if (genericKeywords.some(kw => name === kw || name === `${kw}s`)) {
      return false;
    }

    // 检查是否包含有意义的关键词
    const hasMeaningfulKeyword = meaningfulKeywords.some(kw => name.includes(kw));

    if (hasMeaningfulKeyword) {
      return true;
    }

    // 启发式规则：识别可能有意义的分类
    // 1. 分类名称中包含特定领域的词汇
    const meaningfulPatterns = [
      // 技术栈组合
      /.*全栈.*/i, /.*full-?stack.*/i, /.*frontend.*/i, /.*backend.*/i,
      /.*前端.*/i, /.*后端.*/i, /.*服务端.*/i,
      // 技术领域
      /.*数据库.*/i, /.*运维.*/i, /.*测试.*/i, /.*安全.*/i,
      /.*性能.*/i, /.*优化.*/i, /.*架构.*/i,
      // 设计领域
      /.*设计.*/i, /.*ui.*/i, /.*ux.*/i,
      // 内容领域
      /.*管理.*/i, /.*开发.*/i,
    ];

    const matchesPattern = meaningfulPatterns.some(pattern => pattern.test(name));

    // 2. 分类名称是英文驼峰或连字符格式，可能是一个技术框架或工具
    // 例如：ReactHooks, Vue-Router, Next-Auth
    const isTechFormat = /^[A-Z][a-zA-Z0-9]*(?:[-_][A-Z][a-zA-Z0-9]*)+$/.test(name) ||
                         /^[a-z]+(?:[-_][a-z0-9]+)*\.(?:js|ts|css|json)$/.test(name);

    return matchesPattern || isTechFormat;
  });

  // 提取分类名称
  const meaningfulCategoryNames = meaningfulCategories.map(c => c.name);

  console.log(`[分类检测] 总分类: ${categoryNames.length}, 有意义分类: ${meaningfulCategoryNames.length}`);
  console.log(`[分类检测] 用户分类: ${meaningfulCategoryNames.join(', ')}`);

  return meaningfulCategoryNames;
}

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // 首次安装，初始化数据
    await initializeData();
  }
});

// ===== 浏览器书签实时同步监听 =====

/**
 * 用户新增书签时同步到插件 DB
 */
chrome.bookmarks.onCreated.addListener(async (id, bookmarkNode) => {
  // 只处理有 URL 的书签（不处理文件夹）
  if (!bookmarkNode.url) {
    // 新建文件夹 → 同步为分类
    if (bookmarkNode.title) {
      try {
        await initDatabase();
        const catId = `cat_${id}`;
        const existing = await get(STORES.CATEGORIES, catId);
        if (!existing) {
          const parentCatId = bookmarkNode.parentId ? `cat_${bookmarkNode.parentId}` : null;
          await addCategory({
            id: catId,
            name: bookmarkNode.title,
            parentId: parentCatId,
            createdAt: Date.now()
          });
          console.log(`[Sync] 新增分类: ${bookmarkNode.title}`);
        }
      } catch (e) {
        console.debug('[Sync] 新增分类失败:', e.message);
      }
    }
    return;
  }

  try {
    await initDatabase();

    const parentCategoryId = bookmarkNode.parentId ? `cat_${bookmarkNode.parentId}` : null;

    const bookmark = {
      id,
      title: bookmarkNode.title || '未命名书签',
      url: bookmarkNode.url,
      description: '',
      tags: [],
      categoryId: parentCategoryId,
      status: 'active',
      createdAt: bookmarkNode.dateAdded || Date.now(),
      updatedAt: Date.now()
    };

    // 尝试从当前活动标签页的 content script 采集页面信息
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url === bookmarkNode.url) {
        const pageInfo = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_INFO' });
        if (pageInfo) {
          if (pageInfo.description) bookmark.description = pageInfo.description.slice(0, 300);
          if (pageInfo.favicon) bookmark.favicon = pageInfo.favicon;
        }
      }
    } catch {
      // content script 可能未加载，忽略
    }

    await addBookmark(bookmark);
    console.log(`[Sync] 新增书签: ${bookmark.title} (${bookmark.url.slice(0, 50)})`);

    // 通知 popup 刷新
    notifyBookmarkChanged('created', id);
  } catch (error) {
    console.error('[Sync] 新增书签失败:', error);
  }
});

/**
 * 用户删除书签时从插件 DB 移除
 */
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    await initDatabase();

    // 尝试删除书签
    const bookmark = await getBookmark(id);
    if (bookmark) {
      await deleteBookmark(id);
      console.log(`[Sync] 删除书签: ${bookmark.title}`);
      notifyBookmarkChanged('removed', id);
      return;
    }

    // 也可能是删除文件夹（分类）
    const catId = `cat_${id}`;
    const category = await get(STORES.CATEGORIES, catId);
    if (category) {
      const { deleteItem } = await import('../db/indexeddb.js');
      await deleteItem(STORES.CATEGORIES, catId);
      console.log(`[Sync] 删除分类: ${category.name}`);
      notifyBookmarkChanged('removed', id);
    }
  } catch (error) {
    console.error('[Sync] 删除书签失败:', error);
  }
});

/**
 * 用户修改书签标题/URL 时同步
 */
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    await initDatabase();
    const bookmark = await getBookmark(id);
    if (bookmark) {
      if (changeInfo.title !== undefined) bookmark.title = changeInfo.title;
      if (changeInfo.url !== undefined) bookmark.url = changeInfo.url;
      bookmark.updatedAt = Date.now();
      await addBookmark(bookmark);
      console.log(`[Sync] 更新书签: ${bookmark.title}`);
      notifyBookmarkChanged('changed', id);
    }
  } catch (error) {
    console.error('[Sync] 更新书签失败:', error);
  }
});

/**
 * 用户移动书签到其他文件夹时同步分类
 */
chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  try {
    await initDatabase();
    const bookmark = await getBookmark(id);
    if (bookmark) {
      bookmark.categoryId = moveInfo.parentId ? `cat_${moveInfo.parentId}` : null;
      bookmark.updatedAt = Date.now();
      await addBookmark(bookmark);
      console.log(`[Sync] 移动书签: ${bookmark.title} -> 分类 ${bookmark.categoryId}`);
      notifyBookmarkChanged('moved', id);
    }
  } catch (error) {
    console.error('[Sync] 移动书签失败:', error);
  }
});

/**
 * 通知 popup 书签数据已变更，需要刷新
 */
function notifyBookmarkChanged(action, bookmarkId) {
  chrome.runtime.sendMessage({
    type: 'BOOKMARK_CHANGED',
    data: { action, bookmarkId }
  }).catch(() => {
    // popup 可能未打开，忽略
  });
}

// 初始化数据
async function initializeData() {
  try {
    console.log('Initializing data...');

    // 初始化数据库
    await initDatabase();

    // 导入浏览器现有收藏
    await importBrowserBookmarks();

    console.log('Data initialized successfully');
  } catch (error) {
    console.error('Failed to initialize data:', error);
  }
}

/**
 * 导入浏览器现有收藏
 */
async function importBrowserBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const browserBookmarks = flattenBookmarkTree(tree);

    console.log(`Found ${browserBookmarks.length} browser bookmarks`);

    // 获取已存在的书签
    const existingBookmarks = await getAllBookmarks();
    const existingIds = new Set(existingBookmarks.map(b => b.id));

    // 使用规范化的 URL 进行比较（避免格式差异导致的重复）
    const existingUrls = new Set(
      existingBookmarks
        .map(b => normalizeUrl(b.url))
        .filter(u => u)
    );

    // 过滤出需要导入的书签（同时检查 ID 和 URL）
    const newBookmarks = browserBookmarks.filter(bm => {
      const normalizedUrl = normalizeUrl(bm.url);
      // ID 不存在且 URL 也不存在
      return !existingIds.has(bm.id) && !existingUrls.has(normalizedUrl);
    });

    if (newBookmarks.length === 0) {
      console.log('All bookmarks already imported, nothing new to add');
      return;
    }

    console.log(`Importing ${newBookmarks.length} new bookmarks (skipping ${existingIds.size} existing by ID, ${existingUrls.size - existingIds.size} by URL)`);

    // 存储到 IndexedDB
    for (const bm of newBookmarks) {
      const bookmark = {
        id: bm.id,
        title: bm.title,
        url: bm.url,
        description: '',
        tags: [],
        categoryId: bm.parentCategoryId || null, // 使用所属文件夹ID
        status: 'active',
        createdAt: bm.dateAdded || Date.now(),
        updatedAt: Date.now()
      };

      await addBookmark(bookmark);
      console.log(`[IMPORT] Imported bookmark: ${bm.title} (${bm.url})`);
    }

    // 提取并保存现有分类
    const categories = extractCategoriesFromTree(tree);
    let newCategoryCount = 0;
    for (const cat of categories) {
      // 检查分类是否已存在
      const existing = await get(STORES.CATEGORIES, cat.id);
      if (!existing) {
        await addCategory(cat);
        newCategoryCount++;
      }
    }

    console.log(`Imported ${newBookmarks.length} new bookmarks and ${newCategoryCount} new categories`);
  } catch (error) {
    console.error('Failed to import browser bookmarks:', error);
    throw error;
  }
}

/**
 * 扁平化收藏树
 * 遍历书签树，收集所有书签及其所属文件夹信息
 */
function flattenBookmarkTree(nodes, parentCategoryId = null) {
  const bookmarks = [];

  function traverse(node, currentFolderId = null) {
    if (node.url) {
      // 这是一个书签
      bookmarks.push({
        id: node.id,
        title: node.title || '未命名书签',
        url: node.url,
        dateAdded: node.dateAdded,
        // 保存所属文件夹ID
        parentCategoryId: currentFolderId
      });
    }

    // 递归遍历子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (!child.url && child.title) {
          // 子节点是文件夹，更新 currentFolderId
          const folderId = `cat_${child.id}`;
          traverse(child, folderId);
        } else {
          // 子节点不是文件夹，保持 currentFolderId
          traverse(child, currentFolderId);
        }
      });
    }
  }

  // 从根节点开始遍历
  nodes.forEach(node => traverse(node, null));
  return bookmarks;
}

/**
 * 从收藏树中提取分类
 */
function extractCategoriesFromTree(nodes) {
  const categories = [];

  function traverse(node, parentId = null) {
    if (!node.url && node.title) {
      // 这是一个文件夹/分类
      categories.push({
        id: `cat_${node.id}`,
        name: node.title,
        parentId,
        createdAt: Date.now()
      });

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, `cat_${node.id}`));
      }
    } else if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, parentId));
    }
  }

  nodes.forEach(node => traverse(node));
  return categories;
}

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', JSON.stringify(request));

  // 处理不同类型的消息
  switch (request.type) {
    case 'GET_BOOKMARKS':
      handleGetBookmarks(request, sendResponse);
      return true; // 保持消息通道开启以支持异步响应

    case 'GET_CATEGORIES':
      handleGetCategories(request, sendResponse);
      return true;

    case 'SYNC_BOOKMARKS':
      handleSyncBookmarks(request, sendResponse);
      return true;

    case 'CHECK_BROKEN_LINKS':
      handleCheckBrokenLinks(request, sendResponse);
      return true;

    case 'CANCEL_CHECK':
      if (currentCheckCancelToken) {
        currentCheckCancelToken.cancelled = true;
      }
      sendResponse({ success: true });
      return true;

    case 'GET_CHECK_STATUS':
      // 用于 popup 重新打开时查询后台检测是否仍在运行
      sendResponse({
        isRunning: currentCheckCancelToken !== null,
        progress: currentCheckProgress
      });
      return true;

    case 'GET_CHECK_SESSION':
      chrome.storage.local.get('checkSession').then(result => {
        sendResponse({ session: result.checkSession || null });
      });
      return true;

    case 'CLEAR_CHECK_SESSION':
      chrome.storage.local.remove('checkSession').then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'AI_ANALYZE':
      handleAIAnalyze(request, sendResponse);
      return true;

    case 'AI_ANALYZE_DEBUG':
      handleAIAnalyzeDebug(request, sendResponse);
      return true;

    case 'APPLY_CATEGORIES':
      handleApplyCategories(request, sendResponse);
      return true;

    case 'GET_ANALYSIS_SESSION':
      chrome.storage.local.get('analysisSession').then(result => {
        sendResponse({ session: result.analysisSession || null });
      });
      return true;

    case 'CLEAR_ANALYSIS_SESSION':
      chrome.storage.local.remove('analysisSession').then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'CANCEL_ANALYSIS':
      if (currentAnalysisCancelToken) {
        currentAnalysisCancelToken.cancelled = true;
        // 立即清理 token，允许重新启动
        currentAnalysisCancelToken = null;
      }
      sendResponse({ success: true });
      return true;

    case 'IMPORT_FROM_BROWSER':
      handleImportFromBrowser(request, sendResponse);
      return true;

    case 'CLEAR_DATA':
      handleClearData(request, sendResponse);
      return true;

    case 'PAGE_INFO_COLLECTED':
      handlePageInfoCollected(request, sender);
      sendResponse({ success: true });
      return false; // 同步响应

    case 'DELETE_BOOKMARK':
      handleDeleteBookmark(request, sendResponse);
      return true;

    case 'DELETE_BOOKMARKS_BATCH':
      handleDeleteBookmarksBatch(request, sendResponse);
      return true;

    case 'UPDATE_BOOKMARK':
      handleUpdateBookmark(request, sendResponse);
      return true;

    case 'REGENERATE_SUMMARY':
      handleRegenerateSummary(request, sendResponse);
      return true;

    case 'MOVE_BOOKMARK':
      handleMoveBookmark(request, sendResponse);
      return true;

    case 'DELETE_FOLDER':
      handleDeleteFolder(request, sendResponse);
      return true;

    case 'BATCH_DELETE':
      handleBatchDelete(request, sendResponse);
      return true;

    case 'MERGE_FOLDERS':
      handleMergeFolders(request, sendResponse);
      return true;

    case 'CREATE_CATEGORY':
      handleCreateCategory(request, sendResponse);
      return true;

    case 'UPDATE_CATEGORY':
      handleUpdateCategory(request, sendResponse);
      return true;

    case 'IMPORT_BOOKMARKS':
      handleImportBookmarks(request, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

/**
 * 处理 content script 采集的页面信息，写入对应 bookmark 的 description 和 favicon
 */
async function handlePageInfoCollected(request, sender) {
  try {
    const { data } = request;
    if (!data || !data.url) return;

    await initDatabase();

    // 通过 URL 查找对应的 bookmark
    const allBookmarks = await getAllBookmarks();
    const bookmark = allBookmarks.find(bm => bm.url === data.url);

    if (bookmark) {
      let updated = false;

      if (data.description && !bookmark.description) {
        bookmark.description = data.description.slice(0, 300);
        updated = true;
      }
      if (data.favicon && !bookmark.favicon) {
        bookmark.favicon = data.favicon;
        updated = true;
      }

      if (updated) {
        bookmark.updatedAt = Date.now();
        await addBookmark(bookmark);
        console.log(`[PageInfo] 已保存页面信息: ${data.url.slice(0, 60)}`);
      }
    }
  } catch (error) {
    console.debug('[PageInfo] 保存失败:', error.message);
  }
}

/**
 * 获取收藏数据
 */
async function handleGetBookmarks(request, sendResponse) {
  try {
    const database = await initDatabase();
    const bookmarks = await getAllBookmarks();
    const categories = await getAllCategories();
    const tags = await getAllTags();

    sendResponse({
      bookmarks,
      categories,
      tags
    });
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 获取分类数据
 */
async function handleGetCategories(request, sendResponse) {
  try {
    await initDatabase();
    const categories = await getAllCategories();
    sendResponse({ categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 同步到浏览器收藏
 */
async function handleSyncBookmarks(request, sendResponse) {
  try {
    // TODO: 将本地数据同步到浏览器 bookmarks API
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * 检测失效链接
 */
async function handleCheckBrokenLinks(request, sendResponse) {
  try {
    // 防止重复启动：已有检测在运行时直接返回
    if (currentCheckCancelToken !== null) {
      sendResponse({ success: false, alreadyRunning: true });
      return;
    }

    await initDatabase();

    const allBookmarks = await getAllBookmarks();

    if (allBookmarks.length === 0) {
      sendResponse({ success: true, total: 0, brokenCount: 0, brokenLinks: [] });
      return;
    }

    // ── 断点续检逻辑 ──────────────────────────────────────────────────────────
    // 读取上次中断的会话（若存在）
    const { checkSession } = await chrome.storage.local.get('checkSession');
    let sessionStart;

    if (request.resume && checkSession && checkSession.startTime) {
      // 续检模式：只检测 lastChecked < sessionStart 的书签（即本次会话尚未检测的）
      sessionStart = checkSession.startTime;
    } else {
      // 全新检测：记录新会话起始时间
      sessionStart = Date.now();
      await chrome.storage.local.set({
        checkSession: { startTime: sessionStart, total: allBookmarks.length, cancelled: false }
      });
    }

    // 过滤出本次需要检测的书签
    const bookmarks = allBookmarks.filter(
      b => !b.lastChecked || b.lastChecked < sessionStart
    );

    const skippedCount = allBookmarks.length - bookmarks.length;
    // ─────────────────────────────────────────────────────────────────────────

    if (bookmarks.length === 0) {
      // 全部都已检测过
      await chrome.storage.local.remove('checkSession');
      const brokenLinks = allBookmarks
        .filter(b => b.status === 'broken')
        .map(b => ({ bookmarkId: b.id, url: b.url, title: b.title,
          error: b.checkError, statusCode: b.checkStatusCode, checkStatus: b.checkStatus }));
      sendResponse({ success: true, cancelled: false, total: allBookmarks.length,
        skippedCount, brokenCount: brokenLinks.length, movedCount: 0, brokenLinks });
      return;
    }

    // 创建取消令牌，支持用户中止
    currentCheckCancelToken = { cancelled: false };

    const options = {
      concurrency: request.concurrency || 10,
      timeout:     request.timeout     || 6000,
      delay:       request.delay       || 0,
      retries:     1,
      cancelToken: currentCheckCancelToken,
      onProgress: (completed, total, brokenBookmarkCount) => {
        const progressData = {
          completed: completed + skippedCount,
          total: allBookmarks.length,
          brokenCount: brokenBookmarkCount,
          percentage: Math.round(((completed + skippedCount) / allBookmarks.length) * 100),
          startTime: sessionStart   // 供 popup 恢复时计算 ETA
        };
        currentCheckProgress = progressData;
        chrome.runtime.sendMessage({
          type: 'CHECK_PROGRESS',
          data: progressData
        }).catch(() => { /* popup 可能已关闭 */ });
      },
      // 增量保存：每条书签检测完立即写入 DB
      onItemChecked: async (bookmark) => {
        await addBookmark(bookmark);
      }
    };

    await checkBookmarks(bookmarks, options);

    const cancelled = currentCheckCancelToken.cancelled;
    currentCheckCancelToken = null;
    currentCheckProgress = null;

    // ── 清理已恢复的书签：从“待清理”移回无分类 ────────────────────────────────
    const allCategories = await getAllCategories();
    const pendingCat = allCategories.find(c => c.name === '待清理');
    if (pendingCat) {
      for (const b of allBookmarks) {
        if (b.status !== 'broken' && b.categoryId === pendingCat.id) {
          b.categoryId = null;   // 移回无分类
          await addBookmark(b);  // 写回 DB
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 从全量书签中统计失效（包含本次跳过的已知失效书签）
    const brokenLinks = allBookmarks
      .filter(b => b.status === 'broken')
      .map(b => ({
        bookmarkId: b.id,
        url: b.url,
        title: b.title,
        error: b.checkError,
        statusCode: b.checkStatusCode,
        checkStatus: b.checkStatus
      }));

    // WAF/反爬拦截的不确定链接数
    const uncertainCount = allBookmarks.filter(b => b.checkStatus === 'uncertain').length;

    // 广播检测结束，供重新打开的 popup 实例更新 UI
    chrome.runtime.sendMessage({
      type: 'CHECK_DONE',
      data: { cancelled, total: allBookmarks.length, skippedCount, brokenCount: brokenLinks.length, uncertainCount }
    }).catch(() => {});

    if (cancelled) {
      // 记录会话为已中断，保留 sessionStart 供下次续检
      await chrome.storage.local.set({
        checkSession: { startTime: sessionStart, total: allBookmarks.length, cancelled: true }
      });
    } else {
      // 正常完成，清除会话
      await chrome.storage.local.remove('checkSession');
    }

    // 将失效链接移至"待清理"分类
    const movedCount = await batchMoveToPendingCleanup(brokenLinks);

    sendResponse({
      success: true,
      cancelled,
      total: allBookmarks.length,
      skippedCount,
      brokenCount: brokenLinks.length,
      uncertainCount,
      movedCount,
      brokenLinks
    });

  } catch (error) {
    currentCheckCancelToken = null;
    console.error('Failed to check broken links:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * AI 分析收藏（支持断点续分析、逐批缓存、取消）
 */
async function handleAIAnalyze(request, sendResponse) {
  // 防止重复启动
  if (currentAnalysisCancelToken !== null) {
    sendResponse({ error: '分析正在进行中，请稍候' });
    return;
  }

  try {
    const { bookmarkIds, forceRestart } = request;

    await initDatabase();

    const allBookmarks = await getAllBookmarks();
    const bookmarksToAnalyze = bookmarkIds?.length > 0
      ? allBookmarks.filter(bm => bookmarkIds.includes(bm.id))
      : allBookmarks;

    if (bookmarksToAnalyze.length === 0) {
      sendResponse({ error: '没有可分析的收藏' });
      return;
    }

    const categories = await getAllCategories();
    // 获取所有用户分类（完整对象，包含id、name、parentId等信息）
    console.log(`[AI分析] 用户现有分类 (${categories.length}个): ${categories.map(c => c.name).join(', ')}`);

    // 统计未分类书签
    const uncategorizedCount = bookmarksToAnalyze.filter(bm => !bm.categoryId).length;
    console.log(`[AI分析] 待分析书签总数: ${bookmarksToAnalyze.length}，未分类: ${uncategorizedCount}`);

    const configResult = await chrome.storage.local.get('aiConfig');
    const aiConfig = configResult.aiConfig;

    if (!aiConfig?.apiUrl || !aiConfig?.apiKey || !aiConfig?.model) {
      sendResponse({ error: '请先在设置中配置 AI API' });
      return;
    }

    // 验证通过后立即响应，避免长时间任务导致消息通道关闭（MV3 Service Worker 限制）
    sendResponse({ started: true });

    // 创建取消令牌（在开始分析前创建，确保后续操作可以取消）
    currentAnalysisCancelToken = { cancelled: false };

    // 验证通过后立即响应，避免长时间任务导致消息通道关闭（MV3 Service Worker 限制）
    sendResponse({ started: true });

    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(bookmarksToAnalyze.length / BATCH_SIZE);
    const sessionBookmarkIds = bookmarksToAnalyze.map(b => b.id);

    // ── 断点续分析：检查是否有未完成的会话 ──────────────────────────────────────
    const { analysisSession } = await chrome.storage.local.get('analysisSession');
    let startBatchIndex = 0;
    let cachedBatches = [];

    if (!forceRestart && analysisSession && !analysisSession.completed) {
      const storedIds = [...(analysisSession.bookmarkIds || [])].sort().join(',');
      const currentIds = [...sessionBookmarkIds].sort().join(',');
      const completedCount = analysisSession.completedBatches?.length ?? 0;
      if (storedIds === currentIds && completedCount > 0) {
        startBatchIndex = completedCount;
        cachedBatches = analysisSession.completedBatches;
        console.log(`[AI] 续分析：从第 ${startBatchIndex + 1}/${totalBatches} 批开始`);
      }
    }

    // 新建或重置会话
    if (startBatchIndex === 0) {
      await chrome.storage.local.set({
        analysisSession: {
          startTime: Date.now(),
          bookmarkIds: sessionBookmarkIds,
          totalBatches,
          batchSize: BATCH_SIZE,
          completedBatches: [],
          completed: false
        }
      });
      cachedBatches = [];
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 通知 popup 开始提取摘要
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_PROGRESS',
      data: { current: startBatchIndex, total: totalBatches, message: '正在提取页面摘要...' }
    }).catch(() => {});

    const summaryMap = await batchExtractSummaries(bookmarksToAnalyze);
    const enrichedBookmarks = enrichBookmarks(bookmarksToAnalyze, summaryMap);
    console.log(`[AI] 摘要提取: ${summaryMap.size}/${bookmarksToAnalyze.length} 成功`);

    // 将新采集到的摘要描述持久化到 IndexedDB（仅补填空白字段，不覆盖已有数据）
    if (summaryMap.size > 0) {
      const updateTasks = [];
      for (const bm of bookmarksToAnalyze) {
        const summary = summaryMap.get(bm.id);
        if (!summary) continue;
        const needsUpdate = (!bm.description && summary.description);
        if (needsUpdate) {
          const updated = { ...bm };
          if (!bm.description && summary.description) {
            updated.description = summary.description.slice(0, 300);
          }
          updated.updatedAt = Date.now();
          updateTasks.push(addBookmark(updated));
        }
      }
      if (updateTasks.length > 0) {
        await Promise.all(updateTasks);
        console.log(`[AI] 已将 ${updateTasks.length} 条摘要描述写入 IndexedDB`);
      }
    }

    const analysisResult = await analyzeBookmarks(
      aiConfig,
      enrichedBookmarks,
      categories,  // 传递完整的分类对象数组（包含id、name、parentId）
      {
        batchSize: BATCH_SIZE,
        cancelToken: currentAnalysisCancelToken,
        startBatchIndex,
        cachedBatches,
        onProgress: (current, total, message) => {
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_PROGRESS',
            data: { current, total, message }
          }).catch(() => {});
        },
        onBatchComplete: async (batchIndex, batchLog) => {
          // 持久化轻量缓存（只存恢复所需字段，不存完整请求报文）
          const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
          if (sess && !sess.completed) {
            sess.completedBatches.push({
              batchIndex,
              categories: batchLog.categories,
              tags: batchLog.tags,
              usage: batchLog.usage
            });
            await chrome.storage.local.set({ analysisSession: sess });
          }
          // 广播批次摘要到 popup（不持久化完整报文）
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_BATCH_DONE',
            data: {
              batchIndex,
              totalBatches,
              categoriesCount: batchLog.categories.length,
              tagsCount: batchLog.tags.length,
              usage: batchLog.usage,
              warnings: batchLog.warnings,
              duration: batchLog.duration,
              fromCache: batchLog.fromCache
            }
          }).catch(() => {});
        }
      }
    );

    // 正常完成：清除会话缓存，广播结果给 popup
    await chrome.storage.local.remove('analysisSession');
    currentAnalysisCancelToken = null;

    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: { result: analysisResult }
    }).catch(() => {});

  } catch (error) {
    if (currentAnalysisCancelToken?.cancelled) {
      // 标记会话已取消（保留 completedBatches 供下次续分析）
      try {
        const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
        if (sess) {
          sess.cancelled = true;
          await chrome.storage.local.set({ analysisSession: sess });
        }
      } catch (_) {}
      // 清理 token，允许重新启动
      currentAnalysisCancelToken = null;
      chrome.runtime.sendMessage({ type: 'ANALYSIS_CANCELLED' }).catch(() => {});
    } else {
      // 非取消错误（网络中断、关机等）：保留已完成批次，用户下次可续分析
      try {
        const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
        if (sess && !sess.completed) {
          sess.lastError = error.message;
          await chrome.storage.local.set({ analysisSession: sess });
        }
      } catch (_) {}
      console.error('AI analysis failed:', error);
      chrome.runtime.sendMessage({
        type: 'ANALYSIS_FAILED',
        data: { error: error.message }
      }).catch(() => {});
    }
  } finally {
    // 确保取消令牌总是被清理（无论成功、失败还是取消）
    currentAnalysisCancelToken = null;
  }
}

/**
 * AI 调试分析（少量书签，记录完整报文）
 */
async function handleAIAnalyzeDebug(request, sendResponse) {
  try {
    const { bookmarkIds } = request;

    await initDatabase();

    // 获取指定的收藏
    const allBookmarks = await getAllBookmarks();
    const bookmarksToAnalyze = allBookmarks.filter(bm => bookmarkIds.includes(bm.id));

    if (bookmarksToAnalyze.length === 0) {
      sendResponse({ error: '没有可分析的收藏' });
      return;
    }

    // 获取现有分类作为参考
    const categories = await getAllCategories();
    // 获取所有用户分类（完整对象，包含id、name、parentId等信息）
    console.log(`[AI Debug] 用户现有分类 (${categories.length}个): ${categories.map(c => c.name).join(', ')}`);

    // 获取 AI 配置
    const configResult = await chrome.storage.local.get('aiConfig');
    const aiConfig = configResult.aiConfig;

    if (!aiConfig || !aiConfig.apiUrl || !aiConfig.apiKey || !aiConfig.model) {
      sendResponse({ error: '请先在设置中配置 AI API' });
      return;
    }

    // 提取页面摘要信息
    console.log('[AI Debug] 正在提取页面摘要...');
    const summaryMap = await batchExtractSummaries(bookmarksToAnalyze);
    const enrichedBookmarks = enrichBookmarks(bookmarksToAnalyze, summaryMap);
    console.log(`[AI Debug] 摘要提取完成: ${summaryMap.size}/${bookmarksToAnalyze.length}`);

    // 调用 Debug 分析
    const debugLog = await analyzeBookmarksDebug(
      aiConfig,
      enrichedBookmarks,
      categories  // 传递完整的分类对象数组
    );

    // 在 debugLog 中记录摘要提取结果
    debugLog.summaryExtraction = {
      total: bookmarksToAnalyze.length,
      success: summaryMap.size,
      details: Object.fromEntries(summaryMap)
    };

    sendResponse({ result: debugLog });
  } catch (error) {
    console.error('AI debug analysis failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 应用分类建议
 */
async function handleApplyCategories(request, sendResponse) {
  try {
    const { categories, tags = [] } = request;

    await initDatabase();

    // 获取浏览器书签栏根目录ID（用于新建分类的父目录）
    const getBookmarksBarId = async () => {
      const tree = await chrome.bookmarks.getTree();

      // 🔒 安全的查找逻辑：只找根节点下的"书签栏"
      function findBookmarksBar(nodes) {
        for (const node of nodes) {
          // Chrome的根节点ID是'0'（虚拟节点），书签栏的parentId应该是'0'
          // 注意：parentId可能是'0'（字符串）或 undefined（某些情况下）
          const isRootFolder = !node.parentId || node.parentId === '0' || node.parentId === 0;
          const isBookmarksBar = (node.title === '书签栏' || node.title === 'Bookmarks Bar' || node.title === 'Bookmarks');

          if (isRootFolder && isBookmarksBar) {
            console.log(`[应用分类] 找到书签栏根节点: ${node.title} (ID: ${node.id}, parentId: ${node.parentId})`);
            return node.id;
          }

          // 递归搜索子节点
          if (node.children) {
            const found = findBookmarksBar(node.children);
            if (found) return found;
          }
        }
        return null;
      }

      const barId = findBookmarksBar(tree);

      if (!barId) {
        console.error('[应用分类] ❌ 无法找到"书签栏"根目录！将使用根节点的第一个子节点。');
        // 降级方案：使用根节点的第一个子节点
        const rootChildren = tree[0].children;
        if (rootChildren && rootChildren.length > 0) {
          const fallbackId = rootChildren[0].id;
          console.warn(`[应用分类] ⚠️ 降级使用: ${rootChildren[0].title} (ID: ${fallbackId})`);
          return fallbackId;
        }
      }

      return barId;
    };

    const bookmarksBarId = await getBookmarksBarId();
    console.log(`[应用分类] 书签栏根目录ID: ${bookmarksBarId}`);

    // 🔍 验证 bookarksBarId 是否有效
    try {
      const barNode = await chrome.bookmarks.get(bookmarksBarId);
      console.log(`[应用分类] 书签栏节点信息:`, {
        id: barNode[0].id,
        title: barNode[0].title,
        parentId: barNode[0].parentId,
        index: barNode[0].index
      });

      // 验证父节点是否为根（parentId应该是'0'、0、undefined或null）
      const parentId = barNode[0].parentId;
      const isValidRoot = (!parentId || parentId === '0' || parentId === 0);

      if (!isValidRoot) {
        console.error(`[应用分类] ❌ 书签栏的parentId无效！parentId: ${parentId} (应该是'0'、0、undefined或null)`);
        console.error(`[应用分类] 这会导致文件夹被创建到错误位置！`);
      } else {
        console.log(`[应用分类] ✅ 书签栏节点验证通过，parentId: ${parentId} (这是Chrome虚拟根节点)`);
      }
    } catch (error) {
      console.error(`[应用分类] ❌ 无法获取书签栏节点信息:`, error);
    }

    // 创建新分类（同时在浏览器收藏夹和IndexedDB中创建）
    for (const cat of categories) {
      let categoryRecord = null;
      let browserFolderId = null;

      // 🔒 分类名称规范化验证
      const trimmedName = cat.name.trim();
      if (trimmedName === '') {
        console.error(`[应用分类] ❌ 分类名称为空，跳过: "${cat.name}"`);
        continue;
      }

      if (trimmedName !== cat.name) {
        console.warn(`[应用分类] ⚠️ 分类名称包含空格，已规范化: "${cat.name}" → "${trimmedName}"`);
        cat.name = trimmedName;
      }

      // 🔒 检查分类名称中的斜杠数量
      const slashCount = (cat.name.match(/\//g) || []).length;
      if (slashCount > 2) {
        console.error(`[应用分类] ❌ 分类名称包含过多斜杠（${slashCount}个）: ${cat.name}`);
        console.error(`[应用分类] 这可能创建过深的层级结构！跳过此分类。`);
        continue;
      }

      // 🔒 安全检查：禁止创建带浏览器根目录前缀的分类
      const ROOT_FOLDER_PREFIXES = ['书签栏/', '其他书签/', 'Bookmarks Bar/', 'Other Bookmarks/'];
      const hasInvalidPrefix = ROOT_FOLDER_PREFIXES.some(prefix => cat.name.startsWith(prefix));

      if (hasInvalidPrefix) {
        console.error(`[应用分类] ❌ 拒绝创建无效分类（包含根目录前缀）: ${cat.name}`);
        console.error(`[应用分类] 这会创建一级目录，违反浏览器兼容要求！跳过此分类。`);
        continue; // 跳过这个分类
      }

      // 🔒 额外检查：禁止与浏览器根目录同名
      const ROOT_FOLDER_NAMES = new Set(['书签栏', '其他书签', 'Bookmarks Bar', 'Other Bookmarks', 'Bookmarks']);
      if (ROOT_FOLDER_NAMES.has(cat.name)) {
        console.error(`[应用分类] ❌ 分类名称与浏览器根目录同名: ${cat.name}`);
        console.error(`[应用分类] 这会造成混乱！跳过此分类。`);
        continue;
      }

      if (cat.isNew) {
        // 检查分类是否已存在（通过名称查找）
        const allCategories = await getAllCategories();
        const existing = allCategories.find(c => c.name === cat.name);

        if (!existing) {
          // 1. 先在浏览器收藏夹中创建文件夹，获取真实的浏览器ID
          try {
            console.log(`[应用分类] 开始创建分类: ${cat.name}`);

            // 处理层级结构（例如："技术/前端"）
            const folderNameParts = cat.name.split('/');
            let currentParentId = bookmarksBarId;
            let parentCategoryId = null; // 用于 IndexedDB 的父分类 ID

            // 从第一层开始，逐层检查和创建
            for (let i = 0; i < folderNameParts.length; i++) {
              const partName = folderNameParts[i];
              const isLast = i === folderNameParts.length - 1;

              // 检查当前层级下是否有该名称的文件夹
              const children = await chrome.bookmarks.getChildren(currentParentId);
              const existingChild = children.find(child => child.title === partName);

              if (existingChild) {
                // 文件夹已存在，直接使用
                currentParentId = existingChild.id;
                console.log(`[应用分类] 复用现有文件夹: ${partName}, 浏览器ID: ${currentParentId}`);

                // 如果不是最后一层，需要找到或创建父分类记录
                if (!isLast) {
                  const parentCat = allCategories.find(c => c.name === folderNameParts.slice(0, i + 1).join('/'));
                  if (parentCat) {
                    parentCategoryId = parentCat.id;
                  } else {
                    // 创建父分类记录（中间层级）
                    const intermediateCatId = `cat_${currentParentId}`;
                    const intermediateCat = {
                      id: intermediateCatId,
                      name: folderNameParts.slice(0, i + 1).join('/'),
                      parentId: parentCategoryId,
                      createdAt: Date.now()
                    };
                    await addCategory(intermediateCat);
                    parentCategoryId = intermediateCatId;
                    allCategories.push(intermediateCat);
                    console.log(`[应用分类] 创建中间分类: ${intermediateCat.name}, ID: ${intermediateCatId}`);
                  }
                }
              } else {
                // 文件夹不存在，创建

                // 🔒 安全验证：确保父ID有效
                if (!currentParentId) {
                  console.error(`[应用分类] ❌ currentParentId为空，无法创建文件夹: ${partName}`);
                  console.error(`[应用分类] 跳过此分类，避免创建到错误位置`);
                  continue; // 跳过整个分类
                }

                // 🔒 额外验证：确认父ID确实指向"书签栏"下的节点
                try {
                  const parentNode = await chrome.bookmarks.get(currentParentId);
                  if (!parentNode || parentNode.length === 0) {
                    console.error(`[应用分类] ❌ 父节点无效: ${currentParentId}`);
                    continue;
                  }

                  // 验证父节点是否在"书签栏"下（或就是"书签栏"本身）
                  const parentInfo = parentNode[0];

                  // 判断是否在书签栏下：
                  // 1. 父节点就是书签栏本身（title匹配）
                  // 2. 父节点的parentId等于bookmarksBarId（在书签栏下）
                  // 3. 父节点的parentId是'0'或0（在根节点下，且bookmarksBarId就是'1'等根节点ID）
                  const isDirectChildOfRoot = (parentInfo.parentId === '0' || parentInfo.parentId === 0);
                  const isBookmarksBar = (parentInfo.title === '书签栏' || parentInfo.title === 'Bookmarks Bar' || parentInfo.title === 'Bookmarks');
                  const isUnderBookmarksBar = (isBookmarksBar ||
                                               parentInfo.parentId === bookmarksBarId ||
                                               isDirectChildOfRoot);

                  if (!isUnderBookmarksBar) {
                    console.error(`[应用分类] ❌ 父节点不在书签栏下！`);
                    console.error(`[应用分类] 父节点: ${parentInfo.title} (ID: ${parentInfo.id}, parentId: ${parentInfo.parentId})`);
                    console.error(`[应用分类] 书签栏ID: ${bookmarksBarId}`);
                    console.error(`[应用分类] 拒绝创建文件夹，避免创建到错误位置！`);
                    continue;
                  }

                  console.log(`[应用分类] ✅ 验证通过：在"${parentInfo.title}"下创建"${partName}"`);
                } catch (verifyError) {
                  console.error(`[应用分类] ❌ 验证父节点时出错:`, verifyError);
                  continue;
                }

                const newFolder = await chrome.bookmarks.create({
                  parentId: currentParentId,
                  title: partName
                });

                // 🔒 创建后再次验证
                if (newFolder.parentId !== currentParentId) {
                  console.error(`[应用分类] ❌ 创建的文件夹父ID不匹配！`);
                  console.error(`[应用分类] 期望: ${currentParentId}, 实际: ${newFolder.parentId}`);
                }

                currentParentId = newFolder.id;
                console.log(`[应用分类] 创建浏览器文件夹: ${partName}, 浏览器ID: ${newFolder.id}, 父ID: ${newFolder.parentId}`);

                // 如果不是最后一层，创建中间分类记录
                if (!isLast) {
                  const intermediateCatId = `cat_${newFolder.id}`;
                  const intermediateCat = {
                    id: intermediateCatId,
                    name: folderNameParts.slice(0, i + 1).join('/'),
                    parentId: parentCategoryId,
                    createdAt: Date.now()
                  };
                  await addCategory(intermediateCat);
                  parentCategoryId = intermediateCatId;
                  allCategories.push(intermediateCat);
                  console.log(`[应用分类] 创建中间分类: ${intermediateCat.name}, ID: ${intermediateCatId}`);
                }
              }

              // 如果是最后一层，这就是最终文件夹 ID
              if (isLast) {
                browserFolderId = currentParentId;
                console.log(`[应用分类] 最终文件夹: ${cat.name}, 浏览器ID: ${browserFolderId}`);
              }
            }

            // 2. 在IndexedDB中保存最终分类（使用浏览器ID构建分类ID）
            categoryRecord = {
              id: `cat_${browserFolderId}`,  // ✅ 使用浏览器ID
              name: cat.name,
              parentId: parentCategoryId,  // ✅ 保留层级关系
              createdAt: Date.now()
            };
            await addCategory(categoryRecord);
            console.log(`[应用分类] 创建最终分类: ${cat.name}, ID: ${categoryRecord.id}, parentId: ${parentCategoryId}`);
          } catch (error) {
            console.error(`[应用分类] 创建浏览器文件夹失败: ${cat.name}`, error);
          }
        } else {
          categoryRecord = existing;
          // 从分类ID中提取浏览器ID
          browserFolderId = existing.id.replace('cat_', '');

          // 🔒 验证现有分类的位置是否正确
          try {
            const folderNode = await chrome.bookmarks.get(browserFolderId);
            if (folderNode && folderNode.length > 0) {
              const node = folderNode[0];
              console.log(`[应用分类] 使用现有分类: ${cat.name}, 浏览器ID: ${browserFolderId}, 父ID: ${node.parentId}`);

              // 验证是否在"书签栏"下
              const isValidLocation = (node.parentId === bookmarksBarId ||
                                      node.title === '书签栏' ||
                                      node.title === 'Bookmarks Bar' ||
                                      node.title === 'Bookmarks');

              if (!isValidLocation) {
                console.warn(`[应用分类] ⚠️ 现有分类 ${cat.name} 不在书签栏下！`);
                console.warn(`[应用分类] 分类位置: ${node.title} (父ID: ${node.parentId})`);
                console.warn(`[应用分类] 书签栏ID: ${bookmarksBarId}`);
                console.warn(`[应用分类] 这可能导致书签被移动到错误位置！`);
                // 注意：这里不跳过，因为用户可能确实想使用这个分类
                // 但会记录警告日志
              }
            }
          } catch (error) {
            console.error(`[应用分类] ❌ 无法验证现有分类位置: ${cat.name}`, error);
          }
        }
      } else {
        // 使用现有分类
        const allCategories = await getAllCategories();
        categoryRecord = allCategories.find(c => c.name === cat.name);
        if (categoryRecord) {
          browserFolderId = categoryRecord.id.replace('cat_', '');
          console.log(`[应用分类] 使用已存在分类: ${cat.name}, 浏览器ID: ${browserFolderId}`);
        }
      }

      // 更新收藏的分类，并移动到浏览器文件夹
      for (const bookmarkId of cat.bookmarkIds) {
        const bookmark = await getBookmark(bookmarkId);
        if (bookmark) {
          // 1. 更新 IndexedDB 中的 categoryId（使用实际分类ID，不是分类名）
          bookmark.categoryId = categoryRecord.id;  // ✅ 修复：使用 categoryRecord.id
          bookmark.updatedAt = Date.now();
          await addBookmark(bookmark);

          // 2. 如果有浏览器文件夹ID，移动书签到该文件夹
          if (browserFolderId && bookmark.browserId) {
            try {
              await chrome.bookmarks.move(bookmark.browserId, {
                parentId: browserFolderId
              });
              console.log(`[应用分类] 移动书签到分类: ${bookmark.title} -> ${cat.name} (文件夹ID: ${browserFolderId})`);
            } catch (error) {
              console.error(`[应用分类] 移动书签失败: ${bookmark.title}`, error);
            }
          }
        }
      }
    }

    // 保存标签
    // 注意：AI返回的tags格式是 [{ name, bookmarkId }]，需要聚合为 [{ name, bookmarkIds }]
    console.log(`[应用分类] 开始保存 ${tags.length} 个标签...`);

    // 聚合相同标签名的bookmarkId
    const tagMap = new Map();
    for (const tag of tags) {
      const tagName = tag.name;
      const bookmarkId = tag.bookmarkId;

      if (!bookmarkId) continue;

      if (!tagMap.has(tagName)) {
        tagMap.set(tagName, new Set());
      }
      tagMap.get(tagName).add(bookmarkId);
    }

    // 批量保存标签
    for (const [tagName, bookmarkIdSet] of tagMap.entries()) {
      const bookmarkIds = Array.from(bookmarkIdSet);

      // 检查标签是否已存在
      const existing = await get(STORES.TAGS, `tag_${tagName}`);

      if (!existing) {
        // 创建新标签
        await addTag({
          id: `tag_${tagName}`,
          name: tagName,
          bookmarkIds: bookmarkIds,
          createdAt: Date.now()
        });
        console.log(`[应用分类] 创建新标签: ${tagName}, 书签数: ${bookmarkIds.length}`);
      } else {
        // 合并书签到已有标签
        const mergedBookmarkIds = [...new Set([...existing.bookmarkIds, ...bookmarkIds])];
        existing.bookmarkIds = mergedBookmarkIds;
        existing.updatedAt = Date.now();
        await addTag(existing);
        console.log(`[应用分类] 更新已有标签: ${tagName}, 书签数: ${mergedBookmarkIds.length}`);
      }

      // 同时更新书签的 tags 字段（用于标签视图显示）
      for (const bookmarkId of bookmarkIds) {
        const bookmark = await getBookmark(bookmarkId);
        if (bookmark) {
          // 确保 tags 字段存在
          if (!bookmark.tags) bookmark.tags = [];
          // 如果标签还没有添加到书签，则添加
          if (!bookmark.tags.includes(tagName)) {
            bookmark.tags.push(tagName);
            bookmark.updatedAt = Date.now();
            await addBookmark(bookmark);
          }
        }
      }
    }

    console.log(`[应用分类] 完成！创建了 ${categories.length} 个分类，${tags.length} 个标签`);

    // 清理空的旧分类
    console.log(`[应用分类] 开始清理空的旧分类...`);
    const allCategories = await getAllCategories();
    const allBookmarks = await getAllBookmarks();

    // 找出所有有书签的分类ID
    const usedCategoryIds = new Set(allBookmarks.map(bm => bm.categoryId).filter(id => id));

    // 找出空的分类（没有书签的分类）
    const emptyCategories = allCategories.filter(cat =>
      !usedCategoryIds.has(cat.id) &&
      !cat.name.includes('书签栏') &&  // 保留系统分类
      !cat.name.includes('其他书签') &&
      cat.name !== 'Test' &&
      cat.name !== '已导入'
    );

    if (emptyCategories.length > 0) {
      console.log(`[应用分类] 发现 ${emptyCategories.length} 个空分类，准备删除...`);

      for (const emptyCat of emptyCategories) {
        try {
          // 删除浏览器文件夹
          const browserFolderId = emptyCat.id.replace('cat_', '');
          if (browserFolderId && browserFolderId !== emptyCat.id) {
            try {
              await chrome.bookmarks.removeTree(browserFolderId);
              console.log(`[应用分类] 删除浏览器文件夹: ${emptyCat.name} (${browserFolderId})`);
            } catch (err) {
              console.log(`[应用分类] 浏览器文件夹不存在或已删除: ${emptyCat.name}`);
            }
          }

          // 删除IndexedDB记录
          await deleteCategory(emptyCat.id);
          console.log(`[应用分类] 删除分类记录: ${emptyCat.name} (${emptyCat.id})`);
        } catch (error) {
          console.error(`[应用分类] 删除分类失败: ${emptyCat.name}`, error);
        }
      }

      console.log(`[应用分类] 清理完成，删除了 ${emptyCategories.length} 个空分类`);
    } else {
      console.log(`[应用分类] 没有发现空分类`);
    }

    // 返回所有分类（包括中间层级的分类）
    const finalCategories = await getAllCategories();
    console.log(`[应用分类] 返回所有分类数量: ${finalCategories.length}`);

    sendResponse({
      success: true,
      categories: allCategories,  // 返回所有分类，包括中间层级
      tags: tags
    });
  } catch (error) {
    console.error('Failed to apply categories:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 从浏览器导入收藏
 */
async function handleImportFromBrowser(request, sendResponse) {
  try {
    console.log('[IMPORT] Starting import from browser...');
    await initDatabase();
    console.log('[IMPORT] Database initialized');

    // 执行导入
    await importBrowserBookmarks();
    console.log('[IMPORT] importBrowserBookmarks completed');

    // 获取导入后的收藏数量
    const bookmarks = await getAllBookmarks();
    const categories = await getAllCategories();

    console.log(`[IMPORT] Total bookmarks in DB: ${bookmarks.length}, Total categories: ${categories.length}`);

    sendResponse({
      success: true,
      imported: bookmarks.length,
      categories: categories.length,
      message: `成功导入 ${bookmarks.length} 个收藏和 ${categories.length} 个分类`
    });
  } catch (error) {
    console.error('[IMPORT] Failed to import from browser:', error);
    console.error('[IMPORT] Error stack:', error.stack);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 清空所有数据
 */
async function handleClearData(request, sendResponse) {
  try {
    console.log('[CLEAR] Starting data clear...');
    await initDatabase();
    await clearAllData();
    console.log('[CLEAR] All data cleared');

    sendResponse({
      success: true,
      message: '数据已清空'
    });
  } catch (error) {
    console.error('[CLEAR] Failed to clear data:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 删除单个书签
 */
async function handleDeleteBookmark(request, sendResponse) {
  try {
    const { bookmarkId } = request;
    console.log(`[DELETE] Deleting bookmark: ${bookmarkId}`);

    await initDatabase();

    // 获取书签信息
    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) {
      sendResponse({
        success: false,
        error: '书签不存在'
      });
      return;
    }

    // 从 IndexedDB 删除
    await deleteBookmark(bookmarkId);
    console.log(`[DELETE] Deleted from IndexedDB: ${bookmarkId}`);

    // 从浏览器收藏夹删除（如果存在对应的浏览器书签）
    try {
      // 检查书签 ID 是否为数字（浏览器书签 ID 是数字）
      if (/^\d+$/.test(bookmarkId)) {
        await chrome.bookmarks.remove(bookmarkId);
        console.log(`[DELETE] Deleted from browser bookmarks: ${bookmarkId}`);
      } else if (bookmark.url) {
        // 如果 ID 不是纯数字，尝试通过 URL 查找并删除浏览器书签（使用规范化 URL）
        const normalizedUrl = normalizeUrl(bookmark.url);
        const allBrowserBookmarks = await chrome.bookmarks.getTree();
        const allBrowserBookmarksList = flattenBookmarkTree(allBrowserBookmarks);

        // 查找所有 URL 匹配的浏览器书签并删除
        const matchingBookmarks = allBrowserBookmarksList.filter(bm => normalizeUrl(bm.url) === normalizedUrl);
        for (const bm of matchingBookmarks) {
          await chrome.bookmarks.remove(bm.id);
          console.log(`[DELETE] Deleted from browser bookmarks by URL: ${bm.id} (${normalizedUrl})`);
        }

        if (matchingBookmarks.length === 0) {
          console.log(`[DELETE] No matching browser bookmarks found for URL: ${normalizedUrl}`);
        }
      }
    } catch (browserError) {
      // 浏览器书签可能已被手动删除，忽略错误
      console.debug(`[DELETE] Browser bookmark already removed or not found: ${browserError.message}`);
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('deleted', bookmarkId);

    sendResponse({
      success: true,
      message: '书签已删除'
    });
  } catch (error) {
    console.error('[DELETE] Failed to delete bookmark:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 批量删除书签
 */
async function handleDeleteBookmarksBatch(request, sendResponse) {
  try {
    const { bookmarkIds } = request;
    console.log(`[DELETE_BATCH] Deleting ${bookmarkIds.length} bookmarks`);

    await initDatabase();

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const bookmarkId of bookmarkIds) {
      try {
        // 获取书签信息
        const bookmark = await getBookmark(bookmarkId);
        if (!bookmark) {
          console.debug(`[DELETE_BATCH] Bookmark not found: ${bookmarkId}`);
          failedCount++;
          continue;
        }

        // 从 IndexedDB 删除
        await deleteBookmark(bookmarkId);

        // 从浏览器收藏夹删除
        try {
          if (/^\d+$/.test(bookmarkId)) {
            await chrome.bookmarks.remove(bookmarkId);
          } else if (bookmark.url) {
            // 使用规范化 URL 查找并删除浏览器书签
            const normalizedUrl = normalizeUrl(bookmark.url);
            const allBrowserBookmarks = await chrome.bookmarks.getTree();
            const allBrowserBookmarksList = flattenBookmarkTree(allBrowserBookmarks);
            const matchingBookmarks = allBrowserBookmarksList.filter(bm => normalizeUrl(bm.url) === normalizedUrl);
            for (const bm of matchingBookmarks) {
              await chrome.bookmarks.remove(bm.id);
            }
          }
        } catch (browserError) {
          console.debug(`[DELETE_BATCH] Browser bookmark error for ${bookmarkId}: ${browserError.message}`);
        }

        successCount++;
        console.log(`[DELETE_BATCH] Deleted: ${bookmarkId}`);
      } catch (error) {
        failedCount++;
        errors.push({ id: bookmarkId, error: error.message });
        console.error(`[DELETE_BATCH] Failed to delete ${bookmarkId}:`, error);
      }
    }

    console.log(`[DELETE_BATCH] Completed: ${successCount} success, ${failedCount} failed`);

    // 通知 popup 书签已变更
    notifyBookmarkChanged('batch_deleted', null);

    sendResponse({
      success: true,
      message: `成功删除 ${successCount} 个书签${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`,
      deleted: successCount,
      failed: failedCount,
      errors
    });
  } catch (error) {
    console.error('[DELETE_BATCH] Failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 更新书签
 */
async function handleUpdateBookmark(request, sendResponse) {
  try {
    const { id, data, updates } = request;
    // 兼容两种格式：data 或 updates
    const updateData = updates || data || {};
    console.log(`[UPDATE] Updating bookmark: ${id}`, updateData);

    await initDatabase();

    // 获取现有书签
    const bookmark = await getBookmark(id);
    if (!bookmark) {
      sendResponse({
        success: false,
        error: '书签不存在'
      });
      return;
    }

    // 更新字段
    const updatedBookmark = {
      ...bookmark,
      title: updateData.title || bookmark?.title || '',
      url: updateData.url !== undefined ? updateData.url : bookmark?.url || '',
      summary: updateData.summary !== undefined ? updateData.summary : bookmark?.summary || '',
      tags: updateData.tags !== undefined ? updateData.tags : bookmark?.tags || [],
      categoryId: updateData.categoryId !== undefined ? updateData.categoryId : bookmark.categoryId,
      updatedAt: Date.now()
    };

    // 保存到 IndexedDB
    await addBookmark(updatedBookmark);
    console.log(`[UPDATE] Updated in IndexedDB: ${id}`);

    // 同步到浏览器收藏夹
    try {
      // 检查书签 ID 是否为数字（浏览器书签 ID 是数字）
      if (/^\d+$/.test(id)) {
        // 更新浏览器书签
        await chrome.bookmarks.update(id, {
          title: updatedBookmark.title,
          url: updatedBookmark.url
        });
        console.log(`[UPDATE] Updated in browser bookmarks: ${id}`);
      } else {
        // 如果 ID 不是纯数字，尝试通过 URL 查找并更新浏览器书签
        const oldUrl = bookmark.url;
        const newUrl = updatedBookmark.url;

        if (oldUrl && newUrl && oldUrl !== newUrl) {
          // URL 变化了，需要查找并更新
          const browserBookmarks = await chrome.bookmarks.search({ url: oldUrl });
          for (const bm of browserBookmarks) {
            await chrome.bookmarks.update(bm.id, {
              title: updatedBookmark.title,
              url: updatedBookmark.url
            });
            console.log(`[UPDATE] Updated browser bookmark by URL: ${bm.id}`);
          }
        }
      }
    } catch (browserError) {
      // 浏览器书签可能已被手动删除，记录但不报错
      console.debug(`[UPDATE] Browser bookmark sync warning: ${browserError.message}`);
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('updated', id);

    sendResponse({
      success: true,
      message: '书签已更新',
      bookmark: updatedBookmark
    });
  } catch (error) {
    console.error('[UPDATE] Failed to update bookmark:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 重新生成单个书签的摘要
 */
async function handleRegenerateSummary(request, sendResponse) {
  try {
    const { bookmarkId } = request;
    console.log(`[REGENERATE_SUMMARY] Regenerating summary for: ${bookmarkId}`);

    await initDatabase();

    // 获取书签
    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) {
      sendResponse({
        success: false,
        error: '书签不存在'
      });
      return;
    }

    if (!bookmark.url) {
      sendResponse({
        success: false,
        error: '此书签没有 URL，无法生成摘要'
      });
      return;
    }

    // 提取单个书签的摘要
    const summaryMap = await batchExtractSummaries([bookmark]);
    const summary = summaryMap.get(bookmarkId);

    if (!summary || !summary.description) {
      sendResponse({
        success: false,
        error: '无法生成摘要，请检查网络连接'
      });
      return;
    }

    // 更新书签摘要
    bookmark.summary = summary.description;
    bookmark.updatedAt = Date.now();
    await addBookmark(bookmark);

    console.log(`[REGENERATE_SUMMARY] Summary regenerated for: ${bookmarkId}`);

    // 通知 popup 书签已变更
    notifyBookmarkChanged('updated', bookmarkId);

    sendResponse({
      success: true,
      summary: summary.description,
      message: '摘要已更新'
    });
  } catch (error) {
    console.error('[REGENERATE_SUMMARY] Failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 移动书签到不同文件夹
 */
async function handleMoveBookmark(request, sendResponse) {
  try {
    const { bookmarkId, targetFolderId } = request;
    console.log(`[MOVE] Moving bookmark ${bookmarkId} to folder ${targetFolderId}`);

    await initDatabase();

    // 获取要移动的书签
    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) {
      // 也可能是文件夹（分类）
      try {
        const category = await get(STORES.CATEGORIES, bookmarkId);
        if (!category) {
          sendResponse({
            success: false,
            error: '书签或文件夹不存在'
          });
          return;
        }
        // 移动文件夹
        await moveCategory(category, targetFolderId);
      } catch (dbError) {
        // categories object store 可能不存在，检查是否是内置特殊文件夹
        console.log('[MOVE] Category not in DB, checking special folders:', bookmarkId);
        sendResponse({
          success: false,
          error: '系统文件夹无法移动'
        });
        return;
      }
    } else {
      // 移动书签
      await moveBookmarkToFolder(bookmark, targetFolderId);
    }

    console.log(`[MOVE] Move completed: ${bookmarkId} -> ${targetFolderId}`);

    // 通知 popup 书签已变更
    notifyBookmarkChanged('moved', bookmarkId);

    sendResponse({
      success: true,
      message: '移动成功'
    });
  } catch (error) {
    console.error('[MOVE] Failed to move bookmark:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 移动书签到文件夹
 */
async function moveBookmarkToFolder(bookmark, targetFolderId) {
  // 更新书签的 parentCategoryId
  bookmark.parentCategoryId = targetFolderId;
  bookmark.updatedAt = Date.now();

  // 保存到 IndexedDB
  await addBookmark(bookmark);
  console.log(`[MOVE] Updated bookmark parent: ${bookmark.id} -> ${targetFolderId}`);

  // 同步到浏览器收藏夹
  try {
    // 检查书签 ID 是否为数字（浏览器书签 ID）
    if (/^\d+$/.test(bookmark.id)) {
      // 查找目标文件夹的浏览器 ID
      let targetBrowserId = null;

      if (targetFolderId === null || targetFolderId === 'null') {
        // 移动到根目录
        targetBrowserId = '0'; // Chrome 根目录 ID 是 '0' 或 '1'
      } else if (targetFolderId.startsWith('cat_')) {
        // 从分类 ID 中提取浏览器书签 ID
        // 格式：cat_{browser_bookmark_id}
        targetBrowserId = targetFolderId.replace('cat_', '');
      }

      if (targetBrowserId) {
        await chrome.bookmarks.move(bookmark.id, { parentId: targetBrowserId });
        console.log(`[MOVE] Moved in browser bookmarks: ${bookmark.id} -> ${targetBrowserId}`);
      }
    } else {
      // ID 不是纯数字，尝试通过 URL 查找并移动浏览器书签
      if (bookmark.url) {
        const browserBookmarks = await chrome.bookmarks.search({ url: bookmark.url });
        for (const bm of browserBookmarks) {
          // 查找目标文件夹
          let targetBrowserId = null;
          if (targetFolderId === null || targetFolderId === 'null') {
            targetBrowserId = bm.parentId; // 保持在同一层级
          } else if (targetFolderId.startsWith('cat_')) {
            targetBrowserId = targetFolderId.replace('cat_', '');
          }

          if (targetBrowserId && bm.parentId !== targetBrowserId) {
            await chrome.bookmarks.move(bm.id, { parentId: targetBrowserId });
            console.log(`[MOVE] Moved browser bookmark by URL: ${bm.id} -> ${targetBrowserId}`);
          }
        }
      }
    }
  } catch (browserError) {
    // 浏览器书签可能已被手动删除，记录但不报错
    console.debug(`[MOVE] Browser bookmark sync warning: ${browserError.message}`);
  }
}

/**
 * 移动文件夹（分类）
 */
async function moveCategory(category, targetParentId) {
  // 更新分类的父 ID
  category.parentId = targetParentId === 'null' ? null : targetParentId;
  category.updatedAt = Date.now();

  // 保存到 IndexedDB
  await addCategory(category);
  console.log(`[MOVE] Updated category parent: ${category.id} -> ${targetParentId}`);

  // 同步到浏览器收藏夹
  try {
    // 从分类 ID 中提取浏览器书签 ID
    if (category.id.startsWith('cat_')) {
      const browserId = category.id.replace('cat_', '');

      let targetBrowserId = null;
      if (targetParentId === null || targetParentId === 'null') {
        targetBrowserId = '1'; // Chrome 书签栏根目录
      } else if (targetParentId.startsWith('cat_')) {
        targetBrowserId = targetParentId.replace('cat_', '');
      }

      if (targetBrowserId) {
        await chrome.bookmarks.move(browserId, { parentId: targetBrowserId });
        console.log(`[MOVE] Moved folder in browser: ${browserId} -> ${targetBrowserId}`);
      }
    }
  } catch (browserError) {
    console.debug(`[MOVE] Browser folder sync warning: ${browserError.message}`);
  }
}

// ===== 文件夹管理功能 =====

/**
 * 删除文件夹
 * 删除文件夹后，其中的子内容（书签和子文件夹）会移动到父文件夹
 * 如果是根文件夹，子内容移动到顶级目录
 */
async function handleDeleteFolder(request, sendResponse) {
  try {
    const { folderId } = request;
    console.log(`[DELETE_FOLDER] Deleting folder: ${folderId}`);

    await initDatabase();

    // 1. 获取文件夹信息
    const folder = await get(STORES.CATEGORIES, folderId);
    if (!folder) {
      sendResponse({ error: '文件夹不存在' });
      return;
    }

    // 2. 获取所有子内容（书签和子文件夹）
    const allChildren = await getAllDescendants(folderId);

    // 3. 确定目标父文件夹
    const targetParentId = folder.parentId || null;

    console.log(`[DELETE_FOLDER] Moving ${allChildren.length} children to parent: ${targetParentId || 'root'}`);

    // 4. 移动所有子内容到父文件夹
    for (const child of allChildren) {
      // 更新子文件夹的 parentId
      if (child.type === 'folder' || child.id.startsWith('cat_')) {
        const childCategory = await get(STORES.CATEGORIES, child.id);
        if (childCategory) {
          childCategory.parentId = targetParentId;
          childCategory.updatedAt = Date.now();
          await addCategory(childCategory);

          // 同步到浏览器收藏夹
          if (childCategory.id.startsWith('cat_')) {
            try {
              const browserId = childCategory.id.replace('cat_', '');
              let targetBrowserId = targetParentId === null ? '1' : targetParentId.replace('cat_', '');
              await chrome.bookmarks.move(browserId, { parentId: targetBrowserId });
            } catch (e) {
              console.debug(`[DELETE_FOLDER] Browser sync warning for ${child.id}:`, e.message);
            }
          }
        }
      } else {
        // 书签
        const childBookmark = await getBookmark(child.id);
        if (childBookmark) {
          childBookmark.parentCategoryId = targetParentId;
          childBookmark.updatedAt = Date.now();
          await addBookmark(childBookmark);

          // 同步到浏览器收藏夹
          if (/^\d+$/.test(childBookmark.id)) {
            try {
              let targetBrowserId = targetParentId === null ? '1' : targetParentId.replace('cat_', '');
              await chrome.bookmarks.move(childBookmark.id, { parentId: targetBrowserId });
            } catch (e) {
              console.debug(`[DELETE_FOLDER] Browser sync warning for ${child.id}:`, e.message);
            }
          }
        }
      }
    }

    // 5. 删除文件夹
    await deleteCategory(folderId);

    // 同步删除浏览器文件夹
    if (folder.id.startsWith('cat_')) {
      try {
        const browserId = folder.id.replace('cat_', '');
        await chrome.bookmarks.removeTree(browserId);
        console.log(`[DELETE_FOLDER] Removed browser folder: ${browserId}`);
      } catch (e) {
        console.debug(`[DELETE_FOLDER] Browser folder removal warning:`, e.message);
      }
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('folder-deleted', folderId);

    sendResponse({
      success: true,
      movedCount: allChildren.length
    });
  } catch (error) {
    console.error('[DELETE_FOLDER] Failed to delete folder:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 批量删除（书签和文件夹）
 */
async function handleBatchDelete(request, sendResponse) {
  try {
    const { bookmarkIds = [], categoryIds = [] } = request;
    console.log(`[BATCH_DELETE] Deleting ${bookmarkIds.length} bookmarks and ${categoryIds.length} categories`);

    await initDatabase();

    let deletedBookmarkCount = 0;
    let deletedCategoryCount = 0;
    const errors = [];

    // 删除书签
    for (const bookmarkId of bookmarkIds) {
      try {
        await deleteBookmark(bookmarkId);
        deletedBookmarkCount++;
      } catch (e) {
        errors.push(`删除书签 ${bookmarkId} 失败: ${e.message}`);
      }
    }

    // 删除文件夹（从叶子节点开始，避免父节点先被删除）
    const sortedCategories = [...categoryIds];
    // 简单排序：按 ID 排序（假设 ID 结构反映层级关系）
    sortedCategories.sort().reverse();

    for (const categoryId of sortedCategories) {
      try {
        // 获取文件夹信息
        const folder = await get(STORES.CATEGORIES, categoryId);
        if (!folder) {
          console.debug(`[BATCH_DELETE] Category not found: ${categoryId}`);
          continue;
        }

        // 获取所有子内容并移动到父目录
        const allChildren = await getAllDescendants(categoryId);
        // 如果父目录是根级别（null），则移动到"书签栏"（'cat_1'），避免创建新的一级目录
        let targetParentId = folder.parentId || 'cat_1';

        for (const child of allChildren) {
          if (child.type === 'category') {
            const childCat = await get(STORES.CATEGORIES, child.id);
            if (childCat) {
              // 特殊处理：如果子目录名称是"书签栏"或"其他书签"，将其内容提升，而不是保留这个子目录
              // 这样可以避免：书签栏 -> 已导入 -> 书签栏 -> oracle
              // 变成：书签栏 -> 书签栏 -> oracle (一级目录)
              // 而是：书签栏 -> oracle
              if ((childCat.name === '书签栏' || childCat.name === '其他书签') &&
                  targetParentId === 'cat_1') {
                console.log(`[BATCH_DELETE] Found root-level folder name "${childCat.name}", flattening its content`);
                // 将这个子目录的内容直接移动到 cat_1
                const grandchildren = await getAllDescendants(childCat.id);
                for (const grandchild of grandchildren) {
                  if (grandchild.type === 'category') {
                    const grandchildCat = await get(STORES.CATEGORIES, grandchild.id);
                    if (grandchildCat) {
                      grandchildCat.parentId = 'cat_1';
                      grandchildCat.updatedAt = Date.now();
                      await addCategory(grandchildCat);

                      // 同步到浏览器收藏夹
                      if (grandchildCat.id.startsWith('cat_')) {
                        try {
                          const browserId = grandchildCat.id.replace('cat_', '');
                          await chrome.bookmarks.move(browserId, { parentId: '1' });
                        } catch (e) {
                          console.debug(`[BATCH_DELETE] Browser sync warning for folder ${grandchild.id}:`, e.message);
                        }
                      }
                    }
                  } else {
                    const grandchildBookmark = await getBookmark(grandchild.id);
                    if (grandchildBookmark) {
                      grandchildBookmark.parentCategoryId = 'cat_1';
                      grandchildBookmark.updatedAt = Date.now();
                      await addBookmark(grandchildBookmark);

                      // 同步到浏览器
                      if (/^\d+$/.test(grandchildBookmark.id)) {
                        try {
                          await chrome.bookmarks.move(grandchildBookmark.id, { parentId: '1' });
                        } catch (e) {
                          console.debug(`[BATCH_DELETE] Browser sync warning:`, e.message);
                        }
                      }
                    }
                  }
                }
                // 删除这个空目录
                await deleteCategory(childCat.id);
                // 同步删除浏览器文件夹
                if (childCat.id.startsWith('cat_')) {
                  try {
                    const browserId = childCat.id.replace('cat_', '');
                    await chrome.bookmarks.removeTree(browserId);
                  } catch (e) {
                    console.debug(`[BATCH_DELETE] Browser folder removal warning:`, e.message);
                  }
                }
              } else {
                // 正常移动子目录
                childCat.parentId = targetParentId;
                childCat.updatedAt = Date.now();
                await addCategory(childCat);

                // 同步到浏览器收藏夹
                if (childCat.id.startsWith('cat_')) {
                  try {
                    const browserId = childCat.id.replace('cat_', '');
                    let targetBrowserId = targetParentId === 'cat_1' ? '1' : targetParentId.replace('cat_', '');
                    await chrome.bookmarks.move(browserId, { parentId: targetBrowserId });
                  } catch (e) {
                    console.debug(`[BATCH_DELETE] Browser sync warning for folder ${child.id}:`, e.message);
                  }
                }
              }
            }
          } else {
            const childBookmark = await getBookmark(child.id);
            if (childBookmark) {
              childBookmark.parentCategoryId = targetParentId;
              childBookmark.updatedAt = Date.now();
              await addBookmark(childBookmark);

              // 同步到浏览器
              if (/^\d+$/.test(childBookmark.id)) {
                try {
                  let targetBrowserId = targetParentId === 'cat_1' ? '1' : targetParentId.replace('cat_', '');
                  await chrome.bookmarks.move(childBookmark.id, { parentId: targetBrowserId });
                } catch (e) {
                  console.debug(`[BATCH_DELETE] Browser sync warning:`, e.message);
                }
              }
            }
          }
        }

        // 删除文件夹
        await deleteCategory(categoryId);

        // 同步删除浏览器文件夹
        if (folder.id.startsWith('cat_')) {
          try {
            const browserId = folder.id.replace('cat_', '');
            await chrome.bookmarks.removeTree(browserId);
          } catch (e) {
            console.debug(`[BATCH_DELETE] Browser folder removal warning:`, e.message);
          }
        }

        deletedCategoryCount++;
      } catch (e) {
        errors.push(`删除文件夹 ${categoryId} 失败: ${e.message}`);
      }
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('batch-deleted', {
      bookmarkCount: deletedBookmarkCount,
      categoryCount: deletedCategoryCount
    });

    sendResponse({
      success: true,
      deletedBookmarkCount,
      deletedCategoryCount,
      errors: errors.length > 0 ? errors : undefined
    });

    console.log(`[BATCH_DELETE] Completed: ${deletedBookmarkCount} bookmarks, ${deletedCategoryCount} categories deleted`);
  } catch (error) {
    console.error('[BATCH_DELETE] Failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 合并两个文件夹
 * 将源文件夹的所有内容移动到目标文件夹，然后删除源文件夹
 */
async function handleMergeFolders(request, sendResponse) {
  try {
    const { sourceId, targetId } = request;
    console.log(`[MERGE_FOLDERS] Merging ${sourceId} into ${targetId}`);

    await initDatabase();

    // 1. 验证源和目标都是文件夹
    const [source, target] = await Promise.all([
      get(STORES.CATEGORIES, sourceId),
      get(STORES.CATEGORIES, targetId)
    ]);

    if (!source) {
      sendResponse({ error: '源文件夹不存在' });
      return;
    }
    if (!target) {
      sendResponse({ error: '目标文件夹不存在' });
      return;
    }

    // 2. 检查是否会造成循环嵌套
    if (await isDescendant(targetId, sourceId)) {
      sendResponse({ error: '不能将文件夹合并到其子文件夹' });
      return;
    }

    // 3. 获取源文件夹的所有子内容
    const allChildren = await getAllDescendants(sourceId);

    console.log(`[MERGE_FOLDERS] Moving ${allChildren.length} items from ${sourceId} to ${targetId}`);

    // 4. 移动所有子内容到目标文件夹
    for (const child of allChildren) {
      // 更新子文件夹的 parentId
      if (child.type === 'folder' || child.id.startsWith('cat_')) {
        const childCategory = await get(STORES.CATEGORIES, child.id);
        if (childCategory) {
          childCategory.parentId = targetId;
          childCategory.updatedAt = Date.now();
          await addCategory(childCategory);

          // 同步到浏览器收藏夹
          if (childCategory.id.startsWith('cat_')) {
            try {
              const browserId = childCategory.id.replace('cat_', '');
              const targetBrowserId = targetId.replace('cat_', '');
              await chrome.bookmarks.move(browserId, { parentId: targetBrowserId });
            } catch (e) {
              console.debug(`[MERGE_FOLDERS] Browser sync warning for ${child.id}:`, e.message);
            }
          }
        }
      } else {
        // 书签
        const childBookmark = await getBookmark(child.id);
        if (childBookmark) {
          childBookmark.parentCategoryId = targetId;
          childBookmark.updatedAt = Date.now();
          await addBookmark(childBookmark);

          // 同步到浏览器收藏夹
          if (/^\d+$/.test(childBookmark.id)) {
            try {
              const targetBrowserId = targetId.replace('cat_', '');
              await chrome.bookmarks.move(childBookmark.id, { parentId: targetBrowserId });
            } catch (e) {
              console.debug(`[MERGE_FOLDERS] Browser sync warning for ${child.id}:`, e.message);
            }
          }
        }
      }
    }

    // 5. 删除源文件夹
    await deleteCategory(sourceId);

    // 同步删除浏览器文件夹
    if (source.id.startsWith('cat_')) {
      try {
        const browserId = source.id.replace('cat_', '');
        await chrome.bookmarks.removeTree(browserId);
        console.log(`[MERGE_FOLDERS] Removed source browser folder: ${browserId}`);
      } catch (e) {
        console.debug(`[MERGE_FOLDERS] Browser folder removal warning:`, e.message);
      }
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('folders-merged', { sourceId, targetId });

    sendResponse({
      success: true,
      movedCount: allChildren.length
    });
  } catch (error) {
    console.error('[MERGE_FOLDERS] Failed to merge folders:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 获取文件夹的所有后代（递归）
 * @param {string} folderId - 文件夹 ID
 * @returns {Array} 所有后代项（书签和子文件夹）
 */
async function getAllDescendants(folderId) {
  const allDescendants = [];

  // 获取直接子书签
  const allBookmarks = await getAllBookmarks();
  const childBookmarks = allBookmarks.filter(bm => bm.parentCategoryId === folderId);
  allDescendants.push(...childBookmarks);

  // 获取直接子文件夹
  const allCategories = await getAllCategories();
  const childFolders = allCategories.filter(cat => cat.parentId === folderId);
  allDescendants.push(...childFolders);

  // 递归获取子文件夹的后代
  for (const folder of childFolders) {
    const subDescendants = await getAllDescendants(folder.id);
    allDescendants.push(...subDescendants);
  }

  return allDescendants;
}

/**
 * 检查是否是后代（防止循环嵌套）
 * @param {string} ancestorId - 祖先 ID
 * @param {string} descendantId - 后代 ID
 * @returns {boolean} 是否是后代关系
 */
async function isDescendant(ancestorId, descendantId) {
  const allCategories = await getAllCategories();

  let currentId = descendantId;
  let iterations = 0;
  const maxIterations = 100; // 防止无限循环

  while (currentId && iterations < maxIterations) {
    iterations++;
    if (currentId === ancestorId) {
      return true;
    }

    // 查找当前节点的父节点
    const current = allCategories.find(c => c.id === currentId);
    if (!current || !current.parentId) {
      break;
    }

    currentId = current.parentId;
  }

  return false;
}

/**
 * 获取下一个排序号
 * @param {string} parentId - 父文件夹 ID
 * @returns {number} 下一个排序号
 */
async function getNextSortOrder(parentId) {
  const allBookmarks = await getAllBookmarks();
  const allCategories = await getAllCategories();

  // 获取同级书签和文件夹
  const siblings = [
    ...allBookmarks.filter(bm => bm.parentCategoryId === parentId),
    ...allCategories.filter(cat => cat.parentId === parentId)
  ];

  const maxOrder = Math.max(...siblings.map(s => s.sortOrder || 0), 0);
  return maxOrder + 1;
}

/**
 * 创建新分类
 * 1. 先在浏览器收藏夹中创建文件夹
 * 2. 使用浏览器文件夹 ID 作为分类 ID（cat_${browserId}）
 * 3. 将分类保存到 IndexedDB
 */
async function handleCreateCategory(request, sendResponse) {
  try {
    const { name, parentId } = request;
    console.log(`[CREATE_CATEGORY] Creating category: ${name} under ${parentId}`);

    await initDatabase();

    // 1. 先在浏览器收藏夹中创建文件夹
    let browserFolderId = null;
    try {
      let parentBrowserId = '1'; // 书签栏根目录
      if (parentId && parentId.startsWith('cat_')) {
        parentBrowserId = parentId.replace('cat_', '');
      }

      const browserFolder = await chrome.bookmarks.create({
        parentId: parentBrowserId,
        title: name
      });
      browserFolderId = browserFolder.id;
      console.log(`[CREATE_CATEGORY] Browser folder created: ${browserFolderId}`);
    } catch (browserError) {
      console.error('[CREATE_CATEGORY] Failed to create browser folder:', browserError);
      sendResponse({
        success: false,
        error: `创建浏览器文件夹失败: ${browserError.message}`
      });
      return;
    }

    // 2. 使用浏览器文件夹 ID 作为分类 ID
    const id = 'cat_' + browserFolderId;
    const sortOrder = await getNextSortOrder(parentId || null);

    const category = {
      id,
      name,
      parentId: parentId || null,
      sortOrder,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 3. 保存到 IndexedDB
    await addCategory(category);
    console.log(`[CREATE_CATEGORY] Category created: ${id}`);

    sendResponse({
      success: true,
      category
    });
  } catch (error) {
    console.error('[CREATE_CATEGORY] Failed to create category:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 更新分类
 */
async function handleUpdateCategory(request, sendResponse) {
  try {
    const { id, name } = request;
    console.log(`[UPDATE_CATEGORY] Updating category: ${id} to ${name}`);

    await initDatabase();

    const category = await get(STORES.CATEGORIES, id);
    if (!category) {
      sendResponse({
        success: false,
        error: '文件夹不存在'
      });
      return;
    }

    // 更新名称
    category.name = name;
    category.updatedAt = Date.now();

    await addCategory(category);
    console.log(`[UPDATE_CATEGORY] Category updated: ${id}, new name: ${name}`);

    // 同步到浏览器收藏夹
    try {
      if (category.id.startsWith('cat_')) {
        const browserId = category.id.replace('cat_', '');
        await chrome.bookmarks.update(browserId, { title: name });
        console.log(`[UPDATE_CATEGORY] Browser folder updated: ${browserId}`);
      }
    } catch (browserError) {
      console.debug('[UPDATE_CATEGORY] Browser folder update skipped:', browserError.message);
    }

    // 通知 popup 书签已变更
    notifyBookmarkChanged('category-updated', id);

    sendResponse({
      success: true
    });
  } catch (error) {
    console.error('[UPDATE_CATEGORY] Failed to update category:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}


/**
 * 导入书签数据
 * @param {Object} request - 请求对象
 * @param {Object} request.data - 要导入的数据 { bookmarks, categories, tags }
 * @param {Object} request.options - 导入选项
 * @param {Function} sendResponse - 响应回调
 */
async function handleImportBookmarks(request, sendResponse) {
  try {
    const { data, options = {} } = request;
    const { skipDuplicates = true, mergeStrategy = 'merge' } = options;

    console.log(`[IMPORT] Starting import: ${data.bookmarks?.length || 0} bookmarks`);

    await initDatabase();

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // 导入分类（如果存在）
    if (data.categories && Array.isArray(data.categories)) {
      for (const category of data.categories) {
        try {
          const existing = await get(STORES.CATEGORIES, category.id);
          if (existing) {
            if (mergeStrategy === 'replace') {
              category.updatedAt = Date.now();
              await addCategory(category);
            } else {
              // merge 或 skip 策略，跳过已存在的分类
            }
          } else {
            category.createdAt = Date.now();
            category.updatedAt = Date.now();
            await addCategory(category);
          }
        } catch (error) {
          console.error(`[IMPORT] Failed to import category ${category.id}:`, error);
        }
      }
    }

    // 导入书签
    if (data.bookmarks && Array.isArray(data.bookmarks)) {
      for (const bookmark of data.bookmarks) {
        try {
          // 同步到浏览器收藏夹（智能模式）
          // 检查浏览器中是否已存在该 URL 的书签
          let browserBookmarkId = null;

          if (bookmark.url && /^\d+$/.test(bookmark.id)) {
            try {
              // 搜索浏览器中是否已有该 URL（使用规范化 URL 进行比较）
              const normalizedUrl = normalizeUrl(bookmark.url);
              const allBrowserBookmarks = await chrome.bookmarks.getTree();
              const allBrowserBookmarksList = flattenBookmarkTree(allBrowserBookmarks);

              // 查找 URL 匹配的浏览器书签
              const existingBrowserBookmark = allBrowserBookmarksList.find(bm => {
                return normalizeUrl(bm.url) === normalizedUrl;
              });

              if (existingBrowserBookmark) {
                // 浏览器中已有该 URL，使用其 ID
                browserBookmarkId = existingBrowserBookmark.id;
              } else {
                // 浏览器中没有该 URL，创建新书签
                const parentCategory = bookmark.parentCategoryId ?
                  await get(STORES.CATEGORIES, bookmark.parentCategoryId) : null;

                let browserParentId = parentCategory?.id?.startsWith('cat_') ?
                  parentCategory.id.replace('cat_', '') : '1'; // 默认书签栏

                const newBrowserBookmark = await chrome.bookmarks.create({
                  parentId: browserParentId,
                  title: bookmark.title,
                  url: bookmark.url
                });

                browserBookmarkId = newBrowserBookmark.id;
              }
            } catch (browserError) {
              console.debug(`[IMPORT] Browser bookmark operation skipped: ${browserError.message}`);
            }
          }

          // 确定最终使用的 ID（优先使用浏览器书签的 ID）
          const finalId = browserBookmarkId || bookmark.id;

          // 检查 IndexedDB 中的重复（使用最终 ID）
          if (skipDuplicates) {
            const existing = await getBookmark(finalId);
            if (existing) {
              skipped++;
              continue;
            }

            // 通过 URL 检查重复（使用规范化的 URL 进行比较）
            // 但如果是新创建的浏览器书签，则跳过 URL 检测（避免删除后重新导入的问题）
            const isNewBrowserBookmark = browserBookmarkId && browserBookmarkId !== bookmark.id;

            if (!isNewBrowserBookmark) {
              const normalizedUrl = normalizeUrl(bookmark.url);
              const allBookmarks = await getAllBookmarks();
              const duplicateByUrl = allBookmarks.find(bm => normalizeUrl(bm.url) === normalizedUrl);
              if (duplicateByUrl) {
                skipped++;
                continue;
              }
            }
          }

          // 设置时间戳
          // createdAt: 原始创建时间（如果 JSON 中有）
          // dateAdded: 导入时间（用于"最近添加"排序）
          // updatedAt: 最后更新时间
          const now = Date.now();
          bookmark.createdAt = bookmark.createdAt || now;
          bookmark.dateAdded = now;  // 使用导入时间作为 dateAdded
          bookmark.updatedAt = now;

          // 使用浏览器书签的 ID（如果存在），否则使用原始 ID
          const bookmarkToSave = {
            ...bookmark,
            id: finalId
          };

          // 保存到 IndexedDB
          await addBookmark(bookmarkToSave);

          imported++;
        } catch (error) {
          console.error(`[IMPORT] Failed to import bookmark ${bookmark.id}:`, error);
          failed++;
        }
      }
    }

    // 导入标签（如果存在）
    if (data.tags && Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        try {
          const existing = await get(STORES.TAGS, tag.id);
          if (!existing) {
            await addTag(tag);
          }
        } catch (error) {
          console.error(`[IMPORT] Failed to import tag ${tag.id}:`, error);
        }
      }
    }

    console.log(`[IMPORT] Completed: ${imported} imported, ${skipped} skipped, ${failed} failed`);

    // 通知 popup 书签已变更
    notifyBookmarkChanged('imported', null);

    sendResponse({
      success: true,
      imported,
      skipped,
      failed
    });
  } catch (error) {
    console.error('[IMPORT] Failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}


// 定期同步（可选）
// chrome.alarms.create('syncBookmarks', { periodInMinutes: 30 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'syncBookmarks') {
//     // 执行定期同步
//   }
// });
