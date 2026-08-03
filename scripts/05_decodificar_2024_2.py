import fitz, glob, json, re, collections, numpy as np
from PIL import Image
U=_FONTES
d=fitz.open(glob.glob(U+"/*2024_2_PV*")[0])
CIP=json.load(open("ciphers_all.json")); DOM="TT2BFD82o00"; Z=6
DIS=json.load(open("disamb.json"))
# centroides por código ambiguo
CENT={}; MAPPING={"k":{0:"+",1:"7"}, "y":{0:"T",1:":"}}
import numpy as np
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
for c,r in DIS.items():
    pass
# recomputar centroides a partir de vectores guardados en disamb (no guardó vec) -> recomputar
def shape_vec(A,bbox):
    x0,y0,x1,y1=[v*Z for v in bbox]
    x0,y0,x1,y1=int(x0),int(y0),int(np.ceil(x1)),int(np.ceil(y1))
    sub=A[max(0,y0):y1,max(0,x0):x1]
    if sub.size==0: return None
    im=Image.fromarray(sub).resize((12,16),Image.LANCZOS)
    v=np.asarray(im,dtype=np.float32).ravel()
    return (v-v.mean())/(v.std()+1e-6)
# primera pasada: recolectar vectores por código ambiguo y reconstruir centroides con las etiquetas guardadas
vecs=collections.defaultdict(list)
for c,r in DIS.items():
    for o in r["occ"]:
        vecs[c].append((o["page"],tuple(o["bbox"])))
pagecache={}
def getA(p):
    if p not in pagecache:
        if len(pagecache)>2: pagecache.clear()
        pix=d[p].get_pixmap(matrix=fitz.Matrix(Z,Z))
        pagecache[p]=np.asarray(Image.frombytes("RGB",(pix.width,pix.height),pix.samples).convert("L"))
    return pagecache[p]
for c,r in DIS.items():
    V=[]
    for o in r["occ"]:
        v=shape_vec(getA(o["page"]),o["bbox"]); V.append(v)
    lab=r["labels"]
    ks=sorted(set(lab))
    CENT[c]={k: np.mean([V[i] for i,l in enumerate(lab) if l==k and V[i] is not None],axis=0) for k in ks}
def classify(c,A,bbox):
    v=shape_vec(A,bbox)
    if v is None: return None
    best=min(CENT[c].items(), key=lambda kv: np.linalg.norm(v-kv[1]))
    return MAPPING[c].get(best[0])
def page_text(p):
    A=getA(p) if any(True for _ in [0]) else None
    lines=[]
    for blk in d[p].get_text("rawdict")["blocks"]:
        if blk["type"]!=0: continue
        for ln in blk["lines"]:
            s=""
            for sp in ln["spans"]:
                f=sp["font"]; cip=CIP.get(f)
                if cip=="DROP": continue
                for ch in sp["chars"]:
                    c=ch["c"]
                    if c.isspace(): s+=" "; continue
                    if f==DOM and c in MAPPING:
                        r=classify(c,A,ch["bbox"]); s+= r if r else "�"; continue
                    if cip=="ID": s+=c
                    elif isinstance(cip,dict) and c in cip: s+=cip[c]
                    elif f==DOM and c=="á": s+=" "
                    else: s+="�"
            if s.strip(): lines.append((ln["bbox"][0],ln["bbox"][1],s))
    W=d[p].rect.width
    L=sorted([l for l in lines if l[0]<W/2],key=lambda t:t[1])
    R=sorted([l for l in lines if l[0]>=W/2],key=lambda t:t[1])
    return "\n".join(t for _,_,t in L+R)
full="\n".join(page_text(p) for p in range(1,len(d)))
full=re.sub(r'[ \t]+',' ',full)
open("dec_2024_2.txt","w",encoding="utf-8").write(full)
ms=list(re.finditer(r'QUEST[ÃA]O\s*(\d{1,3})',full))
qs={int(m.group(1)): full[m.end():(ms[i+1].start() if i+1<len(ms) else len(full))] for i,m in enumerate(ms)}
json.dump({str(k):v for k,v in qs.items()},open("qs_raw.json","w"),ensure_ascii=False)
print("questões:",len(qs),"| limpias:",sum(1 for t in qs.values() if "�" not in t))
