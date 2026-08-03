import json, re
qs=json.load(open("qs_raw.json"))
OPT=re.compile(r'^([A-D])\s+(.*)$')
def clean_lines(block):
    out=[]
    for ln in block.split("\n"):
        s=ln.strip()
        if not s: continue
        if re.fullmatch(r'\d{1,3}', s): continue
        if re.match(r'^(PROVA OBJETIVA|EDI[ÇC][ÃA]O|Revalida|INEP|Exame Nacional)',s,re.I): continue
        if re.search(r'(PRIMEIRA|SEGUNDA|TERCEIRA)\s+EDI',s,re.I): continue
        if re.fullmatch(r'[\W_]{1,8}',s): continue
        out.append(s)
    return out
res={}; errs=[]
for n in range(1,101):
    block=qs[str(n)]
    cut=re.search(r'question[aá]rio\s+de\s+percep|PERGUNTA\s+1',block,re.I)
    if cut: block=block[:cut.start()]
    lines=clean_lines(block)
    idx={}
    for j,ln in enumerate(lines):
        m=OPT.match(ln)
        if m: idx.setdefault(m.group(1),[]).append(j)
    if not all(k in idx for k in "ABCD"): errs.append((n,"faltan marcas",lines[-6:])); continue
    dD=idx['D'][-1]
    cC=[x for x in idx['C'] if x<dD]; dC=cC[-1] if cC else None
    cB=[x for x in idx['B'] if dC is not None and x<dC]; dB=cB[-1] if cB else None
    cA=[x for x in idx['A'] if dB is not None and x<dB]; dA=cA[-1] if cA else None
    if None in (dA,dB,dC): errs.append((n,"orden",None)); continue
    def opt(a,b):
        seg=lines[a:b]; seg=[re.sub(r'^[A-D]\s+','',seg[0])]+seg[1:]
        return " ".join(seg).strip()
    enun=" ".join(lines[:dA]).strip()
    res[n]={"enunciado":enun,"A":opt(dA,dB),"B":opt(dB,dC),"C":opt(dC,dD),"D":opt(dD,len(lines))}
print("parseadas:",len(res),"| errores:",len(errs))
for e in errs[:8]: print("  ",e[0],e[1])
json.dump(res,open("parsed_2024_2.json","w"),ensure_ascii=False)
# muestras
for n in (1,2,50,99):
    if n in res:
        r=res[n]; print(f"\n--- Q{n} ---\nEN: {r['enunciado'][:150]}")
        for k in "ABCD": print(f" {k}: {r[k][:90]}")
