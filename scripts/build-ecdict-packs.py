"""Convert a pinned ECDICT CSV into local HiWords schema-v3 exam packs.

Usage: python3 scripts/build-ecdict-packs.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
SOURCE_DIRECTORY must contain ecdict.csv, LICENSE and source.json (commit metadata).
No AI, remote audio, or dictionary requests are made by this converter.
"""
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import sys

EXAMS = {"zk": "中考", "gk": "高考", "cet4": "四级", "cet6": "六级",
         "ky": "考研", "ielts": "雅思", "toefl": "托福", "gre": "GRE"}
STAGES = ["zk", "gk", "cet4", "cet6"]
POS = {"n": "noun", "v": "verb", "vt": "verb", "vi": "verb",
       "a": "adjective", "adj": "adjective", "ad": "adverb", "adv": "adverb",
       "pron": "pronoun", "prep": "preposition", "conj": "conjunction",
       "art": "determiner", "det": "determiner", "interj": "interjection",
       "int": "interjection", "num": "numeral", "aux": "auxiliary"}
PREFIX = re.compile(r"^((?:(?:n|v|vt|vi|a|adj|ad|adv|pron|prep|conj|art|det|interj|int|num|aux)\.?\s*[,/&]\s*)*(?:n|v|vt|vi|a|adj|ad|adv|pron|prep|conj|art|det|interj|int|num|aux))\.\s*", re.I)
FORM_TYPES = {"p": "past", "d": "pastParticiple", "i": "presentParticiple",
              "3": "thirdPersonSingular", "s": "plural", "r": "comparative", "t": "superlative"}


def decoded(value):
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n").strip()


def positive_number(value):
    return int(value) if value.isdigit() and int(value) > 0 else None


def meanings(row, card_id):
    # Chinese and English source senses are not aligned: do not pair them.
    groups, pending = [], []
    for line in decoded(row["translation"]).splitlines():
        line = line.strip()
        if not line:
            continue
        match = PREFIX.match(line)
        if match:
            positions = [POS[token.lower()] for token in re.findall(r"[a-z]+", match[1], re.I)]
            text = line[match.end():].strip()
            if pending:
                text = "\n".join(pending + [text])
                pending = []
            labels = re.findall(r"[a-z]+", match[1], re.I)
            groups.append([list(dict.fromkeys(positions)), labels, text])
        elif groups:
            groups[-1][2] += "\n" + line
        else:
            pending.append(line)
    if pending:
        # No clear Chinese POS: retain for review instead of inventing a label.
        return None
    return [{"id": f"{card_id}-meaning-{i + 1}", "partsOfSpeech": positions,
             "sourceLabels": labels, "translation": text, "sourceIds": ["ecdict"]}
            for i, (positions, labels, text) in enumerate(groups) if text]


def forms(row):
    result = []
    for pair in row["exchange"].split("/"):
        code, _, form = pair.partition(":")
        if code in FORM_TYPES and form and form.lower() != row["word"].lower():
            item = next((item for item in result if item["text"] == form), None)
            if item is None:
                result.append({"text": form, "types": [FORM_TYPES[code]], "sourceIds": ["ecdict"]})
            elif FORM_TYPES[code] not in item["types"]:
                item["types"].append(FORM_TYPES[code])
    return result


