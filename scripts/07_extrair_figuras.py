import fitz, glob, re, json, collections, io, base64
from PIL import Image
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
U=_FONTES
PVS={"2023/1":"*2023_1_PV*","2023/2":"*2023_2_PV*","2024/1":"*2024_1_PV*","2024/2":"*2024_2_PV*"}
qimg=json.load(open("qimages.json")); qtext=json.load(open("qfig_text.json"))
FINAL={}
for ed in PVS:
    imgs=set(int(k) for k in qimg[ed].keys())
    txt=set(qtext[ed])
    FINAL[ed]= sorted(imgs & txt) if ed=="2024/2" else sorted(imgs)
print("questões con figura:",{k:v for k,v in FINAL.items()})
out={}
for ed,pat in PVS.items():
    d=fitz.open(glob.glob(U+"/"+pat)[0]); W=d[0].rect.width
    for n in FINAL[ed]:
        blocks=qimg[ed][str(n)]
        # unir bloques de la misma página
        bypage=collections.defaultdict(list)
        for p,bb,w,h in blocks: bypage[p].append(bb)
        p=max(bypage,key=lambda k:sum((b[2]-b[0])*(b[3]-b[1]) for b in bypage[k]))
        bbs=bypage[p]
        x0=min(b[0] for b in bbs)-4; x1=max(b[2] for b in bbs)+4
        y0=min(b[1] for b in bbs)-4; y1=max(b[3] for b in bbs)+4
        # limitar a la columna
        pix=d[p].get_pixmap(matrix=fitz.Matrix(3.2,3.2), clip=fitz.Rect(x0,y0,x1,y1))
        im=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
        if im.width>820:
            r=820/im.width; im=im.resize((820,int(im.height*r)),Image.LANCZOS)
        buf=io.BytesIO(); im.convert("RGB").save(buf,"JPEG",quality=72,optimize=True)
        b=base64.b64encode(buf.getvalue()).decode()
        out[f"{ed}|{n}"]={"b64":b,"w":im.width,"h":im.height,"kb":round(len(b)/1024,1)}
json.dump(out,open("figs.json","w"))
tot=sum(v["kb"] for v in out.values())
print(f"figuras extraídas: {len(out)} · total {tot:.0f} KB")
for k,v in list(out.items())[:8]: print("   ",k,v["w"],"x",v["h"],v["kb"],"KB")
