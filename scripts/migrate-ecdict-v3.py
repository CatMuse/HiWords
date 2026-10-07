"""Stage a lossless ECDICT v2 -> v3 conversion in a separate directory.

Usage: python3 scripts/migrate-ecdict-v3.py INPUT_DIRECTORY OUTPUT_DIRECTORY
The input files are never modified. Validate staged output before installing it.
"""
import json
from pathlib import Path
import sys

FORM_TYPES = {"past": "past", "past participle": "pastParticiple",
              "present participle": "presentParticiple",
              "third-person singular": "thirdPersonSingular", "plural": "plural",
              "comparative": "comparative", "superlative": "superlative"}


def convert(pack):
    if pack.get("schema") != "hiwords" or pack.get("schemaVersion") != 2:
        raise ValueError("Expected a hiwords v2 pack")
    if pack.get("cardKind") != "language.word" or pack.get("provenance", {}).get("project") != "ECDICT":
        raise ValueError("This converter only handles ECDICT language packs")
    provenance = pack["provenance"]
    pack["schemaVersion"] = 3
    for card in pack["cards"]:
        data = card["data"]
        if set(data) - {"language", "itemType", "meanings", "forms"}:
            raise ValueError(f"Unexpected content fields in {card['id']}; review manually")
        data["translationLanguage"] = "zh-CN"
        for meaning in data["meanings"]:
            meaning["partsOfSpeech"] = [meaning.pop("partOfSpeech")]
            if meaning.get("definition") == "":
                del meaning["definition"]
        if "forms" in data:
            forms = {}
            for old in data["forms"]:
                if set(old) != {"form", "type"}:
                    raise ValueError("Unexpected form fields")
                item = forms.setdefault(old["form"], {"text": old["form"], "types": []})
                form_type = FORM_TYPES[old["type"]]
                if form_type not in item["types"]:
                    item["types"].append(form_type)
            data["forms"] = list(forms.values())
        phonetic = card.get("fieldValues", {}).get("source_phonetic")
        if phonetic:
            data["phonetics"] = {"unclassified": phonetic}
        # Record acquisition history; do not claim that possibly edited content
        # remains an unmodified dictionary quotation by adding sourceIds.
        data["sources"] = [{"id": "ecdict", "type": "dictionary", "name": "ECDICT",
                            "url": provenance["url"], "version": provenance["commit"], "license": "MIT"}]
    order = pack.get("display", {}).get("moduleOrder", [])
    order[:] = ["phonetics" if item == "field:source_phonetic" else item for item in order]
    if "sources" not in order:
        order.append("sources")
    return pack


def main():
    source, output = map(Path, sys.argv[1:3])
    if source.resolve() == output.resolve():
        raise ValueError("Output must be a separate staging directory")
    output.mkdir(parents=True, exist_ok=True)
    for file in sorted(source.glob("*.hiwords")):
        pack = convert(json.loads(file.read_text(encoding="utf-8")))
        target = output / file.name
        with target.open("x", encoding="utf-8") as handle:
            handle.write(json.dumps(pack, ensure_ascii=False, indent=2) + "\n")
        print(f"{file.name}: {len(pack['cards'])} cards staged")


if __name__ == "__main__":
    main()
