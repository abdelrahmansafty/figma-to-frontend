# Compact tree of a bridge get_node JSON dump: figma-tree.py <node.json> [depth]
import json,sys
d=json.load(open(sys.argv[1])); maxd=int(sys.argv[2]) if len(sys.argv)>2 else 99
def st(n):
    s=n.get('styles',{}) or {}; out=[]
    for f in s.get('fills',[]) or []:
        if f.get('type')=='SOLID': out.append(f"bg{f['color']}{'' if f.get('opacity',1)==1 else '@'+str(round(f['opacity'],2))}")
        elif f.get('type'): out.append('bg:'+f['type'])
    for f in s.get('strokes',[]) or []:
        if f.get('type')=='SOLID': out.append(f"bd{f['color']}{'' if f.get('opacity',1)==1 else '@'+str(round(f['opacity'],2))}/{s.get('strokeWeight')}")
    if s.get('cornerRadius'): out.append(f"r{s['cornerRadius']}")
    al=s.get('autoLayout')
    if al: out.append(f"AL:{al.get('direction')[0]} gap{al.get('gap')} {al.get('primaryAxisAlign')}/{al.get('counterAxisAlign')}")
    p=n.get('padding') or s.get('padding')
    if p: out.append(f"pad{p.get('top')},{p.get('right')},{p.get('bottom')},{p.get('left')}")
    ef=s.get('effects')
    if ef: out.append('fx:'+';'.join(f"{e.get('type')}({e.get('offset',{}).get('x')},{e.get('offset',{}).get('y')},{e.get('radius')},{e.get('spread')},{e.get('color')})" for e in ef if e.get('visible',True)))
    t=s.get('text') or {}
    for k in ('fontFamily','fontSize','fontWeight','fontName','lineHeight','textAlignHorizontal'):
        if k in s: out.append(f"{k}={s[k]}")
        if k in t: out.append(f"{k}={t[k]}")
    if s.get('opacity',1)!=1: out.append(f"op{s['opacity']}")
    if s.get('visible') is False: out.append('HIDDEN')
    return ' '.join(out)
def walk(n,depth=0):
    if depth>maxd: return
    b=n.get('bounds',{}) or {}
    txt=(' "'+n.get('characters','')[:40]+'"') if n.get('characters') else ''
    print('  '*depth+f"{n['id']} {n['type'][:5]} '{n.get('name','')[:30]}' {round(b.get('width',0),1)}x{round(b.get('height',0),1)}@{round(b.get('x',0),1)},{round(b.get('y',0),1)} {st(n)}{txt}")
    if n['type'] in ('VECTOR','BOOLEAN_OPERATION'): return
    if n['type']=='INSTANCE' and b.get('width',99)<=32: return
    for c in n.get('children',[]) or []: walk(c,depth+1)
walk(d)
