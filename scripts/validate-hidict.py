"""Validate schema, source fidelity and semantic invariants of generated HiDicts.

Usage: python scripts/validate-hidict.py OUTPUT_DIRECTORY SOURCE_DIRECTORY
Requires jsonschema (validation tooling only; not a plugin dependency).
"""
from hidict_io import read_hidict
import collections
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from jsonschema import Draft202012Validator


def main():
    output, source = map(Path, sys.argv[1:3])
    spec = importlib.util.spec_from_file_location("hidict_builder", Path(__file__).with_name("build-hidict.py"))
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    # Boundary cases ensure shared POS and legacy labels are not misclassified.
    assert builder.parse_meanings("n. and v. 测试")[0]["partsOfSpeech"] == ["noun", "verb"]
    assert builder.parse_meanings("num. 一")[0]["partsOfSpeech"] == ["numeral"]
    assert builder.parse_meanings("vt. 测试\\n[计] 技术义")[-1]["partsOfSpeech"] == ["unknown"]
    assert [builder.frequency_level(rank) for rank in [1, 1000, 1001, 3000, 3001, 5000, 5001, 10000, 10001, None]] == [5, 5, 4, 4, 3, 3, 2, 2, 1, None]
    schema = json.loads((output / "hidict.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    source_rows = {}
    with (source / "ecdict.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            key = row['word'].casefold()
            previous = source_rows.get(key)
            if previous is None or builder.selection_key(row) < builder.selection_key(previous):
                source_rows[key] = row
    source_hash = hashlib.sha256((source / "ecdict.csv").read_bytes()).hexdigest()
    reports = []
    for file in sorted(output.glob("*.hidict")):
        dictionary = read_hidict(file)
        validator.validate(dictionary)
        assert dictionary["entryCount"] == len(dictionary["entries"])
        assert len({entry["id"] for entry in dictionary["entries"]}) == dictionary["entryCount"]
        assert len({entry["word"].casefold() for entry in dictionary["entries"]}) == dictionary["entryCount"]
        source_ids = {entry["id"] for entry in dictionary["sources"]}
        assert dictionary["sources"][0]["sha256"] == source_hash
        for entry in dictionary["entries"]:
            row = source_rows[entry["word"].casefold()]
            assert entry["sourceId"] in source_ids
            rank = builder.positive_rank(row["frq"])
            assert entry["frequency"]["rank"] == rank
            assert entry["frequency"]["level"] == builder.frequency_level(rank)
            assert entry["phonetics"] == {"uk": None, "us": None, "unclassified": row["phonetic"].strip() or None}
            # Compare retained source text independent of POS grouping.
            original = set()
            for line in builder.decode(row["translation"]).splitlines():
                line = line.strip()
                match = builder.PREFIX.match(line)
                content = line[match.end():].strip() if match else line
                if content:
                    original.add(content)
            retained = {text for meaning in entry["meanings"] for text in meaning["definitions"]}
            assert retained == original, f"Lost or invented source definition: {entry['word']}"
            assert entry["forms"] == builder.parse_forms(row)
        if dictionary["entryCount"] > 100:
            keys = [builder.selection_key(source_rows[entry["word"].casefold()]) for entry in dictionary["entries"]]
            assert keys == sorted(keys)
            pattern = next(entry for entry in dictionary["entries"] if entry["word"] == "pattern")
            assert any(meaning["partsOfSpeech"] == ["noun"] for meaning in pattern["meanings"])
            inflection = next(form for form in pattern["forms"] if form["word"] == "patterned")
            assert set(inflection["types"]) == {"past", "pastParticiple"}
        reports.append({"file": file.name, "entries": dictionary["entryCount"], "bytes": file.stat().st_size})
    assert len(reports) == 2
    report = {"passed": True, "files": reports, "checks": ["JSON Schema Draft 2020-12", "unique casefolded words and stable IDs", "entry count", "source SHA-256", "full Chinese source text preservation", "original phonetics without fabricated accents", "frequency thresholds", "source word forms"], "limitations": "No UI or mobile testing in this data validation; dictionary content not manually proofread; classified UK/US phonetics remain missing."}
    (output / "验证报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
