// Smart Bookmarks - IndexedDB 封装

// 数据库名称和版本
const DB_NAME = 'SmartBookmarksDB';
const DB_VERSION = 2; // 提升版本以支持迁移

// 对象存储名称
const STORES = {
  BOOKMARKS: 'bookmarks',
  CATEGORIES: 'categories',
  TAGS: 'tags',
  METADATA: 'metadata', // 新增：用于存储数据库元数据
  SYNC_LOG: 'sync_log'  // 新增：用于存储同步日志
};

// 数据库实例
let db = null;

// 迁移任务映射表
const MIGRATIONS = {
  1: (db) => {
    // 版本 1 -> 2 的迁移
    // 添加新的索引和字段
    const bookmarkStore = db.transaction.objectStore(STORES.BOOKMARKS);

    // 添加新索引（如果不存在）
    if (!bookmarkStore.indexNames.contains('browserId')) {
      bookmarkStore.createIndex('browserId', 'browserId', { unique: false });
    }
    if (!bookmarkStore.indexNames.contains('dateAdded')) {
      bookmarkStore.createIndex('dateAdded', 'dateAdded', { unique: false });
    }

    // 创建元数据表
    if (!db.objectStoreNames.contains(STORES.METADATA)) {
      const metadataStore = db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      metadataStore.createIndex('value', 'value', { unique: false });
    }

    // 创建同步日志表
    if (!db.objectStoreNames.contains(STORES.SYNC_LOG)) {
      const syncLogStore = db.createObjectStore(STORES.SYNC_LOG, { keyPath: 'id' });
      syncLogStore.createIndex('timestamp', 'timestamp', { unique: false });
      syncLogStore.createIndex('type', 'type', { unique: false });
    }
  }
};

/**
 * 打开数据库连接
 */
export async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;

      // 创建收藏表
      if (!database.objectStoreNames.contains(STORES.BOOKMARKS)) {
        const bookmarkStore = database.createObjectStore(STORES.BOOKMARKS, { keyPath: 'id' });
        bookmarkStore.createIndex('url', 'url', { unique: false });
        bookmarkStore.createIndex('title', 'title', { unique: false });
        bookmarkStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        bookmarkStore.createIndex('status', 'status', { unique: false });
        bookmarkStore.createIndex('browserId', 'browserId', { unique: false });
        bookmarkStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }

      // 创建分类表
      if (!database.objectStoreNames.contains(STORES.CATEGORIES)) {
        const categoryStore = database.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        categoryStore.createIndex('name', 'name', { unique: false });
        categoryStore.createIndex('parentId', 'parentId', { unique: false });
        categoryStore.createIndex('path', 'path', { unique: false }); // 新增路径索引
      }

      // 创建标签表
      if (!database.objectStoreNames.contains(STORES.TAGS)) {
        const tagStore = database.createObjectStore(STORES.TAGS, { keyPath: 'id' });
        tagStore.createIndex('name', 'name', { unique: true });
      }

      // 创建元数据表
      if (!database.objectStoreNames.contains(STORES.METADATA)) {
        const metadataStore = database.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        metadataStore.createIndex('value', 'value', { unique: false });
      }

      // 创建同步日志表
      if (!database.objectStoreNames.contains(STORES.SYNC_LOG)) {
        const syncLogStore = database.createObjectStore(STORES.SYNC_LOG, { keyPath: 'id' });
        syncLogStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncLogStore.createIndex('type', 'type', { unique: false });
      }

      // 执行数据迁移
      if (oldVersion > 0 && oldVersion < DB_VERSION) {
        console.log(`数据库从版本 ${oldVersion} 迁移到 ${DB_VERSION}`);
        runMigrations(database, oldVersion);
      }
    };
  });
}

/**
 * 执行数据迁移
 * @param {IDBDatabase} database - 数据库实例
 * @param {number} fromVersion - 起始版本
 */
function runMigrations(database, fromVersion) {
  for (let version = fromVersion; version < DB_VERSION; version++) {
    const migration = MIGRATIONS[version];
    if (migration) {
      try {
        migration(database);
        console.log(`迁移 ${version} -> ${version + 1} 完成`);
      } catch (error) {
        console.error(`迁移 ${version} -> ${version + 1} 失败:`, error);
        throw error;
      }
    }
  }
}

/**
 * 关闭数据库连接
 */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 通用 CRUD 操作
 */

