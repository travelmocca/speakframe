"""Send audio-only blind fixtures to Qwen; never persist credentials or request audio."""
import argparse
import base64
import concurrent.futures
import csv
import datetime
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
PROMPT = '''请直接听音频，测试中文口语表达分析能力。只输出一个JSON对象，不要Markdown。
不要润色转写；尽可能保留嗯、啊、呃、重复、未完成起句和改口。听不清写[听不清]，不要补全。
逐项区分冗余垫词、正常连接或指代、重复起句、自我修正；正常的然后、就是、这个、那个不应机械判为问题。
请统计下列词在原音中实际出现的次数：嗯、啊、呃、然后、就是、这个、那个。计数包括正常用法；未听到为0，不确定为null。按完整词匹配，不要把那个算进这个。不要把静音或噪声当成词。
时间位置只在可靠时给出，不确定填null；不要估造精确时间。无可辨识语音时明确说明，不生成转写和观点。
输出字段：has_speech布尔值；transcript字符串；counts对象（上述7个词到整数或null）；observations数组（每项含quote原话、type为filler/repetition/repair/normal、reason、start_s与end_s为数字或null）；issues数组（每项含dimension为抓重点/排顺序/展开内容/衔接与恢复/口头禅与语气垫词、evidence、suggestion）；uncertainty字符串。没有问题时issues可为空。'''

def configuration():
    paths=list(PROJECT.glob('*apiKey*.csv'))
    if len(paths)!=1:
        raise RuntimeError('Expected one local apiKey CSV export')
    with paths[0].open(encoding='utf-8-sig',newline='') as f:
        config={r[0]:r[1] for r in csv.reader(f) if len(r)>=2}
    key=config['apiKey'].strip()
    endpoint=config['openAiCompatible'].strip().rstrip('/')
    if endpoint.endswith('/chat/completions'):
        endpoint=endpoint[:-len('/chat/completions')]
    assert key.startswith('sk-')
    assert endpoint.startswith('https://') and '.aliyuncs.com' in endpoint
    return key,endpoint

def parse_json(content):
    cleaned=re.sub(r'^```(?:json)?\s*|\s*```$','',content.strip())
    try:return json.loads(cleaned)
    except (ValueError,TypeError):return None

def run_sample(s,model,out,key,endpoint,prompt):
    filename=out/(s['id']+'.json')
    if filename.exists():
        previous=json.loads(filename.read_text())
        if previous.get('status')=='ok' and previous.get('requested_model')==model:
            return s['id'],'cached'
    audio=base64.b64encode((ROOT/s['audio_file']).read_bytes()).decode('ascii')
    body={'model':model,'messages':[{'role':'user','content':[{'type':'input_audio','input_audio':{'data':'data:audio/wav;base64,'+audio,'format':'wav'}},{'type':'text','text':prompt}]}], 'modalities':['text'],'stream':True,'stream_options':{'include_usage':True},'enable_thinking':False,'max_tokens':4096}
    record={'sample_id':s['id'],'requested_model':model,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running'}
    started=time.monotonic();content='';usage=None;actual_model=None;finish=None;response_id=None
    req=urllib.request.Request(endpoint+'/chat/completions',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=180) as response:
            for raw in response:
                line=raw.decode('utf-8').strip()
                if not line.startswith('data:'):continue
                data=line[5:].strip()
                if data=='[DONE]':break
                chunk=json.loads(data)
                if 'error' in chunk:raise RuntimeError(json.dumps(chunk['error'],ensure_ascii=False))
                actual_model=chunk.get('model',actual_model);response_id=chunk.get('id',response_id)
                if chunk.get('usage'):usage=chunk['usage']
                for choice in chunk.get('choices',[]):
                    content+=choice.get('delta',{}).get('content') or ''
                    finish=choice.get('finish_reason') or finish
        record.update(status='ok' if content and finish!='length' else 'incomplete',content=content,parsed=parse_json(content),actual_model=actual_model,usage=usage,finish_reason=finish,response_id=response_id)
    except urllib.error.HTTPError as e:
        record.update(status='error',http_status=e.code,error=e.read().decode('utf-8',errors='replace').replace(key,'[REDACTED]'))
    except Exception as e:
        record.update(status='error',error=str(e).replace(key,'[REDACTED]'),partial_content=content)
    record['elapsed_s']=round(time.monotonic()-started,2)
    serialized=json.dumps(record,ensure_ascii=False,indent=2)
    assert key not in serialized
    filename.write_text(serialized,encoding='utf-8')
    return s['id'],record['status']

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--ids',default='');parser.add_argument('--model',default='qwen3.8-omni-flash')
    parser.add_argument('--profile',choices=['recognition','framework'],default='recognition')
    args=parser.parse_args();key,endpoint=configuration()
    manifest=json.loads((ROOT/'manifest.json').read_text())
    selected=[s for s in manifest if not args.ids or s['id'] in args.ids.split(',')]
    assert selected
    out=ROOT/'results'/args.model
    if args.profile=='framework':out=out/'framework-retest'
    out.mkdir(parents=True,exist_ok=True)
    prompt=PROMPT
    if args.profile=='framework':
        prompt+='''\n请另外逐一核查五个维度：抓重点（观点明确）、排顺序（组织有序）、展开内容（理由是否真的支持观点，不能只看因为所以句式）、衔接与恢复（重复、改口、重启）、口头禅与语气垫词（是否冗余）。普通连接和指代不算问题，但不应为无指代对象的“这个、那个”虚构前文。发现连续重复时，判断是否有必要，给出证据与一个改进动作。observations和issues必须一致；声音变小或变快不应改变相同词句的语义判定。请逐句复核转写中遗漏的短促声音。不能用口吃、结巴等词诊断说话人，只描述重复现象。时间戳无法准确对齐时全部填null。'''
    (out/'test-config.json').write_text(json.dumps({'requested_model':args.model,'prompt':prompt,'stream':True,'enable_thinking':False,'max_tokens':4096,'input':'audio only; no reference text or sample title','reference_limitation':'synthetic script reference; not human verified','concurrency':2},ensure_ascii=False,indent=2))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(run_sample,s,args.model,out,key,endpoint,prompt) for s in selected]
        for f in concurrent.futures.as_completed(futures):print(*f.result(),flush=True)
    results=[json.loads((out/(s['id']+'.json')).read_text()) for s in selected]
    print(json.dumps({'total':len(results),'ok':sum(r['status']=='ok' for r in results),'error':sum(r['status']=='error' for r in results),'parsed':sum(isinstance(r.get('parsed'),dict) for r in results)},ensure_ascii=False),flush=True)

if __name__=='__main__':
    assert parse_json('```json\n{"a":1}\n```')=={'a':1}
    assert parse_json('not JSON') is None
    main()
