# 配额错误快速修复指南

## 🚨 错误信息

```
Resource::kQuotaBytesPerItem quota exceeded
```

## ⚡ 快速解决

### 已完成的修复（v2.0.1）

扩展已自动修复此问题，只需：

1. **重新加载扩展**
   ```
   chrome://extensions/ → 找到扩展 → 点击刷新按钮
   ```

2. **打开侧边栏**
   - 数据会自动从 sync storage 迁移到 local storage
   - 控制台会显示：`✅ Successfully migrated bookmarkMetadata to local storage`

3. **验证**
   - 添加/编辑书签标签
   - 执行去重操作
   - 不应再出现配额错误

## 🔍 检查迁移状态

打开浏览器控制台（F12），执行：

```javascript
// 检查迁移状态
chrome.storage.local.get(['migrated'], (result) => {
  console.log('已迁移:', result.migrated);
});

// 检查数据大小
chrome.storage.local.get(['bookmarkMetadata'], (result) => {
  const size = JSON.stringify(result.bookmarkMetadata || {}).length;
  console.log('数据大小:', (size / 1024).toFixed(2), 'KB');
  console.log('书签数:', Object.keys(result.bookmarkMetadata || {}).length);
});
```

## 📊 存储对比

| 存储类型 | 限制 | 使用前 | 使用后 |
|---------|------|--------|--------|
| sync | 8 KB/项 | ❌ 超限 | - |
| local | 5 MB/总 | - | ✅ 充足 |

## 🛠️ 手动修复（如果自动迁移失败）

### 方法 1：清除并重新导入

```javascript
// 1. 导出当前数据（如果可以）
// 使用扩展的导出功能保存 JSON

// 2. 清除存储
chrome.storage.sync.clear();
chrome.storage.local.clear();

// 3. 重新加载扩展

// 4. 导入备份的数据
```

### 方法 2：强制迁移

```javascript
// 在控制台执行
(async () => {
  // 读取旧数据
  const sync = await chrome.storage.sync.get(['bookmarkMetadata']);
  console.log('旧数据:', sync.bookmarkMetadata);
  
  // 写入新位置
  await chrome.storage.local.set({ 
    bookmarkMetadata: sync.bookmarkMetadata || {},
    migrated: true
  });
  
  console.log('✅ 手动迁移完成');
  
  // 验证
  const local = await chrome.storage.local.get(['bookmarkMetadata']);
  console.log('新数据:', local.bookmarkMetadata);
})();
```

## 📝 注意事项

### ⚠️ 数据同步变化

迁移后，书签元数据（标签和颜色）**不再跨设备同步**。

**影响**：
- 在设备 A 添加的标签不会自动出现在设备 B
- 需要手动导出/导入来同步

**建议**：
- 定期使用导出功能备份
- 使用导入功能在不同设备间同步

### ✅ 书签本身仍同步

Chrome 的原生书签同步**不受影响**：
- 书签本身（标题、URL）仍会跨设备同步
- 只是扩展添加的元数据（标签、颜色）不同步

## 📦 备份建议

### 导出数据

1. 点击工具栏的 📥 导入/导出按钮
2. 选择"导出"标签页
3. 选择 JSON 格式（包含元数据）
4. 点击"导出书签"

### 导入数据

1. 点击工具栏的 📥 导入/导出按钮
2. 选择"导入"标签页
3. 选择之前导出的 JSON 文件
4. 点击"开始导入"

## 🐛 仍然出错？

如果问题仍然存在：

1. **检查扩展版本**
   - 确保版本 ≥ v2.0.1
   - 查看 `manifest.json` 中的版本号

2. **完全重装扩展**
   ```
   1. 导出所有数据（备份）
   2. 卸载扩展
   3. 清除浏览器缓存
   4. 重新安装扩展
   5. 导入备份数据
   ```

3. **查看控制台错误**
   - 打开侧边栏
   - 按 F12 打开开发者工具
   - 查看 Console 标签页中的错误信息
   - 复制完整错误报告

4. **提交 Issue**
   - 访问项目 GitHub 页面
   - 提供详细错误信息和书签数量
   - 附上控制台截图

## 📈 预期性能

迁移后，应该能够支持：

| 书签数量 | 标签数量 | 状态 |
|---------|---------|------|
| < 100 | 无限制 | ✅ 完美 |
| 100-500 | 无限制 | ✅ 流畅 |
| 500-1000 | 无限制 | ✅ 良好 |
| 1000-5000 | 无限制 | ✅ 可用 |
| > 5000 | 无限制 | ⚠️ 可能变慢 |

## 🔗 相关文档

- [完整迁移说明](STORAGE_MIGRATION.md)
- [存储架构设计](../src/FILE_STRUCTURE.md)
- [导入导出指南](DEDUPLICATION.md)

---

**最后更新**: 2025-01-14  
**适用版本**: v2.0.1+
