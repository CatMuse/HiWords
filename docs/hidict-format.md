# HiDict v1 词典格式

`.hidict` 是 UTF-8 JSON 离线查询词典，支持直接存储或以单个 gzip 数据流压缩存储，与 `.hiwords` schema v2 完全分开。插件支持在设置中选择仓库内的词典并划词查询，不注册该扩展名的编辑器，也不接入自动高亮。

## 词典信息

`schema` 固定为 `hidict`；`schemaVersion` 为格式版本，目前为 1。`id` 是稳定词典 ID，`name` 为显示名称，`version` 为内容版本。`language` 是单词语言，`definitionLanguage` 是释义语言。`entryCount` 必须等于 `entries.length`。

`sources` 记录数据来源 ID、地址、固定提交、源文件 SHA-256 与许可证；词条的 `sourceId` 引用对应来源。`frequencyScale` 明确记录词频分层规则。完整机器可读定义见 `hidict.schema.json`。

## 词条字段

| 字段 | 内容 |
|---|---|
| `id` | 稳定词条 ID，由来源和大小写归一化的单词生成 |
| `word` | 保留原始大小写的单词；查询时可建立大小写归一化索引 |
| `meanings` | 按词性和原始词性标记分组的中文释义 |
| `phonetics.uk` | 已确认的英音音标，缺失为 `null` |
| `phonetics.us` | 已确认的美音音标，缺失为 `null` |
| `phonetics.unclassified` | 未确认口音的原始音标，缺失为 `null` |
| `frequency.rank` | 指定来源的词频排名，数字越小越常见；未知为 `null` |
| `frequency.level` | 1–5级，数字越大越常见；未知为 `null` |
| `forms` | 词形与用途；一个词形可以有多个用途 |
| `sourceId` | 对应词典 `sources` 中的数据来源 |

每组释义包含 `partsOfSpeech`、`sourceLabels` 和 `definitions`。`partsOfSpeech` 是规范词性列表，支持 noun、verb、adjective、adverb、pronoun、preposition、conjunction、determiner、interjection、numeral、auxiliary、modal、phrase、unknown。多个词性共享一份释义时可保留多个标签；来源未标词性时使用 unknown，不补造。

`sourceLabels` 保留 vt、vi 等原始标记，避免规范为 verb 后丢失及物／不及物区别。`definitions` 的每个字符串保留一个原始释义行，行内可能包含多个含义；不能据此宣称完成义项拆分或中文教学校对。

`forms` 示例：`{"word":"patterned","types":["past","pastParticiple"]}`。查询实现应优先精确主词，然后按词形查询；歧义词形允许返回多个候选，不应强行指定唯一来源。格式不存学习卡片别名、高亮设置或掌握状态。

## 首版五级词频

| 等级 | ECDICT `frq` 排名 | 显示建议 |
|---|---|---|
| 5 | 1–1000 | 点亮5个标记 |
| 4 | 1001–3000 | 点亮4个标记 |
| 3 | 3001–5000 | 点亮3个标记 |
| 2 | 5001–10000 | 点亮2个标记 |
| 1 | 10001及以后 | 点亮1个标记 |
| 未知 | `null` | 显示“词频未知”，不按低频处理 |

这是 HiDict 自定义的来源排名分层，使用原始排名，不是选出的一万词内部重新排名，也不是柯林斯星级、CEFR 或考纲等级。更换阈值或词频来源时要同步更新内容版本和 `frequencyScale`，避免同级数含义变化。

## 音标现状

ECDICT 单列 phonetic 不足以可靠区分英美口音，首版 uk/us 均留空，只填 unclassified。不从单一音标复制出两种口音，也不把历史记音符号自动宣称为现代 IPA。未来获得授权明确且可靠的口音数据后可填入 uk/us；如果混合多来源，需要扩展字段来源追踪。

图中 US 标签只能用于已确认的 us 音标。首版界面实现时若只有 unclassified，应显示无口音标签的“音标”。本次未打包音频。

## 范围

