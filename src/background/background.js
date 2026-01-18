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
  STORES
} from '../db/indexeddb.js';
import { checkBookmarks, batchMoveToPendingCleanup } from '../utils/link-checker.js';
import { analyzeBookmarks } from '../api/openai.js';

console.log('Smart Bookmarks background service worker loaded');

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
    const bookmarks = flattenBookmarkTree(tree);

    console.log(`Found ${bookmarks.length} browser bookmarks`);

    // 检查是否已有导入过的数据
    const existingBookmarks = await getAllBookmarks();
    if (existingBookmarks.length > 0) {
      console.log('Bookmarks already imported, skipping...');
      return;
    }

    // 存储到 IndexedDB
    for (const bm of bookmarks) {
      const bookmark = {
        id: bm.id,
        title: bm.title,
        url: bm.url,
        description: '',
        tags: [],
        categoryId: null,
        status: 'active',
        createdAt: bm.dateAdded || Date.now(),
        updatedAt: Date.now()
      };

      await addBookmark(bookmark);
    }

    // 提取并保存现有分类
    const categories = extractCategoriesFromTree(tree);
    for (const cat of categories) {
      await addCategory(cat);
    }

    console.log(`Imported ${bookmarks.length} bookmarks and ${categories.length} categories`);
  } catch (error) {
    console.error('Failed to import browser bookmarks:', error);
  }
}

/**
 * 扁平化收藏树
 */
function flattenBookmarkTree(nodes) {
  const bookmarks = [];

  function traverse(node) {
    if (node.url) {
      // 这是一个收藏
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        dateAdded: node.dateAdded
      });
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child));
    }
  }

  nodes.forEach(node => traverse(node));
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
  console.log('Received message:', request);

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
    sendResponse({ bookmarks });
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

// 定期同步（可选）
// chrome.alarms.create('syncBookmarks', { periodInMinutes: 30 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'syncBookmarks') {
//     // 执行定期同步
//   }
// });
