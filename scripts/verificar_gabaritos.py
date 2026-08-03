import fitz, re
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FONTES as _FONTES
U=_FONTES
STRIKE="̶"
# ---- Image-read authoritative keys (X = anulada) ----
IMG={
"2023/1":"D D B A A C X A C B D D X C C D D B A D  D A C B A A A C B C D B A A X A B X C D  C X A A B B D X X D B D D C C C D A A B  D C D C B A A B B A A C A C C B A D C C  D C D B D C B C B A C D A A C B B C C D",
"2023/2":"B D X B B A A B D B C C B D A C B B C C  D A A D B D A X A C A D B A D C X B C A  D D D D B X D X D C D A C C B C C X B C  A C D B C C X C D A D A X C C A C D D B  A B B D A D C A C A B B X C D B B A A C",
"2024/1":"A A C D A D X C B D D A A D C A X D D D  B D A B C D A B C B C D B C B D C B A A  D A X B D C D D C X A B B B A C A A D A  D C B D A A C D C D C A A B B C B D B B  C B X A A B C B B C A D A D C A C B C A",
"2024/2":"C B X D D A D A B B A B D C D C C A A B  D X B D C C A C B X C B A A C B X A C A  B C D A C X C D D D B B C D C B B C A X  A A B D B D A D A A D C C D D B C A C D  D D B B A C C A A B B C B B C A C A D D",
}
IMG={k:v.split() for k,v in IMG.items()}
for k,v in IMG.items():
    assert len(v)==100, f"{k} tiene {len(v)}"
# ---- text-token parse ----
def parse_gab_tokens(path):
    d=fitz.open(path); t="\n".join(p.get_text("text") for p in d); d.close()
    t=re.sub(r'([A-E])\s*'+STRIKE,' ANULADA ',t); t=t.replace(STRIKE,'')
    seq=[]
    for tok in t.split():
        if tok=="ANULADA": seq.append("X")
        elif len(tok)==1 and tok in "ABCDE": seq.append(tok)
        elif tok in ("-","—","–","‐","−"): seq.append("X")
        if len(seq)>=100: break
    return seq
GB={"2023/1":"2023_1_GB_objetiva_definitivo.pdf","2023/2":"2023_2_GB_objetiva.pdf",
    "2024/1":"2024_1_GB_objetiva.pdf","2024/2":"2024_2_GB_objetiva.pdf"}
print("Comparación imagen-oficial  vs  texto-token:")
for ed in IMG:
    txt=parse_gab_tokens(f"{U}/{GB[ed]}")
    img=IMG[ed]
    if len(txt)!=100:
        print(f"[{ed}] TEXTO parseó {len(txt)} (no fiable) -> uso IMAGEN. anuladas_img={[i+1 for i,x in enumerate(img) if x=='X']}")
        continue
    diffs=[(i+1,img[i],txt[i]) for i in range(100) if img[i]!=txt[i]]
    print(f"[{ed}] discrepancias imagen/texto: {len(diffs)} {diffs if diffs else ''}")
