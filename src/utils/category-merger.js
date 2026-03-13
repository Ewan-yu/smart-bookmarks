// Smart Bookmarks - 分类聚合器
// 智能识别并合并语义重复的分类

/**
 * 分类聚合器
 * 用于合并 AI 分析生成的语义重复分类
 */
class CategoryMerger {
  constructor(options = {}) {
    // 相似度阈值（0-1），默认 0.75
    this.similarityThreshold = options.similarityThreshold || 0.75;
    // 最小合并支持数，至少 2 个才考虑合并
    this.minMergeSupport = options.minMergeSupport || 2;
  }

  /**
   * 聚合相似分类
   * @param {Array} categories - AI 生成的分类列表
   * @returns {Array} 聚合后的分类列表
   */
  mergeCategories(categories) {
    if (!categories || categories.length === 0) {
      return [];
    }

    // 1. 构建相似度矩阵
    const similarityMatrix = this.buildSimilarityMatrix(categories);

    // 2. 聚类相似分类
    const clusters = this.clusterCategories(categories, similarityMatrix);

    // 3. 合并每个聚类为一个分类
    const mergedCategories = clusters.map(cluster =>
      this.mergeCluster(cluster, categories)
    );

    // 4. 按书签数量降序排序
    mergedCategories.sort((a, b) => b.bookmarkIds.length - a.bookmarkIds.length);

    // 5. 过滤小分类（bookmarkIds < 2）
    const filteredCategories = mergedCategories.filter(cat => cat.bookmarkIds.length >= 2);

    // 6. 生成合并报告
    const report = this.generateMergeReport(categories.length, filteredCategories.length, clusters);

    return {
      categories: filteredCategories,
      report
    };
  }

