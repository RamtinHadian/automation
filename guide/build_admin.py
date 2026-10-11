# -*- coding: utf-8 -*-
"""Builds guide.html (the complete Persian user guide of Hoormand); build_pdf.cjs turns it into the PDF."""
import re, html, json, os
PAGES = json.load(open('pages-admin.json')) if os.path.exists('pages-admin.json') else {}

FA = '۰۱۲۳۴۵۶۷۸۹'
def fa(s): return re.sub(r'[0-9]', lambda m: FA[int(m.group())], s)

body = []
toc = []
chap_no = [0]

def add(x): body.append(x)
def h1(title, intro=''):
    chap_no[0] += 1
    cid = f'c{chap_no[0]}'
    toc.append((cid, chap_no[0], title))
    add(f'<section class="chap" id="{cid}"><div class="chap-head"><span class="num">{chap_no[0]}</span><h1>{title}</h1><span class="mk">@@k{"".join(chr(97 + int(d)) for d in str(chap_no[0]))}@@</span></div>')
    if intro: add(f'<p class="intro">{intro}</p>')
def end(): add('</section>')
def h2(t): add(f'<h2>{t}</h2>')
def h3(t): add(f'<h3>{t}</h3>')
def p(t): add(f'<p>{t}</p>')
def ul(items): add('<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>')
def steps(items): add('<ol class="steps">' + ''.join(f'<li><span>{i}</span></li>' for i in items) + '</ol>')
def tip(t): add(f'<div class="box tip"><b>نکته</b><div>{t}</div></div>')
def warn(t): add(f'<div class="box warn"><b>مهم</b><div>{t}</div></div>')
def fig(name, cap, narrow=False):
    add(f'<figure class="{"narrow" if narrow else ""}"><img src="img/{name}.jpg" alt=""><figcaption>{cap}</figcaption></figure>')
def phones(items):
    add('<div class="phones">' + ''.join(f'<figure><img src="img/{n}.jpg" alt=""><figcaption>{c}</figcaption></figure>' for n, c in items) + '</div>')
