/**
 * 性能测试工具模块
 * 提供性能测量、监控和报告生成功能
 */

/**
 * 性能测量器类
 */
class PerformanceMonitor {
  constructor() {
    this.measurements = new Map(); // 存储所有测量记录
    this.enabled = true; // 是否启用性能监控
    this.thresholds = {
      // 性能阈值配置（毫秒）
      slow: 100,       // 慢操作阈值
      warning: 50,     // 警告阈值
      normal: 16       // 正常阈值（约60fps）
    };
  }

  /**
   * 测量同步函数执行时间
   * @param {string} label - 测量标签
   * @param {Function} fn - 要测量的函数
   * @returns {any} 函数执行结果
   */
  measure(label, fn) {
    if (!this.enabled) {
      return fn();
    }

    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    this._recordMeasurement(label, duration);

    return result;
  }

  /**
   * 测量异步函数执行时间
   * @param {string} label - 测量标签
   * @param {Function} fn - 要测量的异步函数
   * @returns {Promise<any>} 函数执行结果
   */
  async measureAsync(label, fn) {
    if (!this.enabled) {
      return await fn();
    }

    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    this._recordMeasurement(label, duration);

    return result;
  }

  /**
   * 开始一个手动计时
   * @param {string} label - 计时标签
   * @returns {Function} 结束计时的函数
   */
  start(label) {
    if (!this.enabled) {
      return () => {};
    }

    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this._recordMeasurement(label, duration);
    };
  }

  /**
   * 记录测量结果
   * @private
   * @param {string} label - 标签
   * @param {number} duration - 持续时间（毫秒）
   */
  _recordMeasurement(label, duration) {
    if (!this.measurements.has(label)) {
      this.measurements.set(label, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        samples: []
      });
    }

    const measurement = this.measurements.get(label);
    measurement.count++;
    measurement.totalTime += duration;
    measurement.minTime = Math.min(measurement.minTime, duration);
    measurement.maxTime = Math.max(measurement.maxTime, duration);

    // 只保留最近100个样本
    measurement.samples.push({ duration, timestamp: Date.now() });
    if (measurement.samples.length > 100) {
      measurement.samples.shift();
    }

    // 根据性能等级输出日志
    this._logByLevel(label, duration);
  }

  /**
   * 根据性能等级输出日志
   * @private
   */
  _logByLevel(label, duration) {
    const { slow, warning, normal } = this.thresholds;

    if (duration > slow) {
      console.warn(`[Performance] 🐌 ${label}: ${duration.toFixed(2)}ms (慢)`);
    } else if (duration > warning) {
      console.info(`[Performance] ⚠️ ${label}: ${duration.toFixed(2)}ms (警告)`);
    } else if (duration > normal) {
      console.debug(`[Performance] ✅ ${label}: ${duration.toFixed(2)}ms (正常)`);
    }
  }

  /**
   * 获取指定标签的性能统计
   * @param {string} label - 标签
   * @returns {Object|null} 统计信息
   */
  getStats(label) {
    const measurement = this.measurements.get(label);
    if (!measurement) return null;

    return {
      label,
      count: measurement.count,
      avgTime: measurement.totalTime / measurement.count,
      minTime: measurement.minTime === Infinity ? 0 : measurement.minTime,
      maxTime: measurement.maxTime,
      totalTime: measurement.totalTime
    };
  }

  /**
   * 获取所有性能统计
   * @returns {Array} 所有统计信息
   */
  getAllStats() {
    const stats = [];
    for (const [label] of this.measurements) {
      stats.push(this.getStats(label));
    }
    return stats.sort((a, b) => b.avgTime - a.avgTime); // 按平均时间降序
  }

  /**
   * 生成性能报告
   * @param {Object} options - 报告选项
   * @returns {Object} 性能报告
   */
  generateReport(options = {}) {
    const { sortBy = 'avgTime', limit = 20 } = options;
    const stats = this.getAllStats();

    // 应用排序
    const sortedStats = [...stats].sort((a, b) => b[sortBy] - a[sortBy]);

    // 应用限制
    const limitedStats = sortedStats.slice(0, limit);

    // 计算汇总信息
    const summary = {
      totalMeasurements: stats.reduce((sum, s) => sum + s.count, 0),
      slowOperations: stats.filter(s => s.avgTime > this.thresholds.slow).length,
      warningOperations: stats.filter(s => s.avgTime > this.thresholds.warning && s.avgTime <= this.thresholds.slow).length,
      topSlowOperation: stats[0] || null
    };

    return {
      summary,
      operations: limitedStats,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 打印性能报告到控制台
   * @param {Object} options - 报告选项
   */
  printReport(options = {}) {
    const report = this.generateReport(options);

    console.group('📊 性能报告');

    console.log('📈 汇总信息:');
    console.table(report.summary);

    console.log('\n🔍 操作详情 (按平均耗时排序):');
    console.table(
      report.operations.map(op => ({
        操作: op.label,
        总次数: op.count,
        平均耗时: `${op.avgTime.toFixed(2)}ms`,
        最小: `${op.minTime.toFixed(2)}ms`,
        最大: `${op.maxTime.toFixed(2)}ms`,
        总耗时: `${op.totalTime.toFixed(2)}ms`
      }))
    );

    console.groupEnd();
  }

  /**
   * 清除所有测量记录
   */
  clear() {
    this.measurements.clear();
    console.log('[Performance] 所有测量记录已清除');
  }

  /**
   * 启用性能监控
   */
  enable() {
    this.enabled = true;
    console.log('[Performance] 性能监控已启用');
  }

  /**
   * 禁用性能监控
   */
  disable() {
    this.enabled = false;
    console.log('[Performance] 性能监控已禁用');
  }

  /**
   * 设置性能阈值
   * @param {Object} newThresholds - 新的阈值配置
   */
  setThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
}

/**
 * 性能标记工具
 * 用于测量浏览器性能条目（如资源加载、渲染等）
 */
class PerformanceMarker {
  /**
   * 标记一个性能时间点
   * @param {string} name - 标记名称
   */
  static mark(name) {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  }

  /**
   * 测量两个标记之间的时间
   * @param {string} name - 测量名称
   * @param {string} startMark - 起始标记
   * @param {string} endMark - 结束标记
   * @returns {number|null} 持续时间（毫秒）
   */
  static measure(name, startMark, endMark) {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const entries = performance.getEntriesByName(name, 'measure');
        if (entries.length > 0) {
          return entries[0].duration;
        }
      } catch (e) {
        console.warn('[PerformanceMarker] 测量失败:', e);
      }
    }
    return null;
  }

  /**
   * 获取性能标记列表
   * @returns {Array} 性能标记列表
   */
  static getMarks() {
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      return performance.getEntriesByType('mark');
    }
    return [];
  }

  /**
   * 清除所有标记
   */
  static clearMarks() {
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      performance.clearMarks();
    }
  }

  /**
   * 清除所有测量
   */
  static clearMeasures() {
    if (typeof performance !== 'undefined' && performance.clearMeasures) {
      performance.clearMeasures();
    }
  }
}

/**
 * 内存监控工具
 */
class MemoryMonitor {
  /**
   * 获取当前内存使用情况
   * @returns {Object|null} 内存信息
   */
  static getMemoryInfo() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memory = performance.memory;
      return {
        usedJSHeapSize: (memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        totalJSHeapSize: (memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB',
        usagePercentage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }
    return null;
  }

  /**
   * 打印内存信息
   */
  static printMemoryInfo() {
    const info = MemoryMonitor.getMemoryInfo();
    if (info) {
      console.group('💾 内存使用情况');
      console.table(info);
      console.groupEnd();
    } else {
      console.warn('[MemoryMonitor] 内存API不可用');
    }
  }
}

// 创建全局单例实例
const performanceMonitor = new PerformanceMonitor();

// 导出到全局作用域（用于调试）
if (typeof window !== 'undefined') {
  window.__performance = performanceMonitor;
  window.__performanceMarker = PerformanceMarker;
  window.__memoryMonitor = MemoryMonitor;
}

export { performanceMonitor, PerformanceMarker, MemoryMonitor };
export default performanceMonitor;
