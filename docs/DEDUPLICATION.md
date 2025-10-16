# 书签去重功能说明

## 功能概述

书签去重功能可以帮助您识别和清理重复的书签，保持书签库的整洁。该功能支持智能 URL 匹配和灵活的去重选项。

## 主要特性

### 1. 智能重复检测
- **URL 标准化**：自动忽略协议（http/https）、www 前缀、末尾斜杠等差异
- **分组展示**：将相同 URL 的书签归为一组
- **统计信息**：显示重复组数和重复书签总数

### 2. 灵活的去重选项
- **手动选择保留**：在每组重复书签中选择要保留的一个
- **默认保留最新**：自动选中添加时间最新的书签
- **单个删除**：可以单独删除某个重复书签
- **批量去重**：一键自动处理所有重复组

### 3. 元数据合并
- **标签合并**：删除重复书签时，会将所有标签合并到保留的书签上
- **颜色保留**：保留书签的颜色标记
- **无数据丢失**：确保所有元数据都被保留

## 使用方法

### 扫描重复书签

1. 点击侧边栏顶部工具栏的 **去重按钮**（立方体图标）
2. 在弹出的对话框中点击 **"扫描重复"** 按钮
3. 等待扫描完成，查看检测结果

### 手动去重

1. 完成扫描后，浏览重复书签列表
2. 在每组重复中：
   - 查看每个书签的详细信息（标题、添加时间、标签）
   - 选择要保留的书签（默认已选中最新的）
   - 可以点击 **"查看"** 按钮在新标签页中打开书签
   - 可以点击 **"删除"** 按钮单独删除某个书签
3. 选择完成后，点击 **"自动去重"** 按钮批量处理

### 自动去重

1. 扫描完成后，直接点击 **"自动去重"** 按钮
2. 系统会：
   - 保留每组中选中的书签（默认最新的）
   - 删除其他重复书签
   - 合并所有标签和元数据到保留的书签上
3. 操作完成后显示处理结果

## URL 标准化规则

去重功能使用以下规则来判断 URL 是否重复：

- 忽略协议（http 和 https 视为相同）
- 忽略 www 前缀（www.example.com 和 example.com 视为相同）
- 忽略末尾斜杠（example.com/path 和 example.com/path/ 视为相同）
- 忽略查询参数和片段标识符
- URL 比较不区分大小写

### 示例

以下 URL 会被识别为重复：
```
http://www.example.com/page
https://example.com/page
https://www.example.com/page/
HTTPS://EXAMPLE.COM/PAGE
```

## 技术实现

### 核心方法（storage.js）

#### `findDuplicateBookmarks()`
检测所有重复书签，返回按 URL 分组的重复书签对象。

```javascript
const duplicates = await Storage.findDuplicateBookmarks();
// 返回格式：
// {
//   "example.com/page": [
//     { id: "1", title: "Page 1", url: "...", dateAdded: 123456, parentId: "..." },
//     { id: "2", title: "Page 2", url: "...", dateAdded: 123457, parentId: "..." }
//   ],
//   ...
// }
```

#### `normalizeUrl(url)`
标准化 URL 用于比较。

```javascript
const normalized = Storage.normalizeUrl("https://www.example.com/page/");
// 返回: "example.com/page"
```

#### `removeDuplicateBookmarks(bookmarkIds, keepId)`
删除重复书签，保留指定的一个，并合并元数据。

```javascript
const result = await Storage.removeDuplicateBookmarks(
  ["id1", "id2", "id3"],  // 所有重复书签 ID
  "id1"                    // 要保留的书签 ID
);
// 返回: { success: 2, failed: 0 }
```

#### `mergeDuplicateMetadata(bookmarkIds, keepId)`
合并重复书签的元数据（标签和颜色）到保留的书签。

#### `autoDeduplicateBookmarks(duplicates)`
自动去重，保留每组中最新的书签。

```javascript
const result = await Storage.autoDeduplicateBookmarks(duplicates);
// 返回: { totalGroups: 10, totalRemoved: 15, totalFailed: 0 }
```

## 注意事项

1. **不可撤销**：删除操作无法撤销，建议先导出书签备份
2. **元数据合并**：删除书签前会自动合并标签和颜色
3. **父文件夹保留**：保留的书签会保持在原来的文件夹位置
4. **手动检查**：建议在自动去重前先手动检查重复列表
5. **网络书签**：某些网站的书签可能有参数差异但实际指向同一页面

## 界面说明

### 去重对话框

- **顶部统计区域**：显示重复组数和重复书签总数
- **重复组列表**：
  - 组头部：显示标准化的 URL 和重复数量
  - 组内容：显示该组所有重复书签的详细信息
  - 单选按钮：选择要保留的书签
  - 操作按钮：查看或删除单个书签
- **底部按钮区域**：
  - "扫描重复"：开始扫描或重新扫描
  - "自动去重"：批量处理所有重复组
  - "关闭"：关闭对话框

### 书签信息显示

每个重复书签显示以下信息：
- Favicon 图标
- 书签标题
- 添加时间（相对时间显示）
- 标签列表（最多显示3个，超过显示 +N）

## 性能优化

- 扫描操作异步执行，不会阻塞界面
- 使用 Map 数据结构提高分组效率
- 批量操作使用 Promise 并发处理
- 大量重复时自动限制显示标签数量

## 未来改进

- [ ] 支持模糊匹配（标题相似度检测）
- [ ] 支持批量选择保留规则（最新/最旧/标签最多等）
- [ ] 导出去重报告
- [ ] 撤销最近一次去重操作
- [ ] 预览去重后的效果
