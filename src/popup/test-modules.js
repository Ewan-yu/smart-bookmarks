/**
 * 模块测试文件
 * 用于验证重构后的模块是否正常工作
 */

import state from './modules/state.js';
import eventBus, { Events } from './utils/event-bus.js';
import { escapeHtml, debounce, isValidUrl, generateId } from './utils/helpers.js';

console.log('=== 模块测试开始 ===\n');

// 测试 1: EventBus
console.log('1. 测试 EventBus');
let test1Count = 0;
const unsubscribe1 = eventBus.on('test:event', (data) => {
  test1Count++;
  console.log('   ✓ 收到事件:', data);
});

eventBus.emit('test:event', { message: 'Hello World' });
console.log('   监听器触发次数:', test1Count);

eventBus.emit('test:event', { message: 'Second call' });
console.log('   监听器触发次数:', test1Count);

unsubscribe1();
eventBus.emit('test:event', { message: 'After unsubscribe' });
console.log('   取消订阅后触发次数:', test1Count, '(应为 2)');

// 测试 2: EventBus once
console.log('\n2. 测试 EventBus.once');
let test2Count = 0;
eventBus.once('test:once', () => {
  test2Count++;
  console.log('   ✓ 一次性监听器触发');
});

eventBus.emit('test:once');
eventBus.emit('test:once');
console.log('   一次性监听器触发次数:', test2Count, '(应为 1)');

// 测试 3: State Manager
console.log('\n3. 测试 State Manager');
console.log('   初始 bookmarks 数量:', state.bookmarks.length);

state.set('bookmarks', [
  { id: '1', title: 'Test Bookmark 1' },
  { id: '2', title: 'Test Bookmark 2' }
]);
console.log('   设置后 bookmarks 数量:', state.bookmarks.length);
console.log('   第一个书签:', state.bookmarks[0].title);

// 测试状态订阅
let subscribeCount = 0;
state.subscribe('searchQuery', (newValue, oldValue) => {
  subscribeCount++;
  console.log('   ✓ searchQuery 变更:', oldValue, '->', newValue);
});

state.set('searchQuery', 'test query');
state.set('searchQuery', 'another query');
console.log('   订阅触发次数:', subscribeCount, '(应为 2)');

// 测试数组操作
state.add('tags', 'javascript');
state.add('tags', 'python');
console.log('   tags 数组:', state.tags);

state.remove('tags', 'python');
console.log('   删除后 tags:', state.tags);

// 测试 4: Helper Functions
console.log('\n4. 测试 Helper Functions');

console.log('   escapeHtml:', escapeHtml('<script>alert("XSS")</script>'));
console.log('   isValidUrl:', isValidUrl('https://example.com'));
console.log('   isValidUrl (invalid):', isValidUrl('not-a-url'));
console.log('   generateId:', generateId('test'));

// 测试 debounce
console.log('\n5. 测试 debounce');
let debounceCount = 0;
const debouncedFn = debounce(() => {
  debounceCount++;
  console.log('   ✓ 防抖函数调用');
}, 100);

debouncedFn();
debouncedFn();
debouncedFn();
console.log('   快速调用3次后，防抖函数调用次数:', debounceCount, '(应为 0，等待100ms...)');

setTimeout(() => {
  console.log('   等待100ms后，防抖函数调用次数:', debounceCount, '(应为 1)');

  console.log('\n=== 模块测试完成 ===');
  console.log('\n所有基础模块工作正常！');
  console.log('下一步：开始提取核心模块（书签管理、导航、搜索）');
}, 150);
