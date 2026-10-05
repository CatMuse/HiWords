"""Build a standalone HiDict; does not change plugin settings or highlighter code.

python3 scripts/build-hidict.py SOURCE_DIRECTORY OUTPUT_DIRECTORY [WORD_COUNT]
Source directory: ecdict.csv, LICENSE, source.json with commit and commitDate.
"""
from hidict_io import write_hidict
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

POS = {"n": "noun", "v": "verb", "vt": "verb", "vi": "verb", "a": "adjective",
       "adj": "adjective", "ad": "adverb", "adv": "adverb", "pron": "pronoun",
       "prep": "preposition", "conj": "conjunction", "art": "determiner",
       "det": "determiner", "interj": "interjection", "int": "interjection",
       "num": "numeral", "aux": "auxiliary", "modal": "modal", "phr": "phrase"}
TOKEN = r"(?:interj|modal|pron|prep|conj|adj|adv|art|det|aux|num|phr|int|vt|vi|ad|n|v|a)"
PREFIX = re.compile(rf"^({TOKEN}\.?(?:\s*(?:[,/&]|and)\s*{TOKEN}\.?)*)\.\s*", re.I)
FORM_TYPES = {"p": "past", "d": "pastParticiple", "i": "presentParticiple",
              "3": "thirdPersonSingular", "s": "plural"}
BANDS = [(5, 1, 1000), (4, 1001, 3000), (3, 3001, 5000), (2, 5001, 10000), (1, 10001, None)]


def decode(value):
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n").strip()


def frequency_level(rank):
    if rank is None:
        return None
    return next(level for level, low, high in BANDS if rank >= low and (high is None or rank <= high))


def parse_meanings(value):
    groups = {}
    current = (("unknown",), ())
    for line in decode(value).splitlines():
        line = line.strip()
        if not line:
            continue
        match = PREFIX.match(line)
        if match:
            labels = tuple(dict.fromkeys(token.strip(" .") for token in re.split(r"[,/&]|\band\b", match[1].lower())))
            positions = tuple(dict.fromkeys(POS[label] for label in labels))
            current = positions, labels
            line = line[match.end():].strip()
        else:
            # Domain-labelled or unlabelled lines are not assigned a guessed POS.
            current = (("unknown",), ())
        if line and line not in groups.setdefault(current, []):
            groups[current].append(line)
    return [{"partsOfSpeech": list(positions), "sourceLabels": list(labels), "definitions": definitions}
            for (positions, labels), definitions in groups.items() if definitions]


def parse_forms(row):
    values = {}
    for pair in row["exchange"].split("/"):
        code, _, word = pair.partition(":")
        if code in FORM_TYPES and word and word.casefold() != row["word"].casefold():
            types = values.setdefault(word, [])
            if FORM_TYPES[code] not in types:
                types.append(FORM_TYPES[code])
    return [{"word": word, "types": types} for word, types in values.items()]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def positive_rank(value):
    return int(value) if value.isdigit() and int(value) > 0 else None


