// Smart Bookmarks - Background Service Worker

// 导入数据库和链接检测工具
import {
  openDB,
  getAllBookmarks,
  addBookmark,
  getBookmark,
  getAllCategories,
  addCategory,
  get,
  addTag,
  clearAllData,
  STORES
} from '../db/indexeddb.js';
import { checkBookmarks, batchMoveToPendingCleanup } from '../utils/link-checker.js';
import { analyzeBookmarks } from '../api/openai.js';

console.log('Smart Bookmarks background service worker loaded');

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

// 初始化数据库
async function initDatabase() {
  if (!db) {
    db = await openDB();
  }
  return db;
}

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // 首次安装，初始化数据
    await initializeData();
  }
});

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

    // 过滤出需要导入的书签（不存在的）
    const newBookmarks = browserBookmarks.filter(bm => !existingIds.has(bm.id));

    if (newBookmarks.length === 0) {
      console.log('All bookmarks already imported, nothing new to add');
      return;
    }

    console.log(`Importing ${newBookmarks.length} new bookmarks (skipping ${existingIds.size} existing)`);

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

    case 'AI_ANALYZE':
      handleAIAnalyze(request, sendResponse);
      return true;

    case 'APPLY_CATEGORIES':
      handleApplyCategories(request, sendResponse);
      return true;

    case 'IMPORT_FROM_BROWSER':
      handleImportFromBrowser(request, sendResponse);
      return true;

    case 'CLEAR_DATA':
      handleClearData(request, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

/**
 * 获取收藏数据
 */
async function handleGetBookmarks(request, sendResponse) {
  try {
    const database = await initDatabase();
    const bookmarks = await getAllBookmarks();
    const categories = await getAllCategories();

    sendResponse({
      bookmarks,
      categories,
      tags: [] // TODO: 实现获取标签的功能
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
    const database = await initDatabase();

    // 获取所有书签
    let bookmarks = await getAllBookmarks();

    if (bookmarks.length === 0) {
      sendResponse({
        success: true,
        total: 0,
        brokenCount: 0,
        brokenLinks: []
      });
      return;
    }

    // 检测选项
    const options = {
      concurrency: request.concurrency || 3,
      timeout: request.timeout || 10000,
      delay: request.delay || 500,
      onProgress: (completed, total, brokenLinks) => {
        // 发送进度更新到 popup
        chrome.runtime.sendMessage({
          type: 'CHECK_PROGRESS',
          data: {
            completed,
            total,
            brokenCount: brokenLinks.length,
            percentage: Math.round((completed / total) * 100)
          }
        }).catch(() => {
          // Popup 可能已关闭，忽略错误
        });
      }
    };

    // 执行批量检测（会自动更新书签状态）
    await checkBookmarks(bookmarks, options);

    // 保存更新后的书签状态到数据库
    for (const bookmark of bookmarks) {
      await addBookmark(bookmark);
    }

    // 获取失效链接
    const brokenLinks = bookmarks
      .filter(b => b.status === 'broken')
      .map(b => ({
        bookmarkId: b.id,
        url: b.url,
        title: b.title,
        error: b.checkError,
        statusCode: b.checkStatusCode,
        checkStatus: b.checkStatus
      }));

    // 自动将失效链接移至"待清理"分类
    const movedCount = await batchMoveToPendingCleanup(database, brokenLinks);

    sendResponse({
      success: true,
      total: bookmarks.length,
      brokenCount: brokenLinks.length,
      movedCount: movedCount,
      brokenLinks: brokenLinks
    });

  } catch (error) {
    console.error('Failed to check broken links:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * AI 分析收藏
 */
async function handleAIAnalyze(request, sendResponse) {
  try {
    const { bookmarkIds } = request;

    // 打开数据库
    await initDatabase();

    // 获取待分析的收藏
    const allBookmarks = await getAllBookmarks();
    const bookmarksToAnalyze = bookmarkIds && bookmarkIds.length > 0
      ? allBookmarks.filter(bm => bookmarkIds.includes(bm.id))
      : allBookmarks;

    if (bookmarksToAnalyze.length === 0) {
      sendResponse({ error: '没有可分析的收藏' });
      return;
    }

    // 获取现有分类作为参考
    const categories = await getAllCategories();
    const existingCategoryNames = categories.map(c => c.name);

    // 获取 AI 配置
    const configResult = await chrome.storage.local.get('aiConfig');
    const aiConfig = configResult.aiConfig;

    if (!aiConfig || !aiConfig.apiUrl || !aiConfig.apiKey || !aiConfig.model) {
      sendResponse({ error: '请先在设置中配置 AI API' });
      return;
    }

    // 调用 AI 分析
    const analysisResult = await analyzeBookmarks(
      aiConfig,
      bookmarksToAnalyze,
      existingCategoryNames,
      10,
      // 进度回调 - 发送进度消息到 popup
      (current, total, message) => {
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_PROGRESS',
          data: { current, total, message }
        }).catch(() => {
          // Popup 可能已关闭，忽略错误
        });
      }
    );

    sendResponse({ result: analysisResult });
  } catch (error) {
    console.error('AI analysis failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 应用分类建议
 */
async function handleApplyCategories(request, sendResponse) {
  try {
    const { categories } = request;

    await initDatabase();

    // 创建新分类
    for (const cat of categories) {
      if (cat.isNew) {
        // 检查分类是否已存在
        const existing = await get(STORES.CATEGORIES, `cat_${cat.name}`);

        if (!existing) {
          await addCategory({
            id: `cat_${cat.name}`,
            name: cat.name,
            parentId: null,
            createdAt: Date.now()
          });
        }
      }

      // 更新收藏的分类
      for (const bookmarkId of cat.bookmarkIds) {
        const bookmark = await getBookmark(bookmarkId);
        if (bookmark) {
          bookmark.categoryId = `cat_${cat.name}`;
          bookmark.updatedAt = Date.now();
          await addBookmark(bookmark);
        }
      }
    }

    sendResponse({ success: true });
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

// 定期同步（可选）
// chrome.alarms.create('syncBookmarks', { periodInMinutes: 30 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'syncBookmarks') {
//     // 执行定期同步
//   }
// });