def table(head, rows):
    add('<table><thead><tr>' + ''.join(f'<th>{h}</th>' for h in head) + '</tr></thead><tbody>' +
        ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>')

exec(open('admin_chapters.py', encoding='utf-8').read())
# ------------------------------------------------------------------ page
toc_html = '<ol class="toc">' + ''.join(f'<li><a href="#{c}"><span class="n">{n}</span><span class="t">{t}</span><span class="pg">{PAGES.get(c, "")}</span></a></li>' for c, n, t in toc) + '</ol>'

doc = f'''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>راهنمای کنسول مدیریت هورمند</title>
<style>
@font-face {{ font-family: V; font-weight: 400; src: url('Vazirmatn-Regular.woff2'); }}
@font-face {{ font-family: V; font-weight: 500; src: url('Vazirmatn-Medium.woff2'); }}
@font-face {{ font-family: V; font-weight: 700; src: url('Vazirmatn-Bold.woff2'); }}
@font-face {{ font-family: V; font-weight: 900; src: url('Vazirmatn-Black.woff2'); }}
@page {{ size: A4; margin: 20mm 17mm 20mm 17mm; @bottom-center {{ content: counter(page, persian); font-family: V; font-size: 10pt; color: #8C6F66; }} }}
@page :first {{ margin: 0; @bottom-center {{ content: none; }} }}
:root {{ --maroon:#6E1B1B; --orange:#D34A32; --ink:#3A241F; --muted:#7d6159; --line:#EBDBCE; --teal:#0D9488; --bg:#FAF5F1; }}
* {{ box-sizing: border-box; }}
body {{ font-family: V, Tahoma, sans-serif; color: var(--ink); font-size: 11.2pt; line-height: 2; margin: 0; }}
.cover {{ height: 297mm; page-break-after: always; background: linear-gradient(160deg,#fff 0%, var(--bg) 55%, #F6D9CD 140%); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20mm; position: relative; overflow: hidden; }}
.cover .orb {{ position: absolute; border-radius: 50%; }}
.cover .o1 {{ width: 420px; height: 420px; background: rgba(211,74,50,.10); top: -140px; left: -120px; }}
.cover .o2 {{ width: 520px; height: 520px; background: rgba(110,27,27,.08); bottom: -200px; right: -160px; }}
.cover img {{ width: 330px; position: relative; }}
.cover h1 {{ font-size: 40pt; font-weight: 900; color: var(--maroon); margin: 30px 0 4px; line-height: 1.4; position: relative; }}
.cover .sub {{ font-size: 17pt; color: var(--muted); position: relative; }}
.cover .bar {{ width: 140px; height: 6px; background: var(--orange); border-radius: 6px; margin: 26px 0; position: relative; }}
.cover .ver {{ position: relative; font-size: 12pt; color: var(--muted); margin-top: 8px; }}
.tocpage {{ page-break-after: always; }}
.tocpage h1 {{ font-size: 26pt; font-weight: 900; color: var(--maroon); margin: 0 0 18px; }}
.toc {{ list-style: none; padding: 0; margin: 0; counter-reset: x; }}
.toc li {{ border-bottom: 1px solid var(--line); }}
.toc .t {{ flex: 1; }}
.toc .pg {{ color: var(--muted); font-size: 12pt; font-weight: 500; min-width: 30px; text-align: left; }}
.toc a {{ display: flex; align-items: center; gap: 16px; padding: 7px 4px; text-decoration: none; color: var(--ink); font-size: 13pt; font-weight: 500; }}
.toc .n {{ display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--maroon); color: #fff; font-weight: 700; font-size: 12pt; }}
.how {{ margin-top: 18px; padding: 12px 20px; border-radius: 16px; background: var(--bg); border: 1px solid var(--line); font-size: 10.5pt; color: var(--muted); }}
.chap {{ page-break-before: always; }}
.mk {{ font-size: 4px; color: #ffffff; }}
.chap-head {{ display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }}
.chap-head .num {{ display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, var(--maroon), var(--orange)); color: #fff; font-weight: 900; font-size: 22pt; flex-shrink: 0; }}
h1 {{ font-size: 25pt; font-weight: 900; color: var(--maroon); margin: 0; line-height: 1.5; }}
.intro {{ font-size: 12.2pt; color: var(--muted); margin: 6px 0 14px; padding-bottom: 12px; border-bottom: 3px solid var(--line); }}
h2 {{ font-size: 16pt; font-weight: 900; margin: 22px 0 6px; padding-right: 14px; border-right: 5px solid var(--orange); line-height: 1.6; page-break-after: avoid; }}
h3 {{ font-size: 13pt; font-weight: 700; margin: 14px 0 4px; page-break-after: avoid; }}
p {{ margin: 6px 0; text-align: justify; }}
ul {{ margin: 6px 0; padding: 0 22px 0 0; }}
li {{ margin: 3px 0; }}
.steps {{ list-style: none; counter-reset: s; padding: 0; margin: 10px 0; }}
.steps li {{ counter-increment: s; display: flex; gap: 12px; align-items: flex-start; margin: 7px 0; break-inside: avoid; }}
.steps li::before {{ content: counter(s, persian); flex: 0 0 28px; height: 28px; border-radius: 50%; background: var(--teal); color: #fff; font-weight: 700; font-size: 11pt; display: grid; place-items: center; margin-top: 4px; }}
figure {{ margin: 12px 0 16px; break-inside: avoid; text-align: center; }}
figure img {{ width: 100%; border-radius: 10px; border: 1px solid var(--line); box-shadow: 0 6px 18px rgba(58,36,31,.12); }}
figure.narrow img {{ width: 62%; }}
figcaption {{ margin-top: 6px; font-size: 9.6pt; color: var(--muted); line-height: 1.7; }}
.phones {{ display: flex; gap: 16px; justify-content: center; margin: 12px 0 16px; break-inside: avoid; direction: ltr; }}
.phones figure {{ margin: 0; width: 31%; }}
.phones img {{ border-radius: 18px; border: 3px solid #1d1411; box-shadow: 0 6px 18px rgba(58,36,31,.2); }}
table {{ width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10.4pt; break-inside: auto; }}
th {{ background: var(--maroon); color: #fff; font-weight: 700; padding: 7px 12px; text-align: right; }}
td {{ padding: 7px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }}
tr {{ break-inside: avoid; }}
tbody tr:nth-child(even) td {{ background: #FCF8F5; }}
td:first-child {{ font-weight: 700; white-space: nowrap; }}
.box {{ display: flex; gap: 12px; padding: 11px 16px; margin: 12px 0; border-radius: 12px; break-inside: avoid; font-size: 10.6pt; line-height: 1.9; }}
.box b {{ flex: 0 0 auto; font-weight: 900; padding-top: 1px; }}
.tip {{ background: #E6F6F4; border: 1px solid #A7DDD6; }} .tip b {{ color: #0B6F66; }}
.warn {{ background: #FFF5E0; border: 1px solid #F1D08A; }} .warn b {{ color: #A15C00; }}
b {{ font-weight: 700; }}
</style></head><body>
<div class="cover"><i class="orb o1"></i><i class="orb o2"></i>
<img src="img/logo.png" alt="">
<h1>راهنمای کنسول مدیریت</h1><div class="sub">سامانهٔ هوشمند اتوماسیون اداری و بازرگانی هورمند</div>
<div class="bar"></div><div class="ver">ویژهٔ مدیر سیستم</div></div>
<div class="tocpage"><h1>فهرست مطالب</h1>{toc_html}
<div class="how"><b>چطور از این راهنما استفاده کنیم؟</b><br>هر فصل یک بخش کنسول را توضیح می‌دهد، با قدم‌های شمارهٔ‌دار و عکس. کادر سبز «نکته» و کادر زرد «مهم» است. عکس‌ها از نسخهٔ نمایشی با اطلاعات نمونه گرفته شده‌اند.</div></div>
{''.join(body)}
</body></html>'''

# digits in text nodes become Persian
head, rest = doc.split('</head>', 1)
rest = re.sub(r'>([^<]+)<', lambda m: '>' + fa(m.group(1)) + '<', rest)
doc = head + '</head>' + rest
open('admin.html', 'w', encoding='utf-8').write(doc)
print('chapters', len(toc), 'html bytes', len(doc))
