// Smart Bookmarks - 数据库迁移模块
// 用于管理数据库版本升级和数据迁移

/**
 * 迁移记录类
 */
class Migration {
  constructor(version, description, upFn, downFn = null) {
    this.version = version;
    this.description = description;
    this.up = upFn;      // 升级函数
    this.down = downFn;  // 降级函数（可选）
  }
}

/**
 * 迁移管理器
 */
export class MigrationManager {
  constructor(db) {
    this.db = db;
    this.migrations = new Map();
  }

  /**
   * 注册迁移
   * @param {number} version - 目标版本
   * @param {string} description - 迁移描述
   * @param {Function} upFn - 升级函数
   * @param {Function} downFn - 降级函数（可选）
   */
  registerMigration(version, description, upFn, downFn = null) {
    this.migrations.set(version, new Migration(version, description, upFn, downFn));
  }

  /**
   * 执行迁移
   * @param {number} fromVersion - 当前版本
   * @param {number} toVersion - 目标版本
   */
  async migrate(fromVersion, toVersion) {
    const results = {
      success: true,
      executed: [],
      errors: []
    };

    try {
      // 按版本号顺序执行迁移
      for (let version = fromVersion; version < toVersion; version++) {
        const migration = this.migrations.get(version + 1);

        if (migration) {
          console.log(`执行迁移 ${version} -> ${version + 1}: ${migration.description}`);

          try {
            await this.runMigration(migration);
            results.executed.push({
              from: version,
              to: version + 1,
              description: migration.description
            });
          } catch (error) {
            console.error(`迁移 ${version} -> ${version + 1} 失败:`, error);
            results.errors.push({
              version,
              error: error.message
            });
            results.success = false;
            break;
          }
        }
      }

      return results;
    } catch (error) {
      console.error('迁移过程出错:', error);
      results.success = false;
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * 执行单个迁移
   * @param {Migration} migration - 迁移对象
   */
  async runMigration(migration) {
    // 在事务中执行迁移
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.db.objectStoreNames], 'readwrite');

      transaction.oncomplete = () => {
        console.log(`迁移 ${migration.version} 完成`);
        resolve();
      };

      transaction.onerror = () => {
        console.error(`迁移 ${migration.version} 失败:`, transaction.error);
        reject(transaction.error);
      };

      try {
        migration.up(this.db, transaction);
      } catch (error) {
        console.error(`执行迁移函数出错:`, error);
        reject(error);
      }
    });
  }

  /**
   * 回滚迁移（如果支持）
   * @param {number} fromVersion - 当前版本
   * @param {number} toVersion - 目标版本
   */
  async rollback(fromVersion, toVersion) {
    const results = {
      success: true,
      executed: [],
      errors: []
    };

    try {
      // 降序执行回滚
      for (let version = fromVersion; version > toVersion; version--) {
        const migration = this.migrations.get(version);

        if (migration && migration.down) {
          console.log(`回滚迁移 ${version} -> ${version - 1}: ${migration.description}`);

          try {
            await this.runRollback(migration);
            results.executed.push({
              from: version,
              to: version - 1,
              description: migration.description
            });
          } catch (error) {
            console.error(`回滚 ${version} -> ${version - 1} 失败:`, error);
            results.errors.push({
              version,
              error: error.message
            });
            results.success = false;
            break;
          }
        } else if (migration && !migration.down) {
          console.warn(`迁移 ${version} 不支持回滚`);
        }
      }

      return results;
    } catch (error) {
      console.error('回滚过程出错:', error);
      results.success = false;
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * 执行单个回滚
   * @param {Migration} migration - 迁移对象
   */
  async runRollback(migration) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.db.objectStoreNames], 'readwrite');

      transaction.oncomplete = () => {
        console.log(`回滚 ${migration.version} 完成`);
        resolve();
      };

      transaction.onerror = () => {
        console.error(`回滚 ${migration.version} 失败:`, transaction.error);
        reject(transaction.error);
      };

      try {
        migration.down(this.db, transaction);
      } catch (error) {
        console.error(`执行回滚函数出错:`, error);
        reject(error);
      }
    });
  }
}

