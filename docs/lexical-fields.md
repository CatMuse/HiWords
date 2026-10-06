# 词条字段统一规范

状态：已实现。语言卡片使用 `.hiwords` schema v3；`.hidict` 保持 v1，通过读取入口转换为共享词条模型。旧 `.hiwords` 文件不会自动改写，需重新生成或单独转换。

可直接查看 [v3 示例词库](examples/lexical-v3.hiwords)。示例内容仅用于说明字段结构，不代表经过外部词典核验。

本规范覆盖单词、短语和术语。目标是让词典查询、AI 生成、词库编辑和导出使用相同的字段含义。人物、概念和自定义卡片继续使用各自的内容模型。

## 数据边界

分开保存三类数据：

1. **词条内容**：通用释义、音标、例句、词形、搭配和来源，可随词库共享。
2. **阅读上下文**：选中文本、当前句子、上下文译义、整句翻译、句子结构和阅读出处，属于一次阅读记录。
3. **学习记录**：熟悉度、复习进度、收藏和学习时间，属于用户，不写入共享词条内容。

用户备注使用卡片已有的 `note`；词条中的 `usage.notes` 专门表示语言用法说明，两者不混用。

## 通用规则

- 字段名使用英文 camelCase，界面标签使用统一的本地化文案。
- `translation` 表示目标语言译义或译文；`definition` 表示词条原语言的解释。默认英语词条、简体中文译义，但不把语言含义藏在字段名里。
- 内容模型声明 `language` 和 `translationLanguage`，例句、搭配等沿用这两个语言设置。
- 缺失的可选字段省略，不使用 `null`、空字符串或空数组占位。义项至少有非空的译义或原语言解释，允许只具备其中之一。
- 编辑器可创建未完成的草稿；加入可用词库时校验词条文本、语言、类型和至少一项释义。
- 词条和重复内容项的 ID 由插件生成并保持稳定；AI 无需生成 ID。修改文本不重新分配 ID。
- 相同词性不等于相同义项。不能仅凭词性合并内容，也不从标点符号猜测词典义项边界。
- `title` 保留为通用卡片标题。语言卡片将它映射为统一模型的 `text`，文件中不再重复保存一份相同词条文本。

## 词条内容字段

“必需”指保存为可用词条时的要求；其余内容按数据来源提供，不要求 AI 填满。

| 字段 | 类型 | 界面标签 | 含义与要求 |
|---|---|---|---|
| `id` | string | — | 稳定词条 ID，必需 |
| `text` | string | 词条 | 保留原始大小写，必需；检索时另行归一化 |
| `language` | string | 词条语言 | 默认 `en`，必需 |
| `translationLanguage` | string | 译义语言 | 默认 `zh-CN`，有译义时必需 |
| `itemType` | enum | 词条类型 | `word`、`phrase`、`term`，必需 |
| `aliases` | string[] | 别名 | 复用通用卡片字段，不承担词形变化功能 |
| `phonetics` | object | 音标 | 可选，包含 `us`、`uk`、`unclassified` |
| `meanings` | Meaning[] | 释义 | 至少一项；允许保留尚未拆分的词典释义组 |
| `examples` | Example[] | 例句 | 通用例句，可关联具体释义 |
| `forms` | Form[] | 词形变化 | 一个词形可对应多个变化类型 |
| `phrases` | Phrase[] | 短语与搭配 | 用类型区分短语和搭配 |
| `usage` | object | 用法 | 语域、句型、用法说明和常见错误 |
| `derivedWords` | object[] | 派生词 | 保留已有功能，统一为 `text`、`partsOfSpeech`、`translation` |
| `morphology` | object | 词根词缀 | 保留已有 `components` 和 `explanation` 结构 |
| `relations` | object[] | 关联词 | 保留已有 `type`、`target`、`note` 结构 |
| `memory` | object[] | 记忆提示 | 保留已有 `type`、`text` 结构 |
| `frequency` | object | 词频 | 保留词典的来源、排名和等级，未知时不展示低频判断 |
| `sources` | Source[] | 来源 | 保存词典或 AI 来源；内容项用 `sourceIds` 引用 |

`tags`、`images`、`customSections` 和 `fieldValues` 继续由通用卡片提供。本次不增加新的自定义字段类型，也不强制每种卡片使用词条字段。

## 重复内容结构

### 释义 Meaning

- `id`：稳定 ID。
- `partsOfSpeech`：规范词性列表；保留多词性共享一组释义的情况。
- `sourceLabels`：可选原始标记，如 `vt`、`vi`，不作为独立规范词性。
- `translation`：目标语言译义，可选；导入词典原始释义行时按换行连接，不按分号拆义项。
- `definition`：原语言解释，可选。不能将中文释义直接放入英语词条的此字段。
- `sourceIds`：可选来源引用。

统一词性枚举：`noun`、`verb`、`adjective`、`adverb`、`pronoun`、`preposition`、`conjunction`、`determiner`、`interjection`、`numeral`、`auxiliary`、`modal`、`phrase`、`unknown`。

未知词性使用 `unknown`，不自动改为 `phrase`。`itemType` 表示词条种类，词性列表表示语法标签，两者分开。

### 例句 Example

- `id`、`text`：必需。
- `translation`：可选译文。
- `meaningId`：可选关联释义 ID；无法确认时不填写。
- `sourceIds`：可选来源引用。

统一使用 `examples[]`，不同时保留 `example` 或 `sentences`。例句文本可以是多个自然句子，但不承担当前阅读上下文的保存功能。

### 词形 Form

- `text`：词形文本。
- `types`：变化类型列表，例如 `past` 和 `pastParticiple` 可以同时属于同一个词形。
- `sourceIds`：可选来源引用。