// 添加或更新数据
export async function put(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 获取单条数据
export async function get(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 获取所有数据
export async function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 删除数据
export async function deleteItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 清空表
export async function clear(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 通过索引查询
export async function getByIndex(storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 收藏相关操作
 */

export async function addBookmark(bookmark) {
  return put(STORES.BOOKMARKS, bookmark);
}

export async function getBookmark(id) {
  return get(STORES.BOOKMARKS, id);
}

export async function getAllBookmarks() {
  return getAll(STORES.BOOKMARKS);
}

export async function deleteBookmark(id) {
  return deleteItem(STORES.BOOKMARKS, id);
}

export async function getBookmarksByTag(tag) {
  return getByIndex(STORES.BOOKMARKS, 'tags', tag);
}

export async function getBookmarksByStatus(status) {
  return getByIndex(STORES.BOOKMARKS, 'status', status);
}

/**
 * 分类相关操作
 */

export async function addCategory(category) {
  return put(STORES.CATEGORIES, category);
}

export async function getAllCategories() {
  return getAll(STORES.CATEGORIES);
}

export async function deleteCategory(id) {
  return deleteItem(STORES.CATEGORIES, id);
}

/**
 * 标签相关操作
 */

export async function addTag(tag) {
  return put(STORES.TAGS, tag);
}

export async function getAllTags() {
  return getAll(STORES.TAGS);
}

export async function deleteTag(id) {
  return deleteItem(STORES.TAGS, id);
}

/**
 * 元数据相关操作
 */

export async function setMetadata(key, value) {
  return put(STORES.METADATA, { key, value });
}

export async function getMetadata(key) {
  const result = await get(STORES.METADATA, key);
  return result ? result.value : null;
}

export async function getDatabaseVersion() {
  return getMetadata('db_version');
}

export async function setDatabaseVersion(version) {
  return setMetadata('db_version', version);
}

/**
 * 同步日志相关操作
 */

export async function addSyncLog(log) {
  const logEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    ...log
  };
  return put(STORES.SYNC_LOG, logEntry);
}

export async function getSyncLogs(limit = 100) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SYNC_LOG, 'readonly');
    const store = transaction.objectStore(STORES.SYNC_LOG);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const logs = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && logs.length < limit) {
        logs.push(cursor.value);
        cursor.continue();
      } else {
        resolve(logs);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function clearSyncLogs() {
  return clear(STORES.SYNC_LOG);
}

/**
 * 批量操作
 */

export async function batchAdd(storeName, items) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const results = [];

    transaction.oncomplete = () => resolve(results);
    transaction.onerror = () => reject(transaction.error);

    items.forEach(item => {
      const request = store.put(item);
      request.onsuccess = () => results.push(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function batchDelete(storeName, keys) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    keys.forEach(key => {
      store.delete(key);
    });
  });
}

/**
 * 统计相关操作
 */

export async function getStoreCount(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getDatabaseStats() {
  const stats = {};

  for (const storeName of Object.values(STORES)) {
    try {
      stats[storeName] = await getStoreCount(storeName);
    } catch (error) {
      stats[storeName] = 0;
    }
  }

  return stats;
}

/**
 * 数据库备份和恢复
 */

export async function exportDatabase() {
  const data = {};

  for (const storeName of Object.values(STORES)) {
    try {
      data[storeName] = await getAll(storeName);
    } catch (error) {
      data[storeName] = [];
    }
  }

  return {
    version: DB_VERSION,
    timestamp: Date.now(),
    data
  };
}

export async function importDatabase(backupData) {
  if (!backupData.data) {
    throw new Error('无效的备份数据格式');
  }

  for (const storeName of Object.keys(backupData.data)) {
    try {
      await clear(storeName);
      const items = backupData.data[storeName];
      if (items && items.length > 0) {
        await batchAdd(storeName, items);
      }
    } catch (error) {
      console.error(`导入 ${storeName} 失败:`, error);
    }
  }

  // 更新数据库版本
  if (backupData.version) {
    await setDatabaseVersion(backupData.version);
  }

  return true;
}

/**
 * 清空所有数据（危险操作）
 */

export async function clearAllData() {
  const promises = [];

  for (const storeName of Object.values(STORES)) {
    promises.push(clear(storeName));
  }

  return Promise.all(promises);
}

/**
 * 检查数据库健康状态
 */

export async function checkDatabaseHealth() {
  try {
    if (!db) {
      return { healthy: false, error: '数据库未连接' };
    }

    const stats = await getDatabaseStats();
    const version = await getDatabaseVersion();

    return {
      healthy: true,
      version: version || DB_VERSION,
      stats
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

// 导出所有存储名称
export { STORES };