首版选取一万个有中文释义和正数 frq 排名的单词，排除空格短语、明确指向其他基本词形的屈折词条及大小写重复。允许撇号、连字符及专名，并非词频前一万的所有表面词形，不能以此推算固定阅读覆盖率。

词典不包含例句、备注、图片、上下文或学习状态。查询卡片右上角的添加按钮复用现有单词本流程，预填原词、释义和当前上下文；`.hidict` 本身不写入现有高亮词库。已有考纲 `.hiwords` 文件保持独立。

## 插件使用

1. 将 `.hidict` 文件放入当前 Obsidian 仓库（外层 ZIP 需先解压，gzip 版 `.hidict` 无需手动解压）。
2. 在 **设置 → HiWords → 词库管理** 中选择 **离线词典**。下拉菜单只列出仓库内的 `.hidict`，选中时先验证数据，再保存路径；选择“未选择词典”可取消关联。
3. 在笔记、阅读模式或 PDF 中划选一个英文单词，查看词性释义、音标、词形和五级词频。已有网页划词入口也使用同一路由。
4. 点击右上角添加按钮，沿用现有单词本添加／编辑流程。词形查询使用原词作为添加目标；多原词候选可以在卡片中切换。

本地查询不需要启用 AI。只有开启现有划词翻译开关，未收录词和句子才会调用已配置的 AI 服务，发送选中文本。缺失或损坏词典会提示重新选择，不会因为文件错误自动发送给 AI。

词典在首次查询时延迟加载，使用原词／词形索引；重复查询复用缓存。文件修改或删除会使缓存失效。移动／重命名文件后应在设置中重新选择。取消选择恢复原有划词 AI 行为。设置路径和文件读取均限于仓库，不提供外部文件访问或词典编辑。

## 扩充版 0.2.0（51,796 词）

扩充版仍使用 HiDict v1，词典内容版本为 0.2.0。选取完整 ECDICT 中有中文释义、且有 frq、BNC、考纲或柯林斯星级任一标记的单词；按原规则去除空格短语和明确指向另一原词的屈折词条，大小写去重。

包含原一万词的全部条目和新增 41,796 条目，保留原有释义、音标、词形和稳定 ID。14,729 词没有 frq，rank/level 均为 null；BNC 只作为入选依据，不用于代替 frq 分级。英美音标未补充。主文件使用紧凑 UTF-8 JSON，20,258,011 字节（约19.32 MiB）。

重新生成：`python3 scripts/build-hidict.py SOURCE_DIRECTORY OUTPUT_DIRECTORY --expanded --compact`。生成的文件可直接在现有插件设置中选择，旧版文件和设置不会自动覆盖。

## gzip 存储

JSON schema 和词条内容保持 v1，扩展名仍为 `.hidict`。插件通过 gzip 魔数 `1f 8b` 自动识别，二进制读取后解压并校验 CRC32 和原始长度，再执行原有 JSON 验证和索引。旧版纯 JSON 词典继续支持；旧版插件不支持 gzip 词典。

只在首次查询或文件改变后解压，随后复用缓存。此压缩减少文件与同步体积，解压后的索引内存占用不变。解压器随插件打包，使用浏览器兼容实现，不依赖 Node/Electron。

转换现有词典（逐字节无损，写入前检查往返一致性，原子替换）：

```bash
python3 scripts/compress-hidict.py INPUT.hidict OUTPUT.hidict
# 原路径替换，不需要更改插件设置：
python3 scripts/compress-hidict.py INPUT.hidict --in-place
```

重新生成时可以在 `build-hidict.py` 命令追加 `--gzip`，主词典直接输出 gzip。校对与补充脚本自动识别两种存储方式，修改时保留原存储方式。需要文本编辑时，先用 gzip 工具解压为 JSON，编辑后重新压缩；不要用文本编辑器直接打开压缩文件。


## 基础词典的词形范围

基础词典只收录过去式、过去分词、现在分词、第三人称单数和复数词形。生成及 CatWords 补充脚本不再导入比较级和最高级；这些独立单词本身的词条（例如 more、most）保留。HiDict v1 格式仍兼容旧词典中的 comparative/superlative 字段。
