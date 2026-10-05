"""Normalize explicit pl. glosses into noun meanings; never match play/please.
Usage: python clean-hidict-plural.py FILE.hidict [--apply]
"""
from hidict_io import read_hidict, write_hidict
import argparse, copy, datetime, json, re, shutil
from pathlib import Path

PREFIX = re.compile(r'^\s*pl\.\s*', re.I)

def key(text):
    return re.sub(r'[\s,，;；。]', '', text)

def parts(text):
    result=[]; start=0; depth=0
    for i,c in enumerate(text):
        if c in '(（[': depth+=1
        elif c in ')）]': depth=max(0,depth-1)
        elif c in ',，;；' and not depth: result.append(text[start:i].strip());start=i+1
    result.append(text[start:].strip())
    return [t for t in result if t]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dictionary',type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    data=read_hidict(args.dictionary);before=copy.deepcopy(data); changes=[]; removed=0; retained=0; new_noun=0
    for e in data['entries']:
        if not any(PREFIX.match(t) for m in e['meanings'] for t in m['definitions']):continue
        original=copy.deepcopy(e); glosses=[]; groups=[]
        for m in e['meanings']:
            rest=[]
            for t in m['definitions']:
                if PREFIX.match(t):glosses.extend(parts(PREFIX.sub('',t,count=1)))
                else:rest.append(t)
            if rest:groups.append({**m,'definitions':rest})
        nouns=[m for m in groups if m['partsOfSpeech']==['noun']]
        if not nouns:
            noun={'partsOfSpeech':['noun'],'sourceLabels':['n'],'definitions':[]};groups.insert(0,noun);nouns=[noun];new_noun+=1
        known={key(t) for m in nouns for t in m['definitions']}
        # Parenthetical usage notes do not change an otherwise identical gloss.
        known.update(key(re.sub(r'[（(][^()（）]*[)）]','',t)) for m in nouns for t in m['definitions'])
        for t in glosses:
            if key(t) in known:removed+=1
            else:nouns[0]['definitions'].append(t);known.add(key(t));retained+=1
        e['meanings']=groups
        assert e['meanings'] and all(m['definitions'] for m in groups)
        assert {k:v for k,v in e.items() if k!='meanings'}=={k:v for k,v in original.items() if k!='meanings'}
        changes.append({'word':e['word'],'before':original['meanings'],'after':copy.deepcopy(groups)})
    assert data['entryCount']==before['entryCount']==len(data['entries'])
    assert not any(PREFIX.match(t) for e in data['entries'] for m in e['meanings'] for t in m['definitions'])
    from jsonschema import Draft202012Validator
    folder=args.dictionary.parent;validator=Draft202012Validator(json.loads((folder/'hidict.schema.json').read_text()));validator.validate(data)
    report={'changedWords':len(changes),'duplicateGlossesRemoved':removed,'glossesRetainedAsNouns':retained,'nounGroupsCreated':new_noun,'entryCount':data['entryCount'],'changes':changes,'rule':'仅处理明确pl.前缀；重复释义去重，新增含义归入名词；其他语法标记不变。'}
    if args.apply and changes:
        backup=folder.parent/('备份-pl释义清理前-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));shutil.copytree(folder,backup)
        if folder.with_suffix('.zip').exists():shutil.copy2(folder.with_suffix('.zip'),backup/folder.with_suffix('.zip').name)
        report['backup']=str(backup);data['version']='0.3.1'
        write_hidict(args.dictionary, data)
        (folder/'pl释义清理记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        by={e['word'].lower():e for e in data['entries']};sample=folder/'开发样本-100词.hidict'
        if sample.exists():
            s=read_hidict(sample);s['entries']=[by[e['word'].lower()] for e in s['entries']];s['version']=data['version'];validator.validate(s);write_hidict(sample, s)
    print(json.dumps({k:v for k,v in report.items() if k!='changes'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
