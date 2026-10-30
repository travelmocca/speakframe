"""Generate synthetic Mandarin audio fixtures locally with macOS say. No API calls."""
import csv
import io
import json
import math
import random
import subprocess
import tempfile
import wave
import zipfile
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SR = 16000
VOICE = 'Tingting'

def speech(text, kind='normal', gap=0.18):
    return {'text': text, 'kind': kind, 'gap_after_s': gap}

def pause(seconds):
    return {'text': '', 'kind': 'silence', 'gap_after_s': seconds}

clean = [speech('我建议把上线时间推迟两天。'), speech('因为支付接口还没有完成测试。'), speech('今天先修复问题，明天再做回归测试。')]
mixed = [speech('嗯', 'filler'), speech('我建议', gap=0.1), speech('就是', 'filler'), speech('先做小范围试用。'), speech('然后', 'filler'), speech('然后', 'filler'), speech('收集三位用户的反馈。'), speech('这个', 'filler'), pause(0.7), speech('再决定是否正式上线。')]

SAMPLES = []
def add(sid, title, segments, expectation, **options):
    SAMPLES.append(dict(id=sid, title=title, segments=segments, expected_checks=expectation, **options))

add('01', '干净表达对照', clean, '无刻意植入的垫词；不得为了凑问题而报告口头禅。')
add('02', '同内容加入嗯', [speech('嗯','filler'), clean[0], speech('嗯','filler'), clean[1], speech('嗯','filler'), clean[2]], '与01配对；脚本植入3次嗯，检查是否遗漏或合并。')
add('03', '啊与混合垫词', [speech('啊','filler'),speech('我觉得这次会议需要缩短。'),speech('啊','filler'),speech('嗯','filler'),speech('可以提前发材料，会上只讨论分歧。')], '识别2次啊、1次嗯；不要把明确建议评价为没有观点。')
add('04', '呃与较长思考间隔', [speech('呃','filler'),pause(0.6),speech('我的建议是先保留原来的方案。'),speech('呃','filler'),pause(1.0),speech('等测试结果出来以后再调整。')], '脚本有2次呃；同时存在静音，不得将静音计作额外垫词。')
add('05', '然后的机械重复', [speech('然后','filler'),speech('然后','filler'),speech('我想说的是先检查数据。'),speech('然后','filler'),speech('然后','filler'),speech('我们再决定要不要重跑。')], '4次然后；识别重复连接成分，给出具体位置。')
add('06', '就是的机械重复', [speech('就是','filler'),speech('这个项目'),speech('就是','filler'),speech('需要明确一个负责人。'),speech('就是','filler'),speech('避免每个人都以为别人在处理。')], '3次就是为刻意植入的赘余成分；不要只评价逻辑。')
add('07', '这个作为垫词', [speech('这个','filler'),pause(0.5),speech('我建议明天再讨论。'),speech('这个','filler'),pause(0.5),speech('今天还缺少关键数据。')], '2次这个用作犹豫成分；与16中的指示词用法区别。')
add('08', '那个作为垫词', [speech('那个','filler'),pause(0.5),speech('我想补充一个风险。'),speech('那个','filler'),speech('如果供应商晚交付，我们就没有测试时间了。')], '2次那个用作犹豫成分；与16配对。')
add('09', '单字重复起句', [speech('我','repetition',0.04),speech('我','repetition',0.04),speech('我觉得应该先确认需求。'),speech('再开始画页面。')], '保留我、我、我觉得的重复起句；这是合成重复，不代表临床口吃。')
add('10', '短语原样重复', [speech('我的意思是','repetition'),speech('我的意思是','repetition'),speech('我们先确认预算。'),speech('先确认预算','repetition'),speech('再决定买哪套设备。')], '识别短语重复，不将其自动顺滑成一遍。')
add('11', '数字改口与自我修正', [speech('我们周三上线。','repair'),pause(0.4),speech('不对，是周五上线。','repair'),speech('还有两天可以完成测试。')], '识别周三改为周五，最终安排为周五；不要把自我修正当垫词。')
add('12', '未完成起句后重启', [speech('我想先把这个需','restart'),pause(1.0),speech('我重新说一下。','restart'),speech('先确认需求，再安排开发。')], '保留未完成起句；属于人为拼接模拟，不能证明自然截断音节识别能力。')
add('13', '长停顿但无垫词', [speech('我建议保留两个方案。'),pause(2.5),speech('等成本测算完成以后，再做选择。')], '有额外2.5秒静音，无刻意植入垫词；暂停本身不能判为问题。')
add('14', '然后的正常连接用法', [speech('先登录系统，然后打开练习页面。'),speech('录完以后先回听，然后查看分析结果。')], '2次然后表达正常步骤关系，不应机械报告为口头禅。')
add('15', '就是的正常强调用法', [speech('我们现在最需要解决的，就是录音上传失败的问题。'),speech('责任人就是今天值班的工程师。')], '2次就是有实际语义，不应仅按词表误报。')
add('16', '这个那个的正常指代', [speech('这个方案成本低，那个方案上线快。'),speech('我倾向于这个方案，因为预算有限。')], '这个2次、那个1次均为指代；不应判为3个垫词。')
add('17', '混合垫词基准', mixed, '检查嗯1次、就是1次、然后连续2次、这个1次及额外静音；与19至22比较。')
add('18', '逻辑薄弱但无垫词', [speech('我认为应该立即上线。'),speech('因为办公室的椅子换了颜色。'),speech('所以上线风险肯定很低。')], '观点理由缺乏相关性；无刻意垫词，不应混淆内容问题与声音问题。')
add('19', '混合垫词慢速', mixed, '与17内容相同，仅合成速率改变；观察漏报变化。', rate=135)
add('20', '混合垫词快速', mixed, '与17内容相同，仅合成速率改变；观察漏报变化。', rate=245)
add('21', '仅垫词降低音量', mixed, '仅filler片段降低约18dB；主体音量不变，检查轻声垫词漏报。', filler_gain=0.126)
add('22', '混合垫词加底噪', mixed, '与17同一合成源，加入确定性白噪声，目标全片SNR为20dB；不是实际办公室录音。', snr_db=20)
add('23', '纯静音阴性对照', [pause(8.0)], '无语音；不得编造转写、垫词、观点或人物情绪。')
add('24', '纯噪声阴性对照', [pause(8.0)], '仅合成白噪声，无语音；不得幻觉出嗯啊或句子。', noise_only=True)

