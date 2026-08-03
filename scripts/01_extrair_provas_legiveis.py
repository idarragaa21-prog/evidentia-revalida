import fitz, re, json, unicodedata
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES

U=_FONTES
CLEAN={
 "2023/1":(f"{U}/2023_1_PV_objetiva_regular.pdf", f"{U}/2023_1_GB_objetiva_definitivo.pdf"),
 "2023/2":(f"{U}/2023_2_PV_objetiva_regular.pdf",  f"{U}/2023_2_GB_objetiva.pdf"),
 "2024/1":(f"{U}/2024_1_PV_objetiva_regular.pdf",  f"{U}/2024_1_GB_objetiva.pdf"),
}
STRIKE="̶"

def extract_text(path):
    d=fitz.open(path); out=[]
    for page in d: out.append(page.get_text("text"))
    d.close(); return "\n".join(out)

def parse_gabarito(path):
    d=fitz.open(path); t="\n".join(p.get_text("text") for p in d); d.close()
    # mark strikethrough-annulled: letter (opt space) + combining strike  -> ' ANULADA '
    t=re.sub(r'([A-E])\s*'+STRIKE, ' ANULADA ', t)
    t=t.replace(STRIKE,'')
    toks=t.split()
    seq=[]; state=None
    for tok in toks:
        low=tok.lower()
        if low.startswith("quest"): state="q"; continue
        if low.startswith("gabar"): state="g"; continue
        if state=="g":
            if tok=="ANULADA": seq.append("ANULADA")
            elif tok in ("A","B","C","D","E"): seq.append(tok)
            elif tok in ("-","—","–","‐","−"): seq.append("ANULADA")
            else: state=None
    seq=seq[:100]
    return {i+1:seq[i] for i in range(len(seq))}

QUEST_RE=re.compile(r'QUEST[ÃA]O\s+(\d{1,3})')
OPT_RE=re.compile(r'^([A-D])\s+(.*\S)')

def clean_lines(block):
    lines=[]
    for ln in block.split("\n"):
        s=ln.strip()
        if not s: continue
        if re.fullmatch(r'[0-9]{1,3}', s): continue
        if re.match(r'^(PROVA OBJETIVA|EDIÇÃO|Revalida|INEP|Exame Nacional)', s, re.I): continue
        if re.search(r'(PRIMEIRA|SEGUNDA|TERCEIRA)\s+EDI', s, re.I): continue
        if re.fullmatch(r'[!"#$%&\'()*+.\-–—á\s]{1,8}', s): continue
        lines.append(s)
    return lines

def parse_prova(path):
    text=extract_text(path)
    ms=list(QUEST_RE.finditer(text)); qs={}
    for i,m in enumerate(ms):
        num=int(m.group(1)); start=m.end()
        end=ms[i+1].start() if i+1<len(ms) else len(text)
        block=text[start:end]
        cut=re.search(r'question[aá]rio\s+de\s+percep', block, re.I)
        if cut: block=block[:cut.start()]
        lines=clean_lines(block)
        idx={}
        for j,ln in enumerate(lines):
            mo=OPT_RE.match(ln)
            if mo: idx.setdefault(mo.group(1), []).append(j)
        if not all(k in idx for k in "ABCD"):
            qs[num]={"error":"faltan","lines":lines}; continue
        dD=idx['D'][-1]
        cC=[x for x in idx['C'] if x<dD]; dC=cC[-1] if cC else None
        cB=[x for x in idx['B'] if dC is not None and x<dC]; dB=cB[-1] if cB else None
        cA=[x for x in idx['A'] if dB is not None and x<dB]; dA=cA[-1] if cA else None
        if None in (dA,dB,dC):
            qs[num]={"error":"orden","lines":lines}; continue
        enun=" ".join(lines[:dA]).strip()
        def opt(a,b):
            seg=lines[a:b]; seg=[re.sub(r'^[A-D]\s+','',seg[0])]+seg[1:]
            return " ".join(seg).strip()
        qs[num]={"enunciado":enun,"A":opt(dA,dB),"B":opt(dB,dC),"C":opt(dC,dD),"D":opt(dD,len(lines))}
    return qs

DATA={}
for ed,(pv,gb) in CLEAN.items():
    gg=parse_gabarito(gb); qq=parse_prova(pv); DATA[ed]={"gab":gg,"q":qq}
    errs=[n for n,v in qq.items() if "error" in v]
    anul=[n for n,v in gg.items() if v=="ANULADA"]
    print(f"[{ed}] Q={len(qq)} gab={len(gg)} errores={len(errs)} {errs[:8]} | anuladas={anul}")

json.dump(DATA, open("/home/claude/revalida/parsed_clean.json","w"), ensure_ascii=False)
# debug dump
d=DATA["2024/1"]["q"][1]
print("\n--- 2024/1 Q1 ---"); 
for k in ("enunciado","A","B","C","D"): print(k,":",str(d.get(k))[:120])
print("gab Q1:", DATA["2024/1"]["gab"][1])
