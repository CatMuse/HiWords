<div align="center">
	<h1>HiWords - 智能单词本管理插件</h1>
	<img src="https://img.shields.io/github/downloads/CatMuse/HiWords/total" alt="GitHub Downloads (all assets, all releases)" />
	<img src="https://img.shields.io/github/v/release/CatMuse/HiWords" alt="GitHub release (latest by date)" />
	<img src="https://img.shields.io/github/last-commit/CatMuse/HiWords" alt="GitHub last commit" />
	<img src="https://img.shields.io/github/issues/CatMuse/HiWords" alt="GitHub issues" />
	<img src="https://img.shields.io/github/stars/CatMuse/HiWords?style=social" alt="GitHub stars" />
</div>

---

简体中文 | [English](./README.md)

一款智能的 Obsidian 插件，将您的阅读转化为沉浸式的词汇学习体验。HiWords 自动高亮显示来自您自定义单词本的生词，悬停即可查看释义，让您在阅读中轻松掌握新单词。

![Screenshot](docs/screenshot.jpg)

---

## 📚 基于 Canvas 的单词本管理

使用 Obsidian 强大的 Canvas 功能管理您的单词本。您可以在 Canvas 上自由拖放排列单词卡片，为不同主题、语言或学习目标创建多个独立的单词本，并使用节点颜色按难度、主题或掌握程度对单词进行分类。所有对单词本的更改都会自动同步并反映在您的阅读高亮中。

![单词管理](docs/vocabulary_management.jpg)

---

## 🎯 智能高亮系统

HiWords 智能地在笔记中高亮显示单词本中的单词，让您轻松发现和复习正在学习的单词。阅读时即时识别并高亮单词本中的词汇，高亮颜色与 Canvas 节点颜色保持一致，您还可以灵活选择在所有文件、特定文件夹中高亮或排除某些路径。基于 CodeMirror 6 构建，即使处理大型文档也能流畅运行。

不仅支持编辑模式，还完美支持 Markdown 阅读模式和 PDF 文件的高亮显示，让您在任何阅读场景下都能获得一致的学习体验。

![支持PDF](docs/pdf_support.jpg)

---

## 💡 悬停即显释义

只需将鼠标悬停在任何高亮单词上，即可即时查看支持 Markdown 格式的详细释义，无需离开当前文档。您可以直接在弹窗中标记已掌握单词，点击单词即可听取读音（支持自定义 TTS 服务，默认为英文发音），弹窗界面还会无缝适配您的 Obsidian 主题，提供一致的视觉体验。

---

## 🤖 AI 智能释义

配置您喜欢的 AI 服务（支持 OpenAI、Anthropic 等兼容格式），让 AI 根据上下文自动填充相关释义。您可以使用 `{{word}}` 和 `{{sentence}}` 变量自定义提示词模板，在添加新单词时快速生成 AI 释义，帮助您更好地理解单词在特定语境中的含义。

![AI Integration](docs/ai_integration.jpg)

---

## 📋 侧边栏词汇视图

通过快捷命令可打开侧边栏，追踪您的词汇学习，一目了然地查看当前文档中出现的所有单词。点击任何单词即可发音，颜色保持与 Canvas 节点颜色一致。您可以切换已掌握单词的可见性以专注于主动学习，列表会随着文档编辑或切换实时自动更新。

---

## ⚡ 快速单词管理

选择任何文本并右键点击即可快速添加到单词本，或使用 `Ctrl/Cmd+P` 通过命令面板添加选中的单词。插件会智能检测单词是否已存在并自动切换到编辑模式，添加时还会捕获周围句子以提供更好的上下文。支持高效管理不同单词本中的多个单词，让词汇管理更加便捷。

![快速添加](docs/quick_add.jpg)

---

## 🚀 快速开始

### 安装插件

**从 Obsidian 社区插件安装（推荐）**

