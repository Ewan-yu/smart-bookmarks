// 测试 CategoryMerger 的相似度计算
import CategoryMerger from './src/utils/category-merger.js';

const merger = new CategoryMerger({
  similarityThreshold: 0.75,
  minMergeSupport: 2
});

// 测试用例
const testCases = [
  ['系统架构', '架构设计'],
  ['前端开发', '前端UI'],
  ['前端开发', '后端开发'],
  ['React', 'React.js'],
  ['机器学习', '深度学习'],
];

console.log('=== 相似度计算测试 ===\n');

testCases.forEach(([name1, name2]) => {
  // 提取关键词
  const k1 = merger.extractKeywords(name1);
  const k2 = merger.extractKeywords(name2);

  // 计算相似度
  const similarity = merger.calculateSimilarity(name1, name2);

  console.log(`${name1} vs ${name2}`);
  console.log(`  关键词1: [${k1.join(', ')}]`);
  console.log(`  关键词2: [${k2.join(', ')}]`);
  console.log(`  相似度: ${similarity.toFixed(4)}`);
  console.log();
});

// 测试合并功能
console.log('=== 分类合并测试 ===\n');

const mockCategories = [
  { name: '系统架构', bookmarkIds: ['1', '2'] },
  { name: '架构设计', bookmarkIds: ['3'] },
  { name: '前端开发', bookmarkIds: ['4', '5'] },
  { name: '后端开发', bookmarkIds: ['6'] },
];

const result = merger.mergeCategories(mockCategories);

console.log(`原始分类数: ${mockCategories.length}`);
console.log(`合并后分类数: ${result.categories.length}`);
console.log(`减少率: ${result.report.reductionRate}%`);
console.log(`合并组数: ${result.report.mergedGroups}`);
console.log('\n合并后的分类:');
result.categories.forEach(cat => {
  console.log(`  - ${cat.name} (${cat.bookmarkIds.length}个书签)`);
  if (cat.mergedFrom) {
    console.log(`    合并自: [${cat.mergedFrom.join(', ')}]`);
  }
});
