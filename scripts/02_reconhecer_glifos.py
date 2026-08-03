import fitz, glob, json, collections, subprocess, sys
from PIL import Image
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
U=_FONTES
d=fitz.open(glob.glob(U+"/*2024_2_PV*")[0])
ZOOM=10
FONT=sys.argv[1] if len(sys.argv)>1 else "TT2BFD82o00"
inv=collections.defaultdict(list)
for pno in range(1,len(d)):
    for blk in d[pno].get_text("rawdict")["blocks"]:
        if blk["type"]!=0: continue
        for ln in blk["lines"]:
            for sp in ln["spans"]:
                if sp["font"]!=FONT: continue
                for ch in sp["chars"]:
                    if ch["c"].isspace(): continue
                    inv[ch["c"]].append((pno,ch["bbox"],sp["size"]))
cache={}
def page_img(p):
    if p not in cache:
        if len(cache)>2: cache.clear()
        pix=d[p].get_pixmap(matrix=fitz.Matrix(ZOOM,ZOOM))
        cache[p]=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
    return cache[p]
def strip(ch,k=5):
    occ=sorted(inv[ch],key=lambda t:(-t[2],t[0]))[:400]
    # elegir instancias de páginas distintas y con tamaño grande
    occ=sorted(occ,key=lambda t:t[0]); picks=occ[:k] if len(occ)<=k else [occ[i*len(occ)//k] for i in range(k)]
    crops=[]
    for pno,bb,size in picks:
        img=page_img(pno)
        x0,y0,x1,y1=[v*ZOOM for v in bb]
        if x1-x0<3 or y1-y0<3: continue
        pad=3
        c=img.crop((int(x0-pad),int(y0-pad),int(x1+pad),int(y1+pad)))
        r=110/c.height
        c=c.resize((max(4,int(c.width*r)),110),Image.LANCZOS)
        crops.append(c)
    if not crops: return None
    G=80; W=sum(c.width for c in crops)+G*(len(crops)+1)
    cv=Image.new("RGB",(W,110+80),"white"); x=G
    for c in crops: cv.paste(c,(x,40)); x+=c.width+G
    return cv
def ocr(img,wl=None,psm="7"):
    img.save("/tmp/gg.png")
    cmd=["tesseract","/tmp/gg.png","stdout","--psm",psm,"-l","por"]
    if wl: cmd+=["-c","tessedit_char_whitelist="+wl]
    return subprocess.run(cmd,capture_output=True,text=True).stdout.strip()
out={}
codes=sorted(inv.keys(), key=lambda c:-len(inv[c]))
for ch in codes:
    im=strip(ch)
    if im is None: out[ch]=None; continue
    raw=ocr(im)
    cnt=collections.Counter(c for c in raw if not c.isspace())
    rawd=ocr(im,wl="0123456789")
    cntd=collections.Counter(c for c in rawd if not c.isspace())
    out[ch]={"n":len(inv[ch]),"raw":raw,"vote":cnt.most_common(3),"dvote":cntd.most_common(2)}
json.dump(out,open(f"glyph_{FONT}.json","w"),ensure_ascii=False)
print("listo",FONT,len(out))
