import fitz, glob, json, collections, numpy as np
from PIL import Image
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
U=_FONTES
d=fitz.open(glob.glob(U+"/*2024_2_PV*")[0])
DOM="TT2BFD82o00"; Z=6; CAP=40
samples=collections.defaultdict(list)   # code -> [(vec, page, idx)]
occ=collections.defaultdict(int)
for p in range(1,len(d)):
    pix=d[p].get_pixmap(matrix=fitz.Matrix(Z,Z))
    img=Image.frombytes("RGB",(pix.width,pix.height),pix.samples).convert("L")
    A=np.asarray(img)
    for blk in d[p].get_text("rawdict")["blocks"]:
        if blk["type"]!=0: continue
        for ln in blk["lines"]:
            for sp in ln["spans"]:
                if sp["font"]!=DOM: continue
                for ch in sp["chars"]:
                    c=ch["c"]
                    if c.isspace(): continue
                    occ[c]+=1
                    if len(samples[c])>=CAP: continue
                    x0,y0,x1,y1=[v*Z for v in ch["bbox"]]
                    x0=int(x0); y0=int(y0); x1=int(np.ceil(x1)); y1=int(np.ceil(y1))
                    if x1-x0<3 or y1-y0<5: continue
                    sub=A[max(0,y0):y1, max(0,x0):x1]
                    if sub.size==0: continue
                    im=Image.fromarray(sub).resize((12,16), Image.LANCZOS)
                    v=np.asarray(im,dtype=np.float32).ravel()
                    v=(v-v.mean())/(v.std()+1e-6)
                    samples[c].append((v.tolist(),p))
np.save("occ.npy", np.array([1]))
json.dump({c:n for c,n in occ.items()}, open("occ.json","w"), ensure_ascii=False)
out={}
for c,lst in samples.items():
    if len(lst)<4: continue
    V=np.array([x[0] for x in lst])
    # clustering simple: semilla = primer vector; asignar por distancia
    cents=[V[0]]; lab=[0]
    for v in V[1:]:
        ds=[np.linalg.norm(v-ct) for ct in cents]
        i=int(np.argmin(ds))
        if ds[i]<14.0: lab.append(i); cents[i]=(cents[i]*0.8+v*0.2)
        else: cents.append(v); lab.append(len(cents)-1)
    cnt=collections.Counter(lab)
    if len(cnt)>1:
        out[c]={"n":occ[c],"clusters":{str(k):v for k,v in cnt.items()}}
json.dump(out, open("shape_amb.json","w"), ensure_ascii=False)
print("códigos con más de una forma:",len(out))
for c,info in sorted(out.items(), key=lambda kv:-kv[1]["n"])[:25]:
    print(f"   {c!r} n={info['n']} clusters={info['clusters']}")