沿用现有已识别的变化类型，包括过去式、过去分词、现在分词、第三人称单数、复数、比较级和最高级。具体词典没有提供某类变化时留空。

### 短语与搭配 Phrase

- `id`、`text`：必需。
- `type`：`phrase` 或 `collocation`。
- `translation`：可选译义。
- `examples`：可选例句列表，复用 Example 结构，不使用纯文本 `sentence`。
- `sourceIds`：可选来源引用。

### 用法 Usage

固定使用 `register[]`（语域）、`patterns[]`（句型）、`notes[]`（用法说明）、`commonMistakes[]`（常见错误）。阅读场景说明归入 `notes`，不再维护另一套 `scenarios`；AI 的 `pitfalls` 归入 `commonMistakes`。

### 来源 Source

最小结构为 `id`、`type`、`name`。`type` 使用 `dictionary` 或 `ai`；词典可附带真实的 `url`、`version`、`license`，AI 可附带生成时使用的 `provider`、`model`。不保存密钥，不要求 AI 编造引用。

来源记录表示内容的取得方式，不宣称 AI 生成内容经过词典核验。编辑释义、例句、词形或搭配时清除该内容项的来源引用；来源列表保留作为取得内容的历史记录，不能把改写后的内容展示为未经改动的原文引用。

## 现有字段映射

| 当前入口 | 当前字段 | 统一字段／处理 |
|---|---|---|
| HiDict | `word` | `text` |
| HiDict | `meanings[].partsOfSpeech` | 同名保留 |
| HiDict | `meanings[].sourceLabels` | 同名保留，不丢失 `vt`、`vi` |
| HiDict | `meanings[].definitions` | 按原行顺序连接为 `translation`，语言来自 `definitionLanguage` |
| HiDict | `phonetics.unclassified` | 同名保留，不复制到英美音标 |
| HiDict | `forms[].word / types` | `forms[].text / types` |
| HiDict | `frequency`、`sourceId` | 保留真实词频，转换为来源记录及引用 |
| AI 翻译 | `meanings[].pos` | `meanings[].partsOfSpeech` |
| AI 翻译 | 中文 `meanings[].definition` | 改为 `translation`；新提示词明确要求，禁止仅按字段名搬运 |
| AI 翻译 | `example / examples` | `examples[]`，去除完全相同项 |
| AI 翻译 | `collocations` | `phrases[]`，类型为 `collocation` |
| AI 翻译 | `usage / scenarios / pitfalls` | `usage.notes / notes / commonMistakes` |
| AI 翻译 | `contextMeaning`、句子分析 | 放入阅读上下文，不并入通用释义 |
| hiwords v2 | 卡片 `title` | 统一模型 `text`；继续由卡片标题承担持久化 |
| hiwords v2 | `meanings[].partOfSpeech` | `partsOfSpeech[]` |
| hiwords v2 | `meanings[].translation / definition` | 含义保持一致 |
| hiwords v2 | `sentences` | `examples` |
| hiwords v2 | `forms[].form / type` | `text / types[]` |
| hiwords v2 | `phrases[].sentence` | `phrases[].examples[]` |

这张表用于指导入口改造，不表示运行时必须长期支持旧字段。保留 HiDict 读取入口的格式转换，是处理独立词典格式；不需要为旧 AI 输出增加多套兼容解析。

## AI 与编辑行为

- AI 直接输出统一内容结构；通过验证后插件分配 ID 和来源信息。
- 简短翻译和详细生成可以返回同一结构的不同字段子集，字段含义不能随界面变化。
- AI 不生成词频、学习进度或声称来自真实词典的数据。
- 默认仅补充空缺内容。用户编辑过的字段不自动覆盖；替换已有内容需要明确的替换操作。
- 多义词的补充不能仅通过词性匹配已有项；不确定归属时保留为待审阅的新释义。
- 显示数量限制由界面或本次生成请求决定，不限制词库可保存的释义和例句总数。

## 界面一致性

编辑器、词库详情和 AI 详情共用字段标签及内容组件。默认顺序为：词条与音标 → 释义 → 例句 → 短语与搭配 → 词形变化 → 用法 → 词根词缀与派生词 → 关联词 → 记忆提示 → 词频 → 来源。

已有集合的模块排序继续按用户设置展示。缺失内容的模块在阅读界面隐藏，在编辑界面提供填写入口。划词窗口先展示紧凑摘要，详细窗口展示完整内容；二者读取同一模型。

## 实施结构与验收

1. `src/lexical/` 提供共享类型、验证、AI 输出解析和内容投影。
2. `src/dictionary/lexical-entry.ts` 将词典读取结果映射为共享类型，保留原始释义行、词性标记和词频。
3. AI 翻译和生成使用共享内容字段；阅读上下文放在结果的 `reading` 中，保存时通过显式投影排除。生成草稿保留已有释义，同词性的其他释义作为独立项供审阅。
4. 语言卡片的存储、编辑器、预览、添加流程和导出已接入共享模型。AI 详情复用词库内容组件；添加窗口未改动的结构化预填结果保存完整字段。修改摘要或改换词条后按手动填写的译义保存。Canvas 继续保存自由文本和本地阅读来源，不作为结构化词库导出。
5. 当前写入 schema v3。旧文件不自动重写，不维护隐式旧字段兼容分支；本次没有提供批量转换工具。

验收：同一个词分别来自词典、AI 和 hiwords 导入时，字段含义、标签和展示方式一致；保存后再读取不丢失信息。释义不因词性相同被误合并，阅读上下文和学习记录不泄漏到共享词库。
