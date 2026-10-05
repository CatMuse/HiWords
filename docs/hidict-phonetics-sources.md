# HiDict 英美音标补全调研

核对时间：2026-10-04。本轮仅优化查询卡片，现有词典数据未改动。

| 来源 | 音标与口音 | 接入考虑 |
|---|---|---|
| [Wiktionary / Kaikki](https://kaikki.org/dictionary/English/) | `sounds` 中的 IPA 及 UK、US、Received-Pronunciation 等标签 | 优先候选。按明确标签提取，不能将无标签音标推断为美音。相同单词可能因词性、词义出现不同读音。 |
| [ipa-dict](https://github.com/open-dict-data/ipa-dict) | `en_UK` 为 RP，`en_US` 为 General American；单词可有多个读音 | 格式轻量，便于匹配；README 明确第三方数据保留原许可，其中 UK 源自 GPL-3.0 的 ipacards。不能笼统将全部数据视作 MIT。 |
| [CMUdict](https://github.com/cmusphinx/cmudict) | 北美英语，使用 ARPAbet | 可作为美音补充，需转换到 IPA，并保留重音、异读及来源许可；不能补英音。 |

## 推荐处理方式

以 Kaikki/Wiktionary 的明确口音标签补 UK/US。先对当前一万词做精确拼写匹配，统计英音、美音、双音标覆盖率，以及多音词数量，再决定需要哪些补充来源。目前没有对一万词的英美音标覆盖率作保证。

例如 [Kaikki 的 proof 条目](https://kaikki.org/dictionary/English/meaning/p/pr/proof.html) 列有 `/pɹuːf/`（Canada、UK）和 `/pɹuf/`（US），说明这个截图中的单词可以找到明确口音标注。

Wiktionary 内容使用 [CC BY-SA 4.0 / GFDL](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)，复用时需要保留归属、许可及相关共享要求，不能把补入的数据统一标成 ECDICT 的 MIT。音频素材另有自己的许可，本方案只讨论音标。

HiDict 当前 `sourceId` 只表示词条整体来源。混合音标来源前，需要增加字段级来源记录并更新格式与校验器；若需要按词性或词义对应多个读音，现有单字符串 `phonetics.uk/us` 也需要扩展。优先保留缺失值，不用英音填美音、不用 AI 猜测。

插件查询仍读取离线词典。上述数据应在制作词典时补全，不在用户划词时增加外部请求。可以将开放来源的音标作为独立数据包管理，收费精选内容另外记录来源和许可；发布前按实际复用方式确认许可证要求。
