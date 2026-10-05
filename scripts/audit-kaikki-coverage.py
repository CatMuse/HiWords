"""Stream a complete English Kaikki snapshot; retain only target headwords and IPA.
Usage: python3 scripts/audit-kaikki-coverage.py DICTIONARY ECDICT_CSV OUTPUT_DIR [LOCAL_JSONL_GZ]
No dictionary or plugin settings are changed. JSONL is streamed, never loaded whole.
"""
from hidict_io import read_hidict
import collections, csv, gzip, hashlib, importlib.util, json, re, sys, time, urllib.request
from pathlib import Path
URL = 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl'
def key(s): return s.strip().casefold().replace('’', "'").replace('‘', "'")
def main():
    dictionary, csv_path, out = map(Path, sys.argv[1:4]); out.mkdir(parents=True, exist_ok=True)
    current = read_hidict(dictionary)
    targets = {key(e['word']) for e in current['entries']}
    examples = {'customizable', 'customisable', 'malleable', 'extensible'}
    spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-hidict.py'))
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    expanded = {}; source_examples = {}; source_ranked = {}; selected_ranked = {}
    for row in csv.DictReader(csv_path.open(encoding='utf-8-sig', newline='')):
        word = key(row['word'])
        if word in examples: source_examples[word] = {k: row[k] for k in ['word','translation','frq','bnc','exchange']}
        if not re.fullmatch(r"[A-Za-z][A-Za-z'-]*", row['word']) or not row['translation'].strip(): continue
        rank = int(row['frq']) if row['frq'].isdigit() and int(row['frq']) > 0 else None
        lemma = next((s[2:] for s in row['exchange'].split('/') if s.startswith('0:')), None)
        if lemma and key(lemma) != word: continue
        if word in expanded: continue
        expanded[word] = row
        if rank: source_ranked[word] = rank
    targets |= set(expanded) | examples
    hits = {}; sha = hashlib.sha256(); size = lines = english = malformed = 0; started = last = time.monotonic()
    request = urllib.request.Request(URL, headers={'Accept-Encoding': 'gzip', 'User-Agent': 'HiWords-Dictionary-Audit/1.0'})
    local = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    with (local.open('rb') if local else urllib.request.urlopen(request, timeout=180)) as response:
        metadata = {'localCompressedBytes': local.stat().st_size} if local else {k: response.headers.get(k) for k in ['Last-Modified','ETag','Content-Length','Content-Encoding']}
        stream = gzip.GzipFile(fileobj=response) if local or response.headers.get('Content-Encoding') == 'gzip' else response
        for raw in stream:
            sha.update(raw); size += len(raw); lines += 1
            try: row = json.loads(raw)
            except json.JSONDecodeError: malformed += 1; continue
            if row.get('lang_code') != 'en': continue
            english += 1; word = key(row.get('word', ''))
            if word not in targets: continue
            hit = hits.setdefault(word, {'uk': set(), 'us': set(), 'unclassified': set(), 'other': set(), 'pos': set()})
            if row.get('pos'): hit['pos'].add(row['pos'])
            for sound in row.get('sounds', []):
                ipa = sound.get('ipa')
                if not isinstance(ipa,str) or not ipa.strip(): continue
                tags = {t.casefold().replace('_','-').replace(' ','-') for t in sound.get('tags', []) + sound.get('raw_tags', []) if isinstance(t,str)}
                uk = bool(tags & {'uk','britain','british','received-pronunciation','rp','standard-british'})
                us = bool(tags & {'us','usa','united-states','general-american','american'})
                if uk: hit['uk'].add(ipa)
                if us: hit['us'].add(ipa)
                if not uk and not us: hit['other' if tags else 'unclassified'].add(ipa)
            if time.monotonic()-last>15:
                print(f'Streamed {size/1024**2:.0f} MiB; {lines:,} rows; {len(hits):,} target headwords', flush=True); last=time.monotonic()
    def coverage(words):
        total=len(words); matched=[hits[w] for w in words if w in hits]
        numbers={'headword':len(matched),'anyIPA':sum(any(h[k] for k in ['uk','us','unclassified','other']) for h in matched),
                 'uk':sum(bool(h['uk']) for h in matched),'us':sum(bool(h['us']) for h in matched),
                 'both':sum(bool(h['uk'] and h['us']) for h in matched),
                 'multipleUK':sum(len(h['uk'])>1 for h in matched),'multipleUS':sum(len(h['us'])>1 for h in matched)}
        return {'total':total,'counts':numbers,'percent':{k:round(v/total*100,2) for k,v in numbers.items()}}
    serial={word:{k:sorted(v) for k,v in h.items()} for word,h in sorted(hits.items())}
    compact=pretty=0
    for word,row in expanded.items():
        rank=source_ranked.get(word)
        entry={'id':'ecdict-en-'+hashlib.sha256(word.encode()).hexdigest()[:20], 'word':row['word'],
               'meanings':builder.parse_meanings(row['translation']), 'phonetics':{'uk':None,'us':None,'unclassified':row['phonetic'].strip() or None},
               'frequency':{'source':'ecdict.frq','rank':rank,'level':builder.frequency_level(rank)}, 'forms':builder.parse_forms(row), 'sourceId':'ecdict'}
        compact+=len(json.dumps(entry,ensure_ascii=False,separators=(',',':')).encode())+1
        pretty+=len(json.dumps(entry,ensure_ascii=False,indent=2).encode())+2
    ranked=sorted(source_ranked,key=source_ranked.get)
    report={'url':URL,'retrievedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'headers':metadata,
            'uncompressedBytes':size,'uncompressedSHA256':sha.hexdigest(),'rows':lines,'englishRows':english,'malformedRows':malformed,
            'seconds':round(time.monotonic()-started), 'current':coverage({key(e['word']) for e in current['entries']}),
            'expandedECDICT':coverage(set(expanded)), 'rankedECDICT':coverage(set(ranked)),
            'rankedOptions':{str(n):coverage(set(ranked[:n])) for n in [30000,50000,100000]},
            'examples':{w:{'current':any(key(e['word'])==w for e in current['entries']),'ecdict':source_examples.get(w),'kaikki':serial.get(w)} for w in sorted(examples)},
            'expandedDataSizeEstimate':{'compactEntryBytes':compact,'prettyEntryBytes':pretty,'note':'Entry payload only; excludes source metadata and additional UK/US phonetics.'},
            'method':'Casefold exact headword match; English records only; union across POS/senses; explicit UK/RP and US/General-American tags only; no inference from IPA or audio filenames.'}
    (out/'coverage-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (out/'matched-phonetics.json').write_text(json.dumps(serial,ensure_ascii=False,indent=2)+'\n')
    (out/'current-missing-headwords.json').write_text(json.dumps(sorted({key(e['word']) for e in current['entries']}-hits.keys()),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__': main()
