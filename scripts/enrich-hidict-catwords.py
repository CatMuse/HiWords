"""Enrich a HiDict from local CatWords notes, with backups and a field-level audit.

Usage: python enrich-hidict-catwords.py WORDS_DIR HIDICT ECDICT_CSV [--apply]
Chinese definitions retain distinct source senses; case-ambiguous abbreviations
and phrases are queued for review. No network access or source-note writes.
"""
from hidict_io import read_hidict, write_hidict
import argparse, collections, copy, csv, datetime, hashlib, importlib.util, json, re, shutil
from pathlib import Path

POS = {'n':'noun','v':'verb','vt':'verb','vi':'verb','adj':'adjective','adv':'adverb','conj':'conjunction','int':'interjection','prep':'preposition','pron':'pronoun','det':'determiner','modal':'modal','num':'numeral','aux':'auxiliary','art':'determiner'}
FORMS = {'word_pl':'plural','word_third':'thirdPersonSingular','word_ing':'presentParticiple','word_done':'pastParticiple','word_past':'past'}
WORD = re.compile(r"[a-z]+(?:['-][a-z]+)*")

def normalized(text):
    return re.sub(r'[\s，,；;。/（）()]', '', text)

def definition_parts(text):
    # Do not split punctuation inside usage notes or parenthetical glosses.
    depth = 0; start = 0; result = []
    for i, char in enumerate(text):
        if char in '(（[': depth += 1
        elif char in ')）]': depth = max(0, depth-1)
        elif char in ',，;；' and depth == 0:
            result.append(text[start:i].strip()); start = i+1
    result.append(text[start:].strip())
    return [part for part in result if part]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('notes', type=Path); parser.add_argument('dictionary', type=Path); parser.add_argument('ecdict', type=Path); parser.add_argument('--apply', action='store_true'); parser.add_argument('--preview-file', type=Path)
    args = parser.parse_args(); folder = args.dictionary.parent
    data = read_hidict(args.dictionary); previous = copy.deepcopy(data)
    existing = {e['word'].lower():e for e in data['entries']}
    aliases = {f['word'].lower() for e in data['entries'] for f in e['forms']}
    editorial = folder/'93词校对恢复记录.json'
    protected = {e['word'].lower() for e in json.loads(editorial.read_text())['entries']} if editorial.exists() else set()
    domains = set(json.loads((folder/'领域释义清理报告.json').read_text())['domainLabels'])
    spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-hidict.py'))
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    rows = {}
    with args.ecdict.open(newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            key = row['word'].lower()
            if key not in rows or builder.selection_key(row)<builder.selection_key(rows[key]): rows[key]=row
    source_hash = hashlib.sha256(); changes=[]; skipped=[]; counters=collections.Counter()
    for path in sorted(args.notes.rglob('*.md')):
        text = path.read_text(); source_hash.update(str(path.relative_to(args.notes)).encode()); source_hash.update(text.encode())
        title = re.search(r'^#\s+(.+)$',text,re.M); word = (title[1] if title else path.stem).strip().lower()
        if word == "con'": word='con'
        if not WORD.fullmatch(word):
            counters['phrase_or_unsupported_title']+=1; continue
        raw = re.findall(r'^\s*(?:-\s*)?#词性/(\S+)\s+(.+)$',text,re.M)
        # All source names were lowercased: abbreviations can change the sense of a word.
        if any(p=='abbr' for p,t in raw) or word in {'aids','us'}:
            skipped.append({'word':word,'reason':'大小写/缩写含义需人工确认','file':str(path)}); continue
        if word not in existing and word in aliases:
            counters['already_resolves_as_form']+=1; continue
        local=[]
        for label,definition in raw:
            if label not in POS:
                skipped.append({'word':word,'reason':'未自动映射的词性 '+label,'file':str(path)}); continue
            parts=[]
            for part in re.split(r'[；;]',definition):
                tags = re.findall(r'\[([^\]]+)\]|<([^>]+)>',part)
                if any((a or b).strip() in domains for a,b in tags): continue
                part=part.strip()
                if part and part not in parts: parts.append(part)
            if parts: local.append({'partsOfSpeech':[POS[label]],'sourceLabels':[label],'definitions':parts})
        if not local:
            skipped.append({'word':word,'reason':'无可安全合并的词性释义','file':str(path)}); continue
        before=copy.deepcopy(existing.get(word)); entry=existing.get(word)
        row=rows.get(word)
        if entry is None:
            rank=builder.positive_rank(row['frq']) if row else None
            entry={'id':'catwords-en-'+hashlib.sha256(word.encode()).hexdigest()[:20],'word':word,'meanings':local,'phonetics':{'uk':None,'us':None,'unclassified':None},'frequency':{'source':'ecdict.frq','rank':rank,'level':builder.frequency_level(rank)},'forms':builder.parse_forms(row) if row else [],'sourceId':'catwords'}
            existing[word]=entry; data['entries'].append(entry);counters['added']+=1
        elif word not in protected:
            combined=copy.deepcopy(local)
            for old in entry['meanings']:
                candidates=[m for m in combined if m['partsOfSpeech']==old['partsOfSpeech']]
                if not candidates: combined.append(copy.deepcopy(old)); continue
                exact = next((m for m in candidates if m['sourceLabels']==old['sourceLabels']), None)
                if old['sourceLabels'] in [['vt'],['vi']] and exact is None and not any(m['sourceLabels']==['v'] for m in candidates):
                    combined.append(copy.deepcopy(old)); continue
                hay=normalized('；'.join(t for m in candidates for t in m['definitions']))
                extra=[]
                for definition in old['definitions']:
                    for atom in definition_parts(definition):
                        if normalized(atom) not in hay and atom not in extra: extra.append(atom)
                if extra:
                    target=next((m for m in candidates if m['sourceLabels']==old['sourceLabels']),candidates[0])
                    target['definitions'].extend(t for t in extra if t not in target['definitions'])
            entry['meanings']=combined
        for key,label in [('uk','英'),('us','美')]:
            match=re.search(label+r'[：:]\s*/([^/\n]*)/',text)
            value=match[1].strip() if match else None
            if value and value not in {'-','—','无','None'}:
                if entry['phonetics'][key] is None: entry['phonetics'][key]=value;counters[key+'_filled']+=1
                elif entry['phonetics'][key]!=value: skipped.append({'word':word,'reason':key+'音标冲突，保留现有值','existing':entry['phonetics'][key],'candidate':value})
        if entry['phonetics']['uk'] and entry['phonetics']['us']: entry['phonetics']['unclassified']=None
        forms={f['word']:list(f['types']) for f in entry['forms']}
        for kind,value in re.findall(r'^\s*-\s*#形态/(\S+)\s+(.+)$',text,re.M):
            if kind not in FORMS: continue
            for variant in re.split(r'[,，;/、\s]+',value.strip()):
                if not WORD.fullmatch(variant.lower()) or variant.lower()==word: continue
                types=forms.setdefault(variant,[])
                if FORMS[kind] not in types: types.append(FORMS[kind]);counters['form_types_added']+=1
        entry['forms']=[{'word':w,'types':types} for w,types in forms.items()]
        if before!=entry:
            counters['changed_existing' if before else 'new_records']+=1
            changes.append({'word':word,'file':str(path),'before':before,'after':copy.deepcopy(entry),'editorialMeaningsPreserved':word in protected})
    data['entryCount']=len(data['entries']);data['name']='HiWords 基础英语词典';data['version']='0.3.0'
    data['sources']=[s for s in data['sources'] if s['id']!='catwords']+[{'id':'catwords','name':'本地 CatWords Markdown 词库','url':args.notes.resolve().as_uri(),'revision':source_hash.hexdigest(),'revisionDate':datetime.datetime.now().isoformat(),'sha256':source_hash.hexdigest(),'license':'原数据再分发许可尚未确认；此合并用于用户本地词典','licenseFile':'CATWORDS-SOURCE.txt'}]
    from jsonschema import Draft202012Validator
    Draft202012Validator(json.loads((folder/'hidict.schema.json').read_text())).validate(data)
    assert len({e['word'].lower() for e in data['entries']})==len(data['entries'])
    for e in previous['entries']:
        new=existing[e['word'].lower()];assert new['id']==e['id'] and new['frequency']==e['frequency']
        if e['word'].lower() in protected: assert new['meanings']==e['meanings']
    report={'beforeCount':previous['entryCount'],'afterCount':data['entryCount'],'counters':dict(counters),'source':str(args.notes),'changes':changes,'review':skipped,'note':'保留既有词频和93词修订释义；本地内容未人工逐条审定；例句和考纲标签未导入。'}
    if args.preview_file: args.preview_file.write_text(json.dumps({'dictionary':data,'report':report},ensure_ascii=False,separators=(',',':')))
    if args.apply:
        backup=folder.parent/('备份-CatWords合并前-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));shutil.copytree(folder,backup)
        if folder.with_suffix('.zip').exists(): shutil.copy2(folder.with_suffix('.zip'),backup/folder.with_suffix('.zip').name)
        report['backup']=str(backup)
        write_hidict(args.dictionary, data)
        audit=folder.parent/'CatWords合并复查'; audit.mkdir(exist_ok=True)
        (audit/'CatWords合并记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        summary={k:v for k,v in report.items() if k not in {'changes','review'}}
        summary['detailReport']=str(audit/'CatWords合并记录.json')
        summary['review']=skipped
        (folder/'CatWords合并摘要.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
        (folder/'CATWORDS-SOURCE.txt').write_text('本地数据源：'+str(args.notes)+'\n原数据再分发许可未确认。来源说明参考 CATMUSE/Cards/CatWords/英语文档/英语说明.md；其中OpenWords链接仅作为标签/属性设计参考，不能证明释义许可。\n合并时保留字段级前后记录，不声称这些释义属于ECDICT。\n')
        sample=folder/'开发样本-100词.hidict'
        if sample.exists():
            s=read_hidict(sample);s['entries']=[existing[e['word'].lower()] for e in s['entries']];s['sources']=data['sources'];s['version']=data['version'];write_hidict(sample, s);Draft202012Validator(json.loads((folder/'hidict.schema.json').read_text())).validate(s)
        (folder/'pattern词条示例.json').write_text(json.dumps(existing['pattern'],ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in {'changes','review'}},ensure_ascii=False,indent=2)); print('待复查记录',len(skipped))

if __name__=='__main__': main()
