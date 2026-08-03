import fitz, glob, json, collections, numpy as np
from PIL import Image
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
U=_FONTES
d=fitz.open(glob.glob(U+"/*2024_2_PV*")[0])
DOM="TT2BFD82o00"; Z=6
TARGET=["k","y"]
occs=collections.defaultdict(list)
for p in range(1,len(d)):
    pix=d[p].get_pixmap(matrix=fitz.Matrix(Z,Z))
    img=Image.frombytes("RGB",(pix.width,pix.height),pix.samples).convert("L")
    A=np.asarray(img)
    for bi,blk in enumerate(d[p].get_text("rawdict")["blocks"]):
        if blk["type"]!=0: continue
        for li,ln in enumerate(blk["lines"]):
            ci=0
            for sp in ln["spans"]:
                if sp["font"]!=DOM:
                    ci+=len(sp["chars"]); continue
                for ch in sp["chars"]:
                    c=ch["c"]
                    if c in TARGET:
                        x0,y0,x1,y1=[v*Z for v in ch["bbox"]]
                        x0,y0,x1,y1=int(x0),int(y0),int(np.ceil(x1)),int(np.ceil(y1))
                        sub=A[max(0,y0):y1,max(0,x0):x1]
                        if sub.size:
                            im=Image.fromarray(sub).resize((12,16),Image.LANCZOS)
                            v=np.asarray(im,dtype=np.float32).ravel()
                            v=(v-v.mean())/(v.std()+1e-6)
                            occs[c].append({"page":p,"bbox":ch["bbox"],"vec":v.tolist(),"crop":sub.shape})
                    ci+=1
res={}
for c,lst in occs.items():
    V=np.array([o["vec"] for o in lst])
    cents=[V[0]]; lab=[]
    for v in V:
        ds=[np.linalg.norm(v-ct) for ct in cents]
        i=int(np.argmin(ds))
        if ds[i]<14.0: lab.append(i)
        else: cents.append(v); lab.append(len(cents)-1)
    # refinar: k-means 2 iteraciones
    for _ in range(3):
        cents=[V[[i for i,l in enumerate(lab) if l==k]].mean(axis=0) for k in range(len(cents))]
        lab=[int(np.argmin([np.linalg.norm(v-ct) for ct in cents])) for v in V]
    res[c]={"labels":lab,"n":len(lst),"occ":[{"page":o["page"],"bbox":o["bbox"]} for o in lst]}
    print(c, collections.Counter(lab))
json.dump(res, open("disamb.json","w"))
# montajes por grupo
for c,r in res.items():
    for g in set(r["labels"]):
        idxs=[i for i,l in enumerate(r["labels"]) if l==g][:10]
        crops=[]
        for i in idxs:
            o=r["occ"][i]; p=o["page"]; bb=o["bbox"]
            pix=d[p].get_pixmap(matrix=fitz.Matrix(10,10), clip=fitz.Rect(bb[0]-1,bb[1]-1,bb[2]+1,bb[3]+1))
            im=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
            im=im.resize((int(im.width*1.6),int(im.height*1.6)),Image.LANCZOS)
            crops.append(im)
        if not crops: continue
        H=max(x.height for x in crops); Wt=sum(x.width for x in crops)+20*(len(crops)+1)
        cv=Image.new("RGB",(Wt,H+20),"white"); x=20
        for im in crops: cv.paste(im,(x,10)); x+=im.width+20
        cv.save(f"amb_{c}_g{g}.png")
        print("guardado", f"amb_{c}_g{g}.png")