  /**
   * 构建分类相似度矩阵
   * @param {Array} categories - 分类列表
   * @returns {Array[][]} 相似度矩阵（n x n）
   */
  buildSimilarityMatrix(categories) {
    const n = categories.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matrix[i][j] = this.calculateSimilarity(
          categories[i].name,
          categories[j].name
        );
        matrix[j][i] = matrix[i][j];
      }
    }

    return matrix;
  }

  /**
   * 计算两个分类名称的相似度
   * 组合多种相似度算法
   * @param {string} name1 - 分类名称1
   * @param {string} name2 - 分类名称2
   * @returns {number} 相似度（0-1）
   */
  calculateSimilarity(name1, name2) {
    // 1. 字符串相似度（Levenshtein Distance）
    const editSim = this.editDistanceSimilarity(name1, name2);

    // 2. 语义相似度（关键词提取）
    const semanticSim = this.semanticSimilarity(name1, name2);

    // 3. 包含关系（一个词是另一个的子串）
    const containmentSim = this.containmentSimilarity(name1, name2);

    // 加权组合
    return editSim * 0.3 + semanticSim * 0.5 + containmentSim * 0.2;
  }

  /**
   * 字符串编辑距离相似度
   * @param {string} str1 - 字符串1
   * @param {string} str2 - 字符串2
   * @returns {number} 相似度（0-1）
   */
  editDistanceSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    return maxLen > 0 ? 1 - (distance / maxLen) : 1;
  }

  /**
   * Levenshtein 距离算法
   * @param {string} str1 - 字符串1
   * @param {string} str2 - 字符串2
   * @returns {number} 编辑距离
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    // 初始化边界条件
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // 动态规划计算
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,      // 删除
            dp[i][j - 1] + 1,      // 插入
            dp[i - 1][j - 1] + 1   // 替换
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 语义相似度（基于关键词）
   * @param {string} name1 - 名称1
   * @param {string} name2 - 名称2
   * @returns {number} 相似度（0-1）
   */
  semanticSimilarity(name1, name2) {
    const keywords1 = this.extractKeywords(name1);
    const keywords2 = this.extractKeywords(name2);

    if (keywords1.length === 0 && keywords2.length === 0) {
      return 0;
    }

    // Jaccard 相似度
    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * 提取关键词（分词）
   * @param {string} text - 输入文本
   * @returns {Array<string>} 关键词列表
   */
  extractKeywords(text) {
    // 按空格、常见分隔符拆分
    const segments = text.split(/[\s\-、，,\/\\\[\]()（）]+/);

    // 中文按字符拆分（每个字都是一个潜在关键词）
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];

    // 英文单词（小写）
    const englishWords = segments
      .map(s => s.toLowerCase())
      .filter(s => /^[a-z]+$/i.test(s) && s.length >= 2);

    // 过滤停用词
    const stopWords = new Set([
      '的', '了', '和', '与', '或', '及', '等', 'a', 'an', 'the',
      'and', 'or', 'for', 'in', 'on', 'at', 'to', 'of', 'with'
    ]);

    const keywords = [
      ...chineseChars,
      ...englishWords.filter(w => !stopWords.has(w))
    ];

    return [...new Set(keywords)]; // 去重
  }

  /**
   * 包含关系相似度
   * @param {string} name1 - 名称1
   * @param {string} name2 - 名称2
   * @returns {number} 相似度（0-1）
   */
  containmentSimilarity(name1, name2) {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    // 完全包含关系
    if (n1.includes(n2) || n2.includes(n1)) {
      return 0.9;
    }

    // 部分包含关系（至少 3 个字符的子串）
    const minContainLen = 3;
    for (let i = 0; i <= n1.length - minContainLen; i++) {
      const substr = n1.substring(i, i + minContainLen);
      if (n2.includes(substr)) {
        return 0.7;
      }
    }

    return 0;
  }

  /**
   * 层次聚类合并相似分类
   * @param {Array} categories - 分类列表
   * @param {Array[][]} similarityMatrix - 相似度矩阵
   * @returns {Array<Array<number>>} 聚类列表（每个聚类是分类索引的数组）
   */
  clusterCategories(categories, similarityMatrix) {
    const n = categories.length;
    const clusters = Array.from({ length: n }, (_, i) => [i]);
    const merged = Array(n).fill(false);

    let changed = true;
    let iterations = 0;
    const maxIterations = 100; // 防止无限循环

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (let i = 0; i < n; i++) {
        if (merged[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (merged[j]) continue;

          // 检查相似度是否达到阈值
          if (similarityMatrix[i][j] >= this.similarityThreshold) {
            // 找到两个聚类
            const clusterI = clusters.find(c => c.includes(i));
            const clusterJ = clusters.find(c => c.includes(j));

            if (clusterI !== clusterJ) {
              // 合并聚类
              clusterI.push(...clusterJ);
              const index = clusters.indexOf(clusterJ);
              clusters.splice(index, 1);

              merged[j] = true;
              changed = true;
            }
          }
        }
      }
    }

    // 过滤掉只有一个元素的聚类（不需要合并）
    return clusters.filter(cluster => cluster.length >= this.minMergeSupport);
  }

  /**
   * 合并聚类为一个分类
   * @param {Array<number>} clusterIndices - 聚类中的分类索引
   * @param {Array} categories - 原始分类列表
   * @returns {Object} 合并后的分类
   */
  mergeCluster(clusterIndices, categories) {
    const clusterCategories = clusterIndices.map(i => categories[i]);

    // 选择最短的名字作为最终名称（通常最精确）
    const names = clusterCategories.map(c => c.name);
    const finalName = names.reduce((a, b) => a.length <= b.length ? a : b);

    // 合并所有 bookmarkIds
    const allBookmarkIds = clusterCategories.flatMap(c => c.bookmarkIds || []);
    const uniqueBookmarkIds = [...new Set(allBookmarkIds)];

    // 平均置信度
    const avgConfidence = clusterCategories.reduce(
      (sum, c) => sum + (c.confidence || 0.5),
      0
    ) / clusterCategories.length;

    // 检查是否有任何一个是新分类
    const isNew = clusterCategories.some(c => c.isNew);

    // 生成合并信息
    const mergedFrom = names.filter(n => n !== finalName);

    return {
      name: finalName,
      confidence: avgConfidence,
      bookmarkIds: uniqueBookmarkIds,
      isNew,
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
      _mergeInfo: {
        originalCount: clusterCategories.length,
        originalNames: names,
        similarityScores: clusterIndices.map(i => ({
          name: categories[i].name,
          merged: true
        }))
      }
    };
  }

  /**
   * 生成合并报告
   * @param {number} originalCount - 原始分类数量
   * @param {number} mergedCount - 合并后分类数量
   * @param {Array} clusters - 聚类列表
   * @returns {Object} 合并报告
   */
  generateMergeReport(originalCount, mergedCount, clusters) {
    const mergedGroups = clusters.filter(c => c.length > 1);
    const totalMerged = mergedGroups.reduce((sum, cluster) => sum + cluster.length - 1, 0);

    return {
      originalCount,
      mergedCount,
      reductionRate: originalCount > 0 ? ((originalCount - mergedCount) / originalCount * 100).toFixed(1) : 0,
      mergedGroups: mergedGroups.length,
      totalMerged,
      details: mergedGroups.map(cluster => ({
        mergedCount: cluster.length,
        categories: cluster.map(i => ({ index: i }))
      }))
    };
  }

  /**
   * 生成合并建议（用于 UI 展示）
   * @param {Array} categories - 分类列表
   * @returns {Array} 合并建议列表
   */
  generateMergeSuggestions(categories) {
    const suggestions = [];
    const used = new Set();

    for (let i = 0; i < categories.length; i++) {
      if (used.has(i)) continue;

      for (let j = i + 1; j < categories.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.calculateSimilarity(
          categories[i].name,
          categories[j].name
        );

        if (similarity >= this.similarityThreshold) {
          // 找到一个合并建议
          suggestions.push({
            source: categories[i].name,
            target: categories[j].name,
            confidence: similarity,
            reason: this.getMergeReason(categories[i].name, categories[j].name, similarity)
          });

          used.add(i);
          used.add(j);
        }
      }
    }

    // 按置信度降序排序
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 获取合并原因说明
   * @param {string} name1 - 名称1
   * @param {string} name2 - 名称2
   * @param {number} similarity - 相似度
   * @returns {string} 原因说明
   */
  getMergeReason(name1, name2, similarity) {
    const reasons = [];

    // 检查包含关系
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();
    if (n1.includes(n2) || n2.includes(n1)) {
      reasons.push('包含关系');
    }

    // 检查关键词重叠
    const k1 = this.extractKeywords(name1);
    const k2 = this.extractKeywords(name2);
    const overlap = k1.filter(k => k2.includes(k));
    if (overlap.length > 0) {
      reasons.push(`关键词重叠: ${overlap.join(', ')}`);
    }

    // 检查编辑距离
    const editSim = this.editDistanceSimilarity(name1, name2);
    if (editSim > 0.7) {
      reasons.push('拼写相似');
    }

    return reasons.length > 0 ? reasons.join('; ') : `语义相似度 ${Math.round(similarity * 100)}%`;
  }
}

export default CategoryMerger;
