# 智能添加单词命令

## 功能说明

优化后的 `add-selected-word` 命令支持在所有视图模式下添加单词：
- ✅ **编辑模式**（Live Preview / Source Mode）- 使用 Editor API，句子提取最准确，支持跨行
- ✅ **阅读模式**（Reading View）- 使用 DOM Selection API，智能定位段落
- ✅ **PDF 视图** - 使用 DOM Selection API，自动识别 PDF 文本层

**核心优势：**
- 只有一个命令，自动适配当前视图模式
- 智能选择最佳的文本和句子提取方法
- 支持无选中文本时手动输入单词

## 测试步骤

### 1. 重新加载插件
- 在 Obsidian 设置中禁用并重新启用 HiWords 插件
- 或者重启 Obsidian

### 2. 测试编辑模式
1. 打开一个 Markdown 文件（编辑模式）
2. 选中一个单词
3. 打开命令面板（Cmd/Ctrl + P）
4. 搜索 "添加单词" 或 "Add word"
5. 执行命令
6. **预期结果**：打开模态框，单词和句子已预填充（句子提取最准确）

### 3. 测试阅读模式
1. 切换到阅读模式（点击右上角的书本图标）
2. 选中一个单词
3. 打开命令面板（Cmd/Ctrl + P）
4. 搜索 "添加单词"
5. 执行命令
6. **预期结果**：打开模态框，单词和句子已预填充

### 4. 测试 PDF 视图
1. 打开一个 PDF 文件
2. 选中 PDF 中的一个单词或短语
3. 打开命令面板（Cmd/Ctrl + P）
4. 搜索 "添加单词"
5. 执行命令
6. **预期结果**：打开模态框，单词和句子已预填充

### 5. 测试无选中文本
1. 在任意视图下，不选中任何文本
2. 打开命令面板执行 "添加单词"
3. **预期结果**：打开空白模态框，可以手动输入单词

## 技术实现

### 核心改动

1. **智能命令** (`src/commands/command-manager.ts`)
   - 使用 `callback` 而非 `editorCallback`，确保在所有视图下都可用
   - 通过 `getMode()` 检测当前视图模式（`source` 或 `preview`）
   - 编辑模式：使用 `extractSentenceFromEditorMultiline()` 获取准确句子
   - 阅读/PDF 模式：使用 `extractSentenceFromSelection()` 从 DOM 提取

2. **句子提取优化** (`src/utils/sentence-extractor.ts`)
   - `extractSentenceFromSelection()`: 从 DOM Selection 中智能提取句子
   - `findParagraphContainer()`: 查找合适的段落容器（支持阅读模式和 PDF）
   - `calculateTextPosition()`: 精确计算选中文本的位置，避免重复匹配

### 技术亮点

- **智能容器定位**：阅读模式查找 `<p>`, `<li>` 等段落元素，PDF 模式查找 `textLayer`
- **精确位置计算**：使用 `TreeWalker` 遍历文本节点，而非简单的字符串查找
- **优雅降级**：如果精确定位失败，自动回退到 `indexOf` 方法

## 使用建议

### 推荐快捷键设置

可以为命令设置快捷键：
1. 打开 Obsidian 设置 → 快捷键
2. 搜索 "添加单词"
3. 设置一个快捷键，例如：`Cmd/Ctrl + Shift + A`

这样在任何视图下都能快速添加单词！

## 常见问题

### Q: 这个命令在所有模式下都可用吗？
A: 是的！使用 `editorCheckCallback` 后，命令在编辑模式、阅读模式和 PDF 视图下都可用。

### Q: 编辑模式和阅读模式的句子提取有区别吗？
A: 有的。编辑模式下使用 Editor API，句子提取更准确（支持跨行）。阅读/PDF 模式下使用 DOM Selection API，也能很好地工作。

### Q: 句子提取不准确怎么办？
A: 句子提取基于标点符号（. ! ? 。！？等），如果文本格式特殊，可能不够准确。可以在模态框中手动修改句子。

### Q: 为什么命令面板只显示一个"添加单词"命令了？
A: 我们优化了实现，将原来的两个命令合并成一个智能命令，自动适配所有视图模式，用户体验更简洁。

## 反馈

如有问题或建议，请提交 Issue。
