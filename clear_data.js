// 在 popup 的 Console 中执行此脚本
async function clearAndReimport() {
  // 1. 删除数据库
  console.log('正在删除数据库...');
  const deletePromise = new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('SmartBookmarksDB');
    req.onsuccess = resolve;
    req.onerror = reject;
  });
  await deletePromise;
  console.log('数据库已删除');
  
  // 2. 刷新页面
  location.reload();
}

clearAndReimport();
