// 调试 CategoryMerger 的相似度计算
import CategoryMerger from './src/utils/category-merger.js';

const merger = new CategoryMerger({
  similarityThreshold: 0.65,
  minMergeSupport: 2
});

// 测试 "系统架构" vs "架构设计"
const name1 = "系统架构";
const name2 = "架构设计";

console.log(`=== 调试: "${name1}" vs "${name2}" ===\n`);

// 1. 编辑距离
const editDist = merger.levenshteinDistance(name1, name2);
const maxLen = Math.max(name1.length, name2.length);
const editSim = 1 - (editDist / maxLen);
console.log(`1. 编辑距离: ${editDist}`);
console.log(`   编辑距离相似度: ${editSim.toFixed(4)}`);

// 2. 语义相似度
const k1 = merger.extractKeywords(name1);
const k2 = merger.extractKeywords(name2);
const intersection = k1.filter(k => k2.includes(k));
const union = [...new Set([...k1, ...k2])];
const semanticSim = union.length > 0 ? intersection.length / union.length : 0;
console.log(`\n2. 语义相似度:`);
console.log(`   关键词1: [${k1.join(', ')}]`);
console.log(`   关键词2: [${k2.join(', ')}]`);
console.log(`   交集: [${intersection.join(', ')}]`);
console.log(`   并集: [${union.join(', ')}]`);
console.log(`   Jaccard: ${semanticSim.toFixed(4)}`);

// 3. 字符重叠
const chars1 = name1.match(/[\u4e00-\u9fa5]/g) || [];
const chars2 = name2.match(/[\u4e00-\u9fa5]/g) || [];
const charInter = chars1.filter(c => chars2.includes(c));
const charUnion = [...new Set([...chars1, ...chars2])];
const charOverlapSim = charUnion.length > 0 ? charInter.length / charUnion.length : 0;
console.log(`\n3. 字符重叠相似度:`);
console.log(`   字符1: [${chars1.join(', ')}]`);
console.log(`   字符2: [${chars2.join(', ')}]`);
console.log(`   交集: [${charInter.join(', ')}]`);
console.log(`   Jaccard: ${charOverlapSim.toFixed(4)}`);

// 4. 子串重叠
const extractSubs = (str) => {
  const subs = [];
  for (let len = 2; len <= Math.min(3, str.length); len++) {
    for (let i = 0; i <= str.length - len; i++) {
      subs.push(str.substring(i, i + len));
    }
  }
  return subs;
};
const subs1 = extractSubs(name1);
const subs2 = extractSubs(name2);
const subInter = subs1.filter(s => subs2.includes(s));
const subUnion = [...new Set([...subs1, ...subs2])];
const subSim = subUnion.length > 0 ? subInter.length / subUnion.length : 0;
console.log(`\n4. 子串重叠相似度:`);
console.log(`   子串1: [${subs1.join(', ')}]`);
console.log(`   子串2: [${subs2.join(', ')}]`);
console.log(`   交集: [${subInter.join(', ')}]`);
console.log(`   Jaccard: ${subSim.toFixed(4)}`);

// 5. 包含关系
const containmentSim = merger.containmentSimilarity(name1, name2);
console.log(`\n5. 包含关系相似度: ${containmentSim.toFixed(4)}`);

// 6. 总相似度
const totalSim = merger.calculateSimilarity(name1, name2);
console.log(`\n6. 总相似度: ${totalSim.toFixed(4)}`);
console.log(`   阈值: ${merger.similarityThreshold}`);
console.log(`   是否合并: ${totalSim >= merger.similarityThreshold ? '是' : '否'}`);
