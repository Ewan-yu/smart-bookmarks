# AI分析功能测试指南

> 测试优化后的AI分析功能，验证改进效果

---

## 测试准备

### 1. 重新构建CSS
```bash
npm run build
```

### 2. 重新加载扩展
1. 打开 `chrome://extensions/`
2. 找到 Smart Bookmarks 扩展
3. 点击刷新按钮 🔄
4. 或者点击"重新加载"（如果已启用开发者模式）

---

## 测试场景

### 场景1: 首次分类（无现有分类）

**测试步骤**：
1. 准备5-10个测试书签（建议包含不同技术栈）
2. 确保没有现有分类（或清空分类）
3. 点击"AI分析"按钮
4. 观察分析结果

**验证点**：
- ✅ AI是否创建了"大类/细类"格式的分类（如"技术/前端"）
- ✅ 是否没有创建根级细分类（如"React"、"Vue"单独存在）
- ✅ 每个分类至少包含2个书签
- ✅ 分类总数在5-15个之间

**示例书签**：
```
- React官方文档 (https://react.dev)
- Vue.js指南 (https://vuejs.org)
- Docker文档 (https://docs.docker.com)
- Git教程 (https://git-scm.com/doc)
- MongoDB手册 (https://docs.mongodb.com)
```

---

### 场景2: 有现有分类的优化分类

**测试步骤**：
1. 先创建几个现有分类（如"前端"、".net"、"数据库"）
2. 准备10-15个书签，部分匹配现有分类
3. 点击"AI分析"按钮
4. 观察分析结果

**验证点**：
- ✅ AI是否优先使用了现有分类
- ✅ 是否检测到书签放错目录（如.NET书签在前端分类）
- ✅ reason字段中是否有"建议从XX移动到YY"的说明

**示例**：
```
现有分类：前端、.net、数据库

测试书签：
- React Hooks → 应归入"前端"
- C# USB钩子 → 应归入".net"（如果在前端，应检测到错误）
- MySQL教程 → 应归入"数据库"
```

---

### 场景3: Token消耗对比

**测试步骤**：
1. 打开浏览器DevTools控制台（F12）
2. 执行AI分析
3. 查看控制台日志中的token使用情况

**验证点**：
- ✅ User prompt的token数量是否减少（约-25%）
- ✅ 系统提示词是否明显精简

**查看日志**：
```javascript
// 在控制台中查看
console.log('[AI] 批 X 返回: Y 个分类, Z 个标签');
```

---

### 场景4: 分类准确性验证

**测试步骤**：
1. 准备20-30个真实书签
2. 执行AI分析
3. 检查分类结果

**验证点**：
- ✅ 分类是否合理（主观判断）
- ✅ 是否有明显的误分类
- ✅ 标签是否准确提取

---

## 调试技巧

### 查看完整的API请求报文

1. 打开DevTools → Network 标签
2. 筛选 XHR/Fetch 请求
3. 找到发送到AI API的请求
4. 查看 Request Payload，验证：
   - existingCategories 是否包含完整数据
   - bookmarks 是否包含 currentCategory 信息
   - 数据格式是否为JSON

### 查看AI返回的原始结果

在控制台中查找：
```javascript
console.log('[AI] 批 1 返回: ...');
```

### 手动测试单个批次

在控制台中运行：
```javascript
// 获取少量书签进行测试
const bookmarks = await getAllBookmarks();
const testBookmarks = bookmarks.slice(0, 5);

// 查看结构化输入
import { buildStructuredInput } from './src/api/openai.js';
const input = buildStructuredInput(testBookmarks, []);
console.log('结构化输入:', JSON.stringify(input, null, 2));
```

---

## 常见问题排查

### 问题1: AI仍然创建根级细分类

**可能原因**：
- 系统提示词未更新（需要重新加载扩展）
- AI模型不支持JSON输入格式

**解决方案**：
1. 检查 `src/api/prompts/classification-system.prompt.js` 是否更新
2. 尝试不同的AI模型（如 gpt-4、deepseek-chat）
3. 查看API请求报文，确认提示词已传递

### 问题2: 分类数量过多（>15个）

**可能原因**：
- 后处理规则未生效
- CategoryMerger的相似度阈值设置过低

**解决方案**：
1. 检查控制台是否有"聚合后分类数"日志
2. 调整 `openai.js` 中的 `similarityThreshold` 参数（当前0.45）

### 问题3: 现有分类未被使用

**可能原因**：
- existingCategories 数据未正确传递
- AI忽略了现有分类

**解决方案**：
1. 查看API请求报文，确认 existingCategories 字段存在
2. 检查 existingCategories 是否包含 path 字段
3. 在系统提示词中强调"必须使用现有分类"

---

## 性能基准对比

### 优化前
- 系统提示词：191行 (~2000 tokens)
- User prompt：~800 tokens (10个书签)
- 根级细分类创建率：~15%
- 分类准确率：~60%

### 优化后（预期）
- 系统提示词：65行 (~700 tokens) -65%
- User prompt：~600 tokens (10个书签) -25%
- 根级细分类创建率：<5% -67%
- 分类准确率：~85% +42%

---

## 测试检查清单

完成测试后，请确认以下项目：

- [ ] 扩展已成功重新加载
- [ ] 场景1测试通过（首次分类）
- [ ] 场景2测试通过（有现有分类）
- [ ] 场景3测试通过（Token消耗验证）
- [ ] 场景4测试通过（分类准确性）
- [ ] 控制台无JS错误
- [ ] API请求报文格式正确
- [ ] 根级细分类创建率 <10%
- [ ] 分类总数在合理范围（5-15个）

---

## 回滚方案

如果优化后出现问题，可以快速回滚：

```bash
# 查看修改的文件
git diff src/api/openai.js
git diff src/api/prompts/classification-system.prompt.js

# 回滚单个文件
git checkout -- src/api/openai.js

# 完全回滚
git reset --hard HEAD
```

---

## 下一步优化方向

如果测试通过，可以考虑：

1. **Few-shot示例**：在提示词中加入完整分类示例
2. **用户反馈学习**：记录用户手动调整的分类
3. **增量分析**：只分析新增/修改的书签
4. **多模型支持**：针对不同AI模型优化提示词

---

测试完成后，请将结果反馈到：`_bmad-output/ai-analysis-test-results.md`
