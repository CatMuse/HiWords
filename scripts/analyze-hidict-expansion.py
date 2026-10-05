"""Evaluate ECDICT expansion tiers using previously audited Kaikki matches.
Usage: python3 scripts/analyze-hidict-expansion.py ECDICT_CSV AUDIT_DIRECTORY
"""
import csv, hashlib, importlib.util, json, re, sys
from pathlib import Path

def main():
    source, out = map(Path, sys.argv[1:3])
    hits = json.loads((out/'matched-phonetics.json').read_text())
    spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-hidict.py'))
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    rows = {}
    positive = lambda value: value.isdigit() and int(value)>0
    for row in csv.DictReader(source.open(encoding='utf-8-sig', newline='')):
        word = row['word'].casefold()
        if not re.fullmatch(r"[A-Za-z][A-Za-z'-]*",row['word']) or not row['translation'].strip(): continue
        lemma = next((s[2:] for s in row['exchange'].split('/') if s.startswith('0:')),None)
        if lemma and lemma.casefold()!=word: continue
        rows.setdefault(word,row)
    tiers = {'frequency':{}, 'frequencyOrBNC':{}, 'frequencyOrBNCOrExamOrStars':{}, 'allSingleHeadwords':rows}
    for word,row in rows.items():
        frq,bnc = positive(row['frq']), positive(row['bnc'])
        if frq: tiers['frequency'][word]=row
        if frq or bnc: tiers['frequencyOrBNC'][word]=row
        if frq or bnc or row['tag'].strip() or positive(row['collins']): tiers['frequencyOrBNCOrExamOrStars'][word]=row
    report={}
    for name,words in tiers.items():
        compact=pretty=uk=us=both=0
        unknown=0
        for word,row in words.items():
            rank=int(row['frq']) if positive(row['frq']) else None
            unknown+=rank is None
            e={'id':'ecdict-en-'+hashlib.sha256(word.encode()).hexdigest()[:20],'word':row['word'],
               'meanings':builder.parse_meanings(row['translation']), 'phonetics':{'uk':None,'us':None,'unclassified':row['phonetic'].strip() or None},
               'frequency':{'source':'ecdict.frq','rank':rank,'level':builder.frequency_level(rank)},'forms':builder.parse_forms(row),'sourceId':'ecdict'}
            compact+=len(json.dumps(e,ensure_ascii=False,separators=(',',':')).encode())+1
            pretty+=len(json.dumps(e,ensure_ascii=False,indent=2).encode())+2
            h=hits.get(word,{})
            uk+=bool(h.get('uk'));us+=bool(h.get('us'));both+=bool(h.get('uk') and h.get('us'))
        report[name]={'entries':len(words),'missingFRQ':unknown,'compactEntryMiB':round(compact/1024**2,2),'prettyEntryMiB':round(pretty/1024**2,2),
                      'kaikkiUK':uk,'kaikkiUS':us,'kaikkiBoth':both,
                      'userExamplesIncluded':{w:w in words for w in ['customizable','malleable','extensible']}}
    result={'source':str(source),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'tiers':report,
            'sizeNote':'Serialized entry payload estimates before IPA enrichment; no full dictionary was generated. Pretty JSON indentation differs from final package.',
            'selectionNote':'Single ASCII English words with Chinese definitions; exclude explicit inflection-to-other-lemma entries; casefold dedup. Frequency rank and level remain null when frq is unavailable; BNC is used only for inclusion.'}
    (out/'expansion-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