/**
 * 创建迁移管理器并注册所有迁移
 * @param {IDBDatabase} db - 数据库实例
 */
export function createMigrationManager(db) {
  const manager = new MigrationManager(db);

  // 注册版本 1 -> 2 的迁移
  manager.registerMigration(
    2,
    '添加同步日志和元数据表',
    (database) => {
      // 升级操作
      if (!database.objectStoreNames.contains('metadata')) {
        const metadataStore = database.createObjectStore('metadata', { keyPath: 'key' });
        metadataStore.createIndex('value', 'value', { unique: false });
      }

      if (!database.objectStoreNames.contains('sync_log')) {
        const syncLogStore = database.createObjectStore('sync_log', { keyPath: 'id' });
        syncLogStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncLogStore.createIndex('type', 'type', { unique: false });
      }

      // 为现有表添加新索引
      const bookmarkStore = database.transaction.objectStore('bookmarks');
      if (!bookmarkStore.indexNames.contains('browserId')) {
        bookmarkStore.createIndex('browserId', 'browserId', { unique: false });
      }
      if (!bookmarkStore.indexNames.contains('dateAdded')) {
        bookmarkStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }

      const categoryStore = database.transaction.objectStore('categories');
      if (!categoryStore.indexNames.contains('path')) {
        categoryStore.createIndex('path', 'path', { unique: false });
      }
    },
    (database) => {
      // 降级操作（可选）
      if (database.objectStoreNames.contains('sync_log')) {
        database.deleteObjectStore('sync_log');
      }
      if (database.objectStoreNames.contains('metadata')) {
        database.deleteObjectStore('metadata');
      }
    }
  );

  // 可以在这里注册更多迁移
  // manager.registerMigration(3, '...', upFn, downFn);

  return manager;
}

/**
 * 迁移辅助函数
 */

/**
 * 重命名对象存储中的字段
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} oldName - 旧字段名
 * @param {string} newName - 新字段名
 */
export async function renameField(store, oldName, newName) {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    const updates = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;

      if (cursor) {
        const data = cursor.value;

        if (data.hasOwnProperty(oldName)) {
          data[newName] = data[oldName];
          delete data[oldName];
          cursor.update(data);
          updates.push(data.id);
        }

        cursor.continue();
      } else {
        console.log(`重命名字段 ${oldName} -> ${newName}, 更新了 ${updates.length} 条记录`);
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 添加新字段到所有记录
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} fieldName - 字段名
 * @param {*} defaultValue - 默认值
 */
export async function addField(store, fieldName, defaultValue = null) {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;

      if (cursor) {
        const data = cursor.value;

        if (!data.hasOwnProperty(fieldName)) {
          data[fieldName] = defaultValue;
          cursor.update(data);
          count++;
        }

        cursor.continue();
      } else {
        console.log(`添加字段 ${fieldName}, 更新了 ${count} 条记录`);
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除字段
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} fieldName - 要删除的字段名
 */
export async function removeField(store, fieldName) {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;

      if (cursor) {
        const data = cursor.value;

        if (data.hasOwnProperty(fieldName)) {
          delete data[fieldName];
          cursor.update(data);
          count++;
        }

        cursor.continue();
      } else {
        console.log(`删除字段 ${fieldName}, 更新了 ${count} 条记录`);
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 创建索引（如果不存在）
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} indexName - 索引名
 * @param {string} keyPath - 键路径
 * @param {Object} options - 索引选项
 */
export function createIndexIfNotExists(store, indexName, keyPath, options = {}) {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
    console.log(`创建索引: ${indexName}`);
  }
}

/**
 * 删除索引（如果存在）
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} indexName - 索引名
 */
export function deleteIndexIfExists(store, indexName) {
  if (store.indexNames.contains(indexName)) {
    store.deleteIndex(indexName);
    console.log(`删除索引: ${indexName}`);
  }
}