CACHE = {}
def pcm_for(text, rate):
    key = (text, rate)
    if key not in CACHE:
        with tempfile.TemporaryDirectory() as td:
            source, target = Path(td)/'voice.aiff', Path(td)/'voice.wav'
            subprocess.run(['say','-v',VOICE,'-r',str(rate),'-o',str(source),text],check=True,capture_output=True)
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ac','1','-ar',str(SR),'-c:a','pcm_s16le',str(target)],check=True,capture_output=True)
            with wave.open(str(target),'rb') as f:
                CACHE[key] = array('h', f.readframes(f.getnframes()))
    return array('h', CACHE[key])

def write_wav(path, samples):
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes(samples.tobytes())

def main():
    audio_dir = ROOT/'audio'; audio_dir.mkdir(exist_ok=True)
    manifest=[]
    for s in SAMPLES:
        pcm=array('h'); timeline=[]; rate=s.get('rate',185)
        for seg in s['segments']:
            start=len(pcm)/SR
            if seg['text']:
                part=pcm_for(seg['text'],rate)
                if seg['kind']=='filler' and 'filler_gain' in s:
                    part=array('h',(round(x*s['filler_gain']) for x in part))
                pcm.extend(part)
                timeline.append(dict(start_s=round(start,3),end_s=round(len(pcm)/SR,3),text=seg['text'],kind=seg['kind'],timing_basis='synthesis segment boundary; not phoneme/word alignment'))
            gap=seg['gap_after_s']
            gap_start=len(pcm)/SR
            pcm.extend(array('h',[0])*round(gap*SR))
            if gap>=0.5:
                timeline.append(dict(start_s=round(gap_start,3),end_s=round(len(pcm)/SR,3),text='',kind='inserted_silence'))
        rng=random.Random(20261030+int(s['id']))
        rms=math.sqrt(sum(x*x for x in pcm)/max(1,len(pcm)))
        sigma=500 if s.get('noise_only') else (rms/(10**(s['snr_db']/20)) if 'snr_db' in s else 0)
        clipped=0
        if sigma:
            mixed_pcm=array('h')
            for x in pcm:
                value=round(x+rng.gauss(0,sigma))
                clipped+=int(value>32767 or value< -32768)
                mixed_pcm.append(max(-32768,min(32767,value)))
            pcm=mixed_pcm
        path=audio_dir/(s['id']+'.wav'); write_wav(path,pcm)
        row={**s,'audio_file':str(path.relative_to(ROOT)),'voice':VOICE,'synthesis_rate':rate,'duration_s':round(len(pcm)/SR,3),'sample_rate':SR,'channels':1,'clipped_samples':clipped,'timeline':timeline,'reference_status':'script_reference_not_human_audio_verified','reference_text':' '.join(x['text'] for x in s['segments'] if x['text'])}
        manifest.append(row)
        print(s['id'],s['title'],row['duration_s'],flush=True)
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    with (ROOT/'samples.csv').open('w',encoding='utf-8-sig',newline='') as f:
        fields=['id','title','audio_file','duration_s','reference_text','expected_checks','reference_status']
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(manifest)
    md=['# 千问 Omni 中文表达分析样本（合成）','','日期：2026-10-30。共24条，WAV / 16kHz / 单声道 / 16-bit PCM。','',
        '## 使用边界','','本包由本机 macOS Tingting 合成音及确定性音频处理生成，无真人录音、无声音克隆、未调用千问。各次重新合成可能随系统音色版本变化。',
        '脚本和片段时间轴是设计参考，尚未经人工逐条听校，不能作为已确认的逐字金标准。时间轴标记合成片段边界，含引擎可能附带的静音，不是精确的发声起止时间。',
        '特别是呃、轻声嗯和截断起句，TTS可能发音规整或异常。合成语速、静音和白噪声只能提供可控变量，不能替代自然停顿、真实呼吸、口音和真实环境噪声。',
        '## 测试步骤','','1. 先逐条试听，确认实际声音与设计一致，必要时修正参考标注。',
        '2. 给模型只提供音频和统一提示，不提供样本标题、参考脚本或预期结果，避免泄露答案。',
        '3. 保存实际请求模型ID、时间、参数、原始响应和错误；先核对识别事实，再评价建议质量。',
        '4. 核查垫词遗漏、正常用法误报、重复保留、证据定位和静音/噪声幻觉。通用转写准确率不能替代这些指标。',
        '5. 通过本包只说明合成功能样本表现；自然中文口语适配性仍须真人录音验证。','',
        '## 统一测试提示','','```text',
        '请直接听这段音频，分析口头禅、语气垫词、重复和改口。不要润色或删除不流畅内容。',
        '先尽可能逐字转写，保留嗯、啊、呃、重复和未完成起句。听不清就标记，不要补全。',
        '逐项报告听到的候选词或片段、出现次数、前后原话、在本语境中是否为冗余垫词及理由。',
        '仅当能够可靠定位时给出时间范围；否则明确无法准确定位，不编造精确时间戳。',
        '区分正常连接词、指示词、自我修正和垫词；不以出现这些词就断定表达差。',
        '若没有可辨识语音，明确说明，不生成不存在的内容。最后只选择一个有证据的问题给出改进动作；没有则不强行给出。',
        '```','','## 样本内容','']
    for s in manifest:
        md.extend([f"### {s['id']} · {s['title']}（{s['duration_s']}秒）",'',f"音频：[试听]({s['audio_file']})",'',f"设计脚本：{s['reference_text'] or '无语音'}",'',f"预期检查：{s['expected_checks']}",''])
    (ROOT/'样本说明.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    # Regenerating replaces only this generated package archive.
    with zipfile.ZipFile(ROOT.parent/'omni-audio-samples.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(ROOT.rglob('*')):
            if p.is_file():z.write(p,Path(ROOT.name)/p.relative_to(ROOT))
    print('DONE',len(manifest),'samples',round(sum(x['duration_s'] for x in manifest),1),'seconds',flush=True)

if __name__=='__main__':
    main()
