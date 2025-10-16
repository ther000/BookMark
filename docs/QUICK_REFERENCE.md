# 🚀 快速参考指南

## 📂 快速定位文件

### 需要修改核心功能？
```
📍 src/core/
   ├── storage.js       - 数据存储和同步
   ├── ai.js            - AI 标签建议
   ├── utils.js         - 工具函数
   ├── performance.js   - 性能优化
   └── import-export.js - 导入导出
```

### 需要修改侧边栏？
```
📍 src/pages/sidepanel/
   ├── sidepanel.html               - 页面结构
   ├── sidepanel.js                 - 主要逻辑
   ├── sidepanel.css                - 页面样式
   └── extensions-integration.js    - 扩展功能集成
```

### 需要修改设置页面？
```
📍 src/pages/settings/
   ├── settings.html    - 页面结构
   ├── settings.js      - 设置逻辑
   └── settings.css     - 页面样式
```

### 需要修改管理器？
```
📍 src/pages/manager/
   ├── manager.html     - 页面结构
   ├── manager.js       - 管理逻辑
   └── manager.css      - 页面样式
```

### 需要修改弹出窗口？
```
📍 src/pages/popup/
   ├── popup.html       - 页面结构
   ├── popup.js         - 弹窗逻辑
   └── popup.css        - 页面样式
```

### 需要修改后台服务？
```
📍 src/background/
   └── background.js    - Service Worker
```

### 需要修改共享样式？
```
📍 src/styles/
   └── extensions.css   - 扩展功能样式
```

---

## 🔗 路径引用速查

### 从页面引用核心模块
```html
<!-- 在 src/pages/xxx/xxx.html 中 -->
<script src="../../core/storage.js"></script>
<script src="../../core/ai.js"></script>
<script src="../../core/utils.js"></script>
<script src="../../core/performance.js"></script>
<script src="../../core/import-export.js"></script>
```

### 从页面引用共享样式
```html
<!-- 在 src/pages/xxx/xxx.html 中 -->
<link rel="stylesheet" href="../../styles/extensions.css">
```

### 在页面内引用本地文件
```html
<!-- 在 src/pages/xxx/xxx.html 中 -->
<link rel="stylesheet" href="xxx.css">
<script src="xxx.js"></script>
```

### 在 manifest.json 中引用
```json
{
  "side_panel": {
    "default_path": "src/pages/sidepanel/sidepanel.html"
  },
  "background": {
    "service_worker": "src/background/background.js"
  },
  "options_page": "src/pages/settings/settings.html"
}
```

### 动态加载资源
```javascript
// 在任何 JS 文件中
const iconUrl = chrome.runtime.getURL('icons/icon128.png');
const dataUrl = chrome.runtime.getURL('src/pages/xxx/data.json');
```

---

## 📝 常见任务

### 添加新页面

1. **创建目录**
```bash
New-Item -ItemType Directory -Path "src/pages/newpage"
```

2. **创建文件**
```bash
# 在 src/pages/newpage/ 目录下
New-Item -ItemType File -Path "newpage.html"
New-Item -ItemType File -Path "newpage.js"
New-Item -ItemType File -Path "newpage.css"
```

3. **在 HTML 中引用核心模块**
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="newpage.css">
  <link rel="stylesheet" href="../../styles/extensions.css">
</head>
<body>
  <!-- 页面内容 -->
  
  <script src="../../core/storage.js"></script>
  <script src="../../core/utils.js"></script>
  <script src="newpage.js"></script>
</body>
</html>
```

4. **在 manifest.json 中注册（如需要）**
```json
{
  "options_page": "src/pages/newpage/newpage.html"
}
```

### 添加新核心模块

1. **创建文件**
```bash
New-Item -ItemType File -Path "src/core/newmodule.js"
```

2. **在需要的页面引用**
```html
<script src="../../core/newmodule.js"></script>
```

### 修改共享样式

1. **编辑文件**
```bash
# 编辑 src/styles/extensions.css
code src/styles/extensions.css
```

2. **确保页面已引用**
```html
<link rel="stylesheet" href="../../styles/extensions.css">
```

---

## 🔍 调试技巧

### 查看文件引用关系
```powershell
# 查找某个文件在哪里被引用
Select-String -Path "src/**/*.html" -Pattern "storage.js"
```

### 检查路径错误
```powershell
# 检查所有 HTML 文件中的 script 标签
Get-ChildItem -Path "src" -Recurse -Filter "*.html" | 
  ForEach-Object { 
    Write-Host $_.FullName -ForegroundColor Cyan
    Select-String -Path $_.FullName -Pattern "<script"
  }