1. 打开 Obsidian 设置 → 社区插件
2. 搜索 "HiWords"
3. 点击安装，然后启用

### 创建您的第一个单词本

1. **创建 Canvas 文件**

   - 在文件浏览器中右键 → 新建 Canvas
   - 命名（例如：`英语单词本.canvas`）

2. **添加单词卡片**

   - 创建文本节点，格式如下：

   ```
   
   serendipity
   *serendipitous, serendipitously*
   
   **n.** 意外发现珍奇事物的能力；机缘巧合
   
   **例句：** The discovery of penicillin was a fortunate serendipity.
   青霉素的发现是一次幸运的机缘巧合。
   
   ```

3. **使用颜色组织**

   - 点击节点可以设置卡片颜色
   - 使用颜色按难度、主题或掌握程度分类

4. **关联到 HiWords**

   - 打开 HiWords 设置
   - 添加您的 Canvas 文件作为单词本
   - 开始阅读，观察单词自动高亮！

> **Tips**：您可以直接将文件拖拽进 Canvas 中，HiWords 会自动解析文件内容并添加到单词本中。可在 HiWords 设置中配置文件节点模式，选择仅文件名或包含别名。

---

## ⚙️ 配置选项

### 高亮设置

- **启用自动高亮**：切换自动单词高亮
- **高亮样式**：选择高亮显示样式，支持背景高亮、下划线、加粗等多种样式
- **高亮范围**：所有文件（默认）、仅特定文件夹、排除特定文件夹

### 悬停弹窗设置

- **悬停显示**：启用/禁用释义弹窗
- **模糊释义**：模糊释义直到悬停（用于主动回忆练习）
- **TTS 模板**：自定义发音服务 URL

### AI 助手设置

- **API URL**：您的 AI 服务端点
- **API Key**：AI 服务的认证密钥
- **模型**：要使用的 AI 模型（例如 gpt-4o-mini）
- **自定义提示词**：使用 `{{word}}` 和 `{{sentence}}` 占位符设计您的提示词

### Canvas 设置

- **自动布局**：自动排列新的单词卡片
- **卡片尺寸**：设置单词卡片的默认宽度和高度
- **文件节点模式**：选择如何解析文件节点（仅文件名或包含别名）

### 掌握追踪

- **启用掌握功能**：追踪您已掌握的单词
- **在侧边栏显示已掌握**：在侧边栏视图中显示或隐藏已掌握的单词

---

## 🎯 使用技巧

### 组织单词本

- **按语言**：为不同语言创建独立的单词本
- **按主题**：按学科组织单词（商务、学术、日常等）
- **按来源**：将不同书籍或课程的单词分开
- **按难度**：使用颜色标记初级、中级和高级单词

### 有效的学习工作流

1. **自然阅读** - 让 HiWords 自动高亮单词
2. **悬停复习** - 在不中断流程的情况下查看释义
3. **标记已掌握** - 在学习过程中追踪进度
4. **添加新词** - 右键添加或快捷命令添加遇到的生词
5. **使用 AI 辅助** - 生成上下文相关的释义以更好地理解

---

## 📝 命令列表

通过 `Ctrl/Cmd+P` 访问这些命令：

- **刷新单词本** - 重新加载所有单词本
- **显示单词侧边栏** - 打开侧边栏视图
- **添加选中单词** - 将选中文本添加到单词本

---

## 🤝 支持

如果您觉得 HiWords 有帮助，请考虑支持其开发：

- [☕ 在 Ko-fi 上请我喝咖啡](https://ko-fi.com/catmuse)
- [⭐ 在 GitHub 上给项目加星](https://github.com/CatMuse/HiWords)
- [🐛 报告问题或建议功能](https://github.com/CatMuse/HiWords/issues)

---

## 📄 许可证

MIT License - 可自由使用和修改。

---

**Made with ❤️ by [CatMuse](https://github.com/CatMuse)**