def selection_key(row):
    rank = positive_rank(row['frq'])
    return (0, rank, row['word'].casefold()) if rank else (1, positive_rank(row['bnc']) or float('inf'), row['word'].casefold())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('count', type=int, nargs='?', default=None)
    parser.add_argument('--expanded', action='store_true', help='Include all headwords with FRQ, BNC, exam or Collins markers')
    parser.add_argument('--compact', action='store_true', help='Write the main dictionary as compact UTF-8 JSON')
    parser.add_argument('--gzip', action='store_true', help='Gzip the main .hidict without changing its extension')
    args = parser.parse_args()
    source, output = args.source, args.output
    limit = args.count if args.count is not None else (None if args.expanded else 10000)
    if limit is not None and limit < 100:
        raise ValueError('Word count must be at least 100')
    output.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((source / "source.json").read_text())
    candidates, skipped = {}, collections.Counter()
    with (source / "ecdict.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if not re.fullmatch(r"[A-Za-z][A-Za-z'-]*", row["word"]):
                skipped["not_single_english_word"] += 1
                continue
            if args.expanded:
                if not (positive_rank(row['frq']) or positive_rank(row['bnc']) or row['tag'].strip() or positive_rank(row['collins'])):
                    skipped['missing_inclusion_marker'] += 1
                    continue
            elif positive_rank(row['frq']) is None:
                skipped['missing_positive_frq_rank'] += 1
                continue
            lemma = next((pair[2:] for pair in row["exchange"].split("/") if pair.startswith("0:")), None)
            if lemma and lemma.casefold() != row["word"].casefold():
                skipped["inflected_entry_with_other_lemma"] += 1
                continue
            if not decode(row["translation"]):
                skipped["missing_chinese_definition"] += 1
                continue
            key = row["word"].casefold()
            previous = candidates.get(key)
            if previous:
                skipped["duplicate_casefolded_word"] += 1
                if selection_key(previous) <= selection_key(row):
                    continue
            candidates[key] = row
    rows = sorted(candidates.values(), key=selection_key)[:limit]
    if limit is not None and len(rows) != limit:
        raise ValueError("Not enough eligible entries")
    limit = len(rows)
    version = "0.2.0" if args.expanded else "0.1.0"
    selection = "frq、BNC、考纲或柯林斯星级任一标记" if args.expanded else "正数 frq 排名"
    entries = []
    review = []
    for row in rows:
        word = row["word"]
        meanings = parse_meanings(row["translation"])
        if any(group["partsOfSpeech"] == ["unknown"] for group in meanings):
            review.append({"word": word, "reason": "含未分类或专业领域释义，保留原文，不推断词性", "sourceTranslation": decode(row["translation"])})
        rank = positive_rank(row["frq"])
        entries.append({"id": "ecdict-en-" + hashlib.sha256(word.casefold().encode()).hexdigest()[:20],
                        "word": word, "meanings": meanings,
                        "phonetics": {"uk": None, "us": None, "unclassified": row["phonetic"].strip() or None},
                        "frequency": {"source": "ecdict.frq", "rank": rank, "level": frequency_level(rank)},
                        "forms": parse_forms(row), "sourceId": "ecdict"})
    provenance = {"id": "ecdict", "name": "ECDICT", "url": "https://github.com/skywind3000/ECDICT",
                  "revision": metadata["commit"], "revisionDate": metadata["commitDate"],
                  "sha256": hashlib.sha256((source / "ecdict.csv").read_bytes()).hexdigest(),
                  "license": "MIT (repository declaration)", "licenseFile": "ECDICT-LICENSE.txt"}
    dictionary = {"schema": "hidict", "schemaVersion": 1, "id": f"hiwords-basic-en-{limit}",
                  "name": f"HiWords 基础英语词典（{limit}词）", "version": version,
                  "language": "en", "definitionLanguage": "zh-CN", "entryCount": limit,
                  "sources": [provenance], "frequencyScale": {"source": "ecdict.frq", "direction": "higher-level-more-frequent",
                  "bands": [{"level": level, "minRank": low, "maxRank": high} for level, low, high in BANDS]}, "entries": entries}
    filename = f"HiWords基础英语词典-{limit}.hidict"
    if args.gzip:
        write_hidict(output / filename, dictionary, compressed=True)
    elif args.compact:
        (output / filename).write_text(json.dumps(dictionary, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    else:
        write_json(output / filename, dictionary)
    sample_words = {"pattern", "a", "be", "run", "work", "can", "hello", "address", "take", "well", "I", "don't"}
    chosen = [entry for entry in entries if entry["word"] in sample_words]
    chosen_ids = {entry["id"] for entry in chosen}
    chosen += [entry for entry in entries if entry["id"] not in chosen_ids][:100 - len(chosen)]
    write_json(output / "开发样本-100词.hidict", {**dictionary, "id": "hiwords-basic-en-dev-sample", "name": "HiDict 开发样本（100词）", "entryCount": len(chosen), "entries": chosen})
    write_json(output / "pattern词条示例.json", next(entry for entry in entries if entry["word"] == "pattern"))
    write_json(output / "待校对记录.json", review)
    report = {"file": filename, "entries": limit, "eligibleSourceEntries": len(candidates), "skippedSourceRows": dict(skipped),
              "frequencyLevels": dict(collections.Counter(entry["frequency"]["level"] for entry in entries)),
              "maximumSelectedRank": max((entry["frequency"]["rank"] for entry in entries if entry["frequency"]["rank"] is not None), default=None),
              "selection": selection, "unknownFrequencyEntries": sum(entry["frequency"]["rank"] is None for entry in entries),
              "compact": args.compact or args.gzip, "compression": "gzip" if args.gzip else "none",
              "entriesWithForms": sum(bool(entry["forms"]) for entry in entries),
              "phoneticsCoverage": {"uk": 0, "us": 0, "unclassified": sum(bool(entry["phonetics"]["unclassified"]) for entry in entries)},
              "entriesNeedingPOSReview": len(review), "bytes": (output / filename).stat().st_size, "source": provenance}
    write_json(output / "生成报告.json", report)
    shutil.copyfile(source / "LICENSE", output / "ECDICT-LICENSE.txt")
    shutil.copyfile(Path(__file__).resolve().parent.parent / "docs/hidict.schema.json", output / "hidict.schema.json")
    (output / "使用说明.md").write_text(f"""# HiDict 基础英语词典 {version}

本目录包含 {limit:,} 个词条的 `.hidict` 词典、100词开发样本、JSON Schema、来源许可、生成报告与待校对记录。它与 `.hiwords` 是不同格式；请在 HiWords 设置 → 词库管理 → 离线词典中选择主词典文件。词典只用于查询，不直接添加为生词本或产生高亮。没有修改插件设置。

主词典存储方式：{"gzip（无需手动解压；需要支持 gzip 的 HiWords 插件）" if args.gzip else "UTF-8 JSON"}。

每词包含单词、按词性分组的中文释义、英美/未分类音标、五级词频及词形。不包含笔记、例句或学习卡片。

## 选词

从固定 ECDICT 提交 {metadata['commit']} 的 ecdict.csv 中选择有中文释义及{selection}的单词，排除空格短语和有明确其他基本词形的屈折词条，先按 frq 排序；无 frq 的词按 BNC（如果有）和拼写排序，得到 {limit:,} 个大小写去重词条。允许连字符、撇号词及专名；未依据考纲限制。不是“所有单词”或官方教学分级。

## 五级词频

5级：来源排名1–1000；4级：1001–3000；3级：3001–5000；2级：5001–10000；1级：10001及以后。

级数越高越常见，界面显示五个标记，点亮对应数量。这是 HiDict 自定义的排名分层，不是柯林斯星级、CEFR 或考试等级。frq 排名缺失时 rank/level 均使用 null，显示“词频未知”；不以 BNC 或考纲标记推断 frq 等级。此版 {sum(entry["frequency"]["rank"] is None for entry in entries):,} 词的词频未知。

## 音标与释义质量

ECDICT 未可靠区分英美音标，所以 uk/us 目前均为 null，原始音标保存在 unclassified 中。界面不能将它显示为 US 或 UK；数据存在历史音标符号，不保证统一为现代 IPA。英美音标可在未来版本由授权明确的来源补充。

保留原始中文内容并规范词性标签；vt/vi 等原标签也保留。没有标明词性的释义使用 unknown，不按相邻释义猜测。多个词性共享释义时保留多个标签；未将逗号分隔片段伪造为独立义项。英文义项未与中文强行配对。{len(review):,} 个词包含未分类释义，详见待校对记录.json；全库尚未逐词人工校对。图中的 pattern 示例见 pattern词条示例.json。

## 来源

https://github.com/skywind3000/ECDICT ，版本日期 {metadata['commitDate']}。保留本目录许可和生成报告。仓库声明 MIT，公开或商业发行前仍需核实底层内容来源并校对；本产物是本地开发初版。

## 重新生成

在插件项目目录运行 `python3 scripts/build-hidict.py SOURCE_DIRECTORY OUTPUT_DIRECTORY {("--expanded --compact" if args.expanded else str(limit)) + (" --gzip" if args.gzip else "")}`。输入目录需包含固定版本的 ecdict.csv、LICENSE、source.json（commit 和 commitDate）。输出会覆盖同名产物，请勿用作个人编辑文件。
""", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