```

### 验证所有路径
```powershell
# 列出所有被引用的文件
Get-ChildItem -Path "src" -Recurse -Filter "*.html" | 
  Select-String -Pattern 'src="[^"]*"' -AllMatches
```

---

## ⚡ 性能提示

### 页面加载顺序
```html
<!-- 推荐顺序 -->
1. CSS 文件（放在 <head> 中）
2. 工具函数（utils.js）
3. 核心模块（storage.js, ai.js 等）
4. 扩展功能（extensions-integration.js）
5. 页面逻辑（xxx.js）
```

### 减少重复加载
- 核心模块只在需要时加载
- 不要在多个地方重复引用同一个文件
- 使用共享样式文件

### 异步加载
```html
<!-- 非关键 JS 可以异步加载 -->
<script src="xxx.js" defer></script>
<script src="xxx.js" async></script>
```

---

## 🛠️ 开发工具命令

### PowerShell 快捷命令

```powershell
# 查看项目统计
$files = Get-ChildItem -Path "src" -Recurse -File
Write-Host "总文件数: $($files.Count)"
Write-Host "总大小: $([math]::Round(($files | Measure-Object -Property Length -Sum).Sum/1KB, 2)) KB"

# 查找特定类型文件
Get-ChildItem -Path "src" -Recurse -Filter "*.js"
Get-ChildItem -Path "src" -Recurse -Filter "*.css"
Get-ChildItem -Path "src" -Recurse -Filter "*.html"

# 搜索代码
Select-String -Path "src/**/*.js" -Pattern "function.*\("

# 查看目录树
tree /F src

# 快速打开文件
code src/pages/sidepanel/sidepanel.js
code src/core/storage.js
```

### Git 命令

```bash
# 查看文件移动历史
git log --follow src/core/storage.js

# 查看重构前后对比
git diff HEAD~1

# 恢复特定文件
git checkout HEAD~1 -- src/core/storage.js
```

---

## 📚 相关文档

- **详细结构说明**: [src/FILE_STRUCTURE.md](../src/FILE_STRUCTURE.md)
- **重构计划**: [RESTRUCTURE_PLAN.md](RESTRUCTURE_PLAN.md)
- **完成报告**: [RESTRUCTURE_COMPLETE.md](RESTRUCTURE_COMPLETE.md)
- **项目README**: [README.md](../README.md)

---

## 💡 最佳实践

### ✅ 推荐
- 使用相对路径引用
- 保持目录结构清晰
- 相关文件放在同一目录
- 核心功能独立模块
- 添加代码注释

### ❌ 避免
- 绝对路径（会导致部署问题）
- 跨目录的复杂引用
- 将页面文件放在 core/ 目录
- 将核心模块放在 pages/ 目录
- 重复代码

---

## 🔧 常见问题

### Q: 为什么我的页面打不开？
**A**: 检查 manifest.json 中的路径是否正确，应该是 `src/pages/xxx/xxx.html`

### Q: 为什么 JS 文件加载失败？
**A**: 检查 HTML 中的 script 标签路径，从页面到核心模块应该是 `../../core/xxx.js`

### Q: 如何添加新功能？
**A**: 
1. 如果是可复用的核心功能 → 在 `src/core/` 添加
2. 如果是特定页面功能 → 在对应页面目录添加
3. 如果是新页面 → 在 `src/pages/` 创建新目录

### Q: 样式文件放哪里？
**A**:
- 页面特定样式 → 放在页面目录内（如 `sidepanel.css`）
- 共享样式 → 放在 `src/styles/extensions.css`

### Q: 如何调试？
**A**: 
1. 打开 Chrome DevTools
2. Sources 面板会显示完整路径
3. 可以在源文件中设置断点
4. Console 中的错误会显示具体文件路径

---

**最后更新**: 2025年10月14日  
**维护者**: 项目团队
