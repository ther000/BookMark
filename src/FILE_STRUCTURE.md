# 项目文件结构说明

## 📁 目录结构

```
BookMark/
├── 📄 manifest.json          # Chrome 扩展配置文件
├── 📄 package.json           # 项目配置
├── 📄 LICENSE                # 许可证
├── 📄 README.md              # 项目说明文档
├── 📄 .gitignore             # Git 忽略配置
│
├── 📚 docs/                  # 文档目录
│   ├── UPGRADE_GUIDE.md              # 升级指南
│   ├── IMPLEMENTATION_SUMMARY.md     # 实现总结
│   ├── REMOVED_FEATURES.md           # 已移除功能记录
│   ├── SETTINGS_CHANGES.md           # 设置页面变更记录
│   ├── RESTRUCTURE_PLAN.md           # 重构计划
│   └── CHANGELOG_V2.md               # 变更日志 v2
│
├── 🎨 icons/                 # 图标资源
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── icon-template.svg
│   └── README.md
│
└── 📦 src/                   # 源代码目录
    │
    ├── ⚙️ background/        # 后台服务
    │   └── background.js           # Service Worker
    │
    ├── 🔧 core/              # 核心功能模块
    │   ├── storage.js              # 数据存储层
    │   ├── ai.js                   # AI 功能
    │   ├── utils.js                # 工具函数库
    │   ├── performance.js          # 性能优化
    │   └── import-export.js        # 导入导出功能
    │
    ├── 📄 pages/             # 页面文件
    │   │
    │   ├── sidepanel/              # 侧边栏（主界面）
    │   │   ├── sidepanel.html
    │   │   ├── sidepanel.js
    │   │   ├── sidepanel.css
    │   │   └── extensions-integration.js
    │   │
    │   ├── popup/                  # 弹出窗口
    │   │   ├── popup.html
    │   │   ├── popup.js
    │   │   └── popup.css
    │   │
    │   ├── settings/               # 设置页面
    │   │   ├── settings.html
    │   │   ├── settings.js
    │   │   └── settings.css
    │   │
    │   └── manager/                # 管理器页面
    │       ├── manager.html
    │       ├── manager.js
    │       └── manager.css
    │
    └── 🎨 styles/            # 共享样式
        └── extensions.css          # 扩展功能样式

```

## 📖 模块说明

### 🔧 核心模块 (src/core/)

#### storage.js
- 数据存储和同步
- Chrome Storage API 封装
- 书签元数据管理
- 标签管理

#### ai.js
- AI 标签建议
- OpenAI/DeepSeek API 集成
- 内容分析和关键词提取

#### utils.js
- 通用工具函数
- 防抖和节流
- 数据验证
- HTML 转义
- DOM 操作助手

#### performance.js
- 缓存机制
- 虚拟滚动
- 懒加载
- 性能监控

#### import-export.js
- JSON 格式导入导出
- HTML 格式导入导出
- 数据验证
- 重复检测

### 📄 页面模块 (src/pages/)

#### sidepanel/
主界面 - Chrome 侧边栏
- **sidepanel.html**: 页面结构
- **sidepanel.js**: 主要逻辑
- **sidepanel.css**: 页面样式
- **extensions-integration.js**: 扩展功能集成

功能：
- 书签列表展示
- 标签筛选
- 颜色分类
- 搜索功能
- 拖拽排序
- AI 标签建议

#### settings/
设置页面
- AI 配置
- 主题设置
- 隐私政策

#### manager/
书签管理器（独立页面）
- 完整的书签管理界面
- 批量操作
- 高级筛选

#### popup/
弹出窗口（已废弃？）
- 快速访问入口
- 简单的书签操作

### ⚙️ 后台服务 (src/background/)

#### background.js
Service Worker
- 扩展初始化
- 侧边栏控制
- 消息传递

### 🎨 样式文件 (src/styles/)

#### extensions.css
共享样式
- 导入导出对话框
- Toast 通知
- 加载指示器
- 空状态样式

## 🔗 路径引用规范

### 从页面到核心模块
```html
<script src="../../core/storage.js"></script>
<script src="../../core/ai.js"></script>
<script src="../../core/utils.js"></script>
```

### 从页面到共享样式
```html
<link rel="stylesheet" href="../../styles/extensions.css">
```

### 页面内部文件
```html
<link rel="stylesheet" href="sidepanel.css">
<script src="sidepanel.js"></script>
```

### manifest.json 引用
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

## 📊 文件统计

### 代码量
- 核心模块: ~56KB (5 文件)
- 侧边栏: ~113KB (4 文件)
- 设置页面: ~18KB (3 文件)
- 管理器: ~39KB (3 文件)
- 弹出窗口: ~20KB (3 文件)
- 后台服务: ~1KB (1 文件)
- 样式: ~8KB (1 文件)

**总计**: ~255KB, 20 个源文件

### 文档
- 6 个 Markdown 文档
- 总计约 30KB

## 🎯 优势

### 1. 清晰的模块边界
- 核心功能与 UI 分离
- 每个页面独立目录
- 共享代码统一管理

### 2. 易于维护
- 相关文件集中
- 职责明确
- 便于定位问题

### 3. 便于扩展
- 添加新页面：在 `src/pages/` 创建新目录
- 添加新功能：在 `src/core/` 添加新模块
- 添加文档：在 `docs/` 添加新文档

### 4. 团队协作友好
- 目录结构清晰
- 减少文件冲突
- 便于代码审查

## 🚀 开发指南

### 添加新页面
1. 在 `src/pages/` 创建新目录
2. 添加 HTML/JS/CSS 文件
3. 更新 `manifest.json`（如需要）
4. 使用相对路径引用核心模块

### 添加新核心功能
1. 在 `src/core/` 创建新 JS 文件
2. 在需要的页面 HTML 中引用
3. 使用相对路径 `../../core/xxx.js`

### 修改样式
- 页面特定样式：修改页面目录内的 CSS
- 共享样式：修改 `src/styles/extensions.css`

### 添加文档
- 在 `docs/` 目录添加 Markdown 文件
- 项目说明保持在根目录的 `README.md`

## 📝 注意事项

1. **路径引用**: 使用相对路径，注意层级关系
2. **manifest.json**: 路径必须从扩展根目录开始
3. **资源加载**: 动态资源使用 `chrome.runtime.getURL()`
4. **模块依赖**: 注意 JS 文件的加载顺序

## 🔄 迁移说明

本结构是从平铺式目录迁移而来，主要变更：
- 所有源文件移入 `src/` 目录
- 按功能分类到子目录
- 文档集中到 `docs/` 目录
- 更新了所有路径引用

详见 `docs/RESTRUCTURE_PLAN.md`