def main():
    source, output = map(Path, sys.argv[1:3])
    output.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((source / "source.json").read_text())
    commit = metadata["commit"]
    csv_path = source / "ecdict.csv"
    csv_hash = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    source_counts, excluded, cards = collections.Counter(), [], {}
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            tags = [tag for tag in row["tag"].split() if tag in EXAMS]
            source_counts.update(tags)
            if not tags:
                continue
            title = row["word"].strip()
            key = title.casefold()
            card_id = "ecdict-en-" + hashlib.sha256(key.encode()).hexdigest()[:20]
            entries = meanings(row, card_id)
            if not entries:
                excluded.append({"word": title, "tags": tags, "reason": "中文释义缺少明确词性或为空", "translation": decoded(row["translation"])})
                continue
            if key in cards:
                excluded.append({"word": title, "tags": tags, "reason": "大小写归一化后重复", "translation": decoded(row["translation"])})
                continue
            values = {"exam_tags": [EXAMS[tag] for tag in tags]}
            if row["phonetic"].strip():
                values["source_phonetic"] = row["phonetic"].strip()
            for source_key, target in [("bnc", "bnc_rank"), ("frq", "frq_rank")]:
                number = positive_number(row[source_key])
                if number is not None:
                    values[target] = number
            card = {"id": card_id, "title": title, "tags": tags,
                    "data": {"language": "en", "translationLanguage": "zh-CN", "itemType": "phrase" if " " in title else "word", "meanings": entries},
                    "fieldValues": values}
            card["data"]["sources"] = [{"id": "ecdict", "type": "dictionary", "name": "ECDICT",
                                        "url": "https://github.com/skywind3000/ECDICT", "version": commit,
                                        "license": "MIT"}]
            if values.get("source_phonetic"):
                card["data"]["phonetics"] = {"unclassified": values["source_phonetic"], "sourceIds": ["ecdict"]}
            inflections = forms(row)
            if inflections:
                card["data"]["forms"] = inflections
            cards[key] = card
    # Safe inflection aliases: never shadow another headword or ambiguous owner.
    owners = collections.defaultdict(set)
    for key, card in cards.items():
        for form in card["data"].get("forms", []):
            owners[form["text"].casefold()].add(key)
    for key, card in cards.items():
        aliases = sorted({item["text"].casefold() for item in card["data"].get("forms", [])
                          if owners[item["text"].casefold()] == {key} and item["text"].casefold() not in cards})
        if aliases:
            card["aliases"] = aliases
    fields = [
        {"id": "source_phonetic", "label": "原始音标", "type": "text", "description": "ECDICT 原始音标，未确认英美口音或统一 IPA。", "previewByDefault": True},
        {"id": "exam_tags", "label": "考纲标签", "type": "list", "previewByDefault": True},
        {"id": "frq_rank", "label": "当代语料词频排名", "type": "number", "description": "来自 ECDICT frq，数字越小越常见；缺失值不补为零。", "previewByDefault": False},
        {"id": "bnc_rank", "label": "BNC 词频排名", "type": "number", "previewByDefault": False},
    ]
    provenance = {"project": "ECDICT", "url": "https://github.com/skywind3000/ECDICT",
                  "commit": commit, "commitDate": metadata["commitDate"], "sourceFile": "ecdict.csv",
                  "sourceSHA256": csv_hash, "licenseFile": "ECDICT-LICENSE.txt",
                  "contentStatus": "自动转换初版，未经逐词人工校对；不是最新官方考纲认证词库"}
    packs, seen = [], set()
    for tag, label in EXAMS.items():
        keys = {key for key, card in cards.items() if tag in card["tags"]}
        if tag in STAGES:
            selected = keys - seen
            seen |= keys
            title = f"HiWords {label}{'基础' if tag == 'zk' else '新增'}词库"
            rule = "当前考纲标签减去所有前置阶段标签的并集"
        else:
            selected = keys
            title = f"HiWords {label}基础词库"
            rule = "保留当前考试标签的完整有效集合；与其他独立包可能重叠"
        ordered = sorted(selected, key=lambda key: (cards[key]["fieldValues"].get("frq_rank", 10**9), cards[key]["fieldValues"].get("bnc_rank", 10**9), key))
        pack = {"schema": "hiwords", "schemaVersion": 3, "id": f"hiwords-ecdict-{tag}-{'incremental' if tag in STAGES else 'full'}",
                "title": title, "cardKind": "language.word", "cardKindVersion": 1,
                "fields": fields, "display": {"moduleOrder": ["word", "phonetics", "meanings", "field:exam_tags", "field:frq_rank", "field:bnc_rank", "forms", "sources"]},
                "provenance": {**provenance, "examTag": tag, "selectionRule": rule}, "cards": [cards[key] for key in ordered]}
        filename = title.removeprefix("HiWords ") + ".hiwords"
        data = (json.dumps(pack, ensure_ascii=False, indent=2) + "\n").encode()
        (output / filename).write_bytes(data)
        packs.append({"file": filename, "count": len(ordered), "bytes": len(data), "sourceTagCount": source_counts[tag], "rule": rule})
    (output / "ECDICT-LICENSE.txt").write_bytes((source / "LICENSE").read_bytes())
    report = {"source": provenance, "sourceTagCounts": dict(source_counts), "uniqueWords": len(cards), "excludedCount": len(excluded), "packs": packs}
    (output / "统计报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    (output / "待校对词条.json").write_text(json.dumps(excluded, ensure_ascii=False, indent=2) + "\n")
    table = "\n".join(f"| {p['file']} | {p['count']:,} | {p['bytes']/1e6:.2f} MB |" for p in packs)
    (output / "使用说明.md").write_text(f"""# HiWords ECDICT 基础词库初版

自动转换产物，使用当前 HiWords schema v3。未调用 AI、未逐词人工校对，也不代表最新官方考试大纲。适用于当前功能分支；主分支旧版格式不适用。

| 文件 | 词条数 | 文件大小 |
|---|---:|---:|
{table}

去重后共 {len(cards):,} 个有效词条；待校对或重复记录 {len(excluded)} 条，详见待校对词条.json。各包词数相加会重复计入独立考试包中的词。

## 使用

文件已放在 Obsidian 库内。进入 **设置 → HiWords → 生词本** 添加所需 `.hiwords` 文件，并启用该生词本。建议先只启用一包验证效果；本次生成没有修改插件设置。

中考、高考、四级、六级是递进增量包：每包减去所有前置阶段的有效词集合，四包互不重复。备考四级时如需覆盖前置词汇，可同时启用中考、高考、四级三包；如只学四级新增词，只启用四级包。

考研、雅思、托福、GRE 是各自完整有效标签包，彼此及与阶段包有重叠。并非严格难度顺序，不建议全部同时启用。原始考试标签始终保留，包内按 frq、bnc、单词依次排序。

## 内容转换

- 中文释义按来源的词性分组保留，包括原有专业标记。没有明确中文词性的词暂不导入，列入待校对文件；未生成或补造释义。
- 中英文义项不逐行对齐，所以本版只导入中文释义，英文 definition 省略。一个词性分组可包含多个原始义项，不代表经过教学筛选。
- 音标使用 phonetics.unclassified 展示，原始自定义字段同时保留，不强行标注为英音或美音。没有打包音频、图片或例句。
- 词频排名来自 ECDICT 的 frq 和 bnc，缺失就省略，不作为最新词频或学习等级。
- 词形存入 forms；仅把不与任何已收录主词重名、且只有一个归属词的词形加入 aliases。歧义词形只展示，不强制匹配；派生词不自动归并。
- 稳定词条 ID 由大小写归一化的单词生成，跨包同词 ID 一致。不同包编辑内容仍是独立副本。
- 每包 provenance 及统计报告记录源版本；请随包保留本说明、统计报告与许可。该元数据不改变插件行为。

## 来源与许可

来源：skywind3000/ECDICT，https://github.com/skywind3000/ECDICT

固定提交：{commit}（{metadata['commitDate']}）。原始 CSV SHA-256：{csv_hash}。

仓库附带 MIT 许可，原文见 ECDICT-LICENSE.txt。源数据包含多种历史资料，官方公开发行或商业化前应继续核实具体内容来源和授权，并进行释义及考纲校对。本次只是本地可用的转换初版。

## 重新生成

在插件目录运行 `python3 scripts/build-ecdict-packs.py SOURCE_DIRECTORY OUTPUT_DIRECTORY`。源目录需包含固定提交的 ecdict.csv、LICENSE 和 source.json；source.json 需有 commit 和 commitDate。生成器会覆盖同名输出，请使用新的目录或先备份个人编辑。
""", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
