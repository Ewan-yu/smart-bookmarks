// 测试模块导入
import CategoryMerger from './src/utils/category-merger.js';

console.log('✓ CategoryMerger imported successfully');

// 测试实例化
const merger = new CategoryMerger();
console.log('✓ CategoryMerger instantiated successfully');

// 测试相似度计算
const similarity = merger.calculateSimilarity('系统架构', '架构设计');
console.log(`✓ Similarity calculated: ${similarity}`);

console.log('\n✓ All imports work correctly!');
