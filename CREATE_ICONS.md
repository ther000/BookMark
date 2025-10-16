# 图标创建辅助工具

## 使用在线工具快速生成图标

### 推荐方式 1：Favicon.io
1. 访问：https://favicon.io/favicon-generator/
2. 配置：
   - Text: AI
   - Background: #3b82f6
   - Font Color: #ffffff
   - Font Family: 选择粗体字体
3. 下载并解压
4. 将文件重命名并复制到 icons 文件夹：
   - android-chrome-192x192.png → icon128.png
   - favicon-32x32.png → icon32.png
   - favicon-16x16.png → icon16.png
   - 复制 icon32.png 为 icon48.png（或手动调整）

### 推荐方式 2：RealFaviconGenerator
1. 访问：https://realfavicongenerator.net/
2. 上传一个简单的蓝色方块图片（128x128）
3. 生成并下载所有尺寸

### 推荐方式 3：使用 SVG（最佳质量）

创建一个简单的 SVG 文件（icon.svg）：

```svg
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#3b82f6" rx="20"/>
  <text x="50%" y="50%" font-size="64" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">AI</text>
</svg>
```

然后使用在线工具转换：
- https://cloudconvert.com/svg-to-png
- 分别生成 16x16, 32x32, 48x48, 128x128 尺寸

## 临时快速方案

如果您只是想快速测试扩展，可以：

1. 下载任何蓝色图标图片
2. 使用在线工具调整大小：https://www.iloveimg.com/resize-image
3. 生成 4 个不同尺寸的版本

## 手动创建（Windows）

使用 Windows 自带的画图工具：

1. 打开"画图"
2. 主页 → 调整大小 → 像素 → 128 x 128
3. 用蓝色填充画布（RGB: 59, 130, 246）
4. 插入文本"AI"，设置为白色、粗体、大号字体
5. 保存为 icon128.png
6. 重复步骤，创建其他尺寸

## 验证图标

确保创建了以下文件：
- [ ] icons/icon16.png
- [ ] icons/icon32.png
- [ ] icons/icon48.png
- [ ] icons/icon128.png

检查方法：
```powershell
dir icons\*.png
```

应该看到 4 个 PNG 文件。

## 设计建议

为了更好的视觉效果，建议：
- 使用圆角矩形背景
- 图标元素居中
- 保持足够的内边距
- 在不同尺寸下保持清晰度

---

完成后，按照 QUICKSTART.md 中的步骤加载扩展。
