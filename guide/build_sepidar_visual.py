# -*- coding: utf-8 -*-
"""Builds sepidar.html (a short step by step guide: connecting Hoormand to Sepidar accounting); build_pdf_sepidar.cjs turns it into the PDF."""
import re

STYLE = re.search(r'<style>(.*?)</style>', open('admin.html', encoding='utf-8').read(), re.S).group(1)
body, toc, n = [], [], [0]


def add(x): body.append(x)


def h1(title, intro=''):
    n[0] += 1
    cid = f'c{n[0]}'
    toc.append((cid, n[0], title))
    add(f'<section class="chap" id="{cid}"><div class="chap-head"><span class="num">{n[0]}</span><h1>{title}</h1></div>')
    if intro:
        add(f'<p class="intro">{intro}</p>')


def end(): add('</section>')
def h2(t): add(f'<h2>{t}</h2>')
def p(t): add(f'<p>{t}</p>')
def ul(items): add('<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>')
def steps(items): add('<ol class="steps">' + ''.join(f'<li><span>{i}</span></li>' for i in items) + '</ol>')
def tip(t): add(f'<div class="box tip"><b>نکته</b><div>{t}</div></div>')
def warn(t): add(f'<div class="box warn"><b>مهم</b><div>{t}</div></div>')
def code(t): add(f'<pre class="code" dir="ltr">{t}</pre>')


def table(head, rows):
    add('<table><thead><tr>' + ''.join(f'<th>{h}</th>' for h in head) + '</tr></thead><tbody>' +
        ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>')


def fig(inner, caption=''):
    add(f'<figure class="fig">{inner}' + (f'<figcaption>{caption}</figcaption>' if caption else '') + '</figure>')


def c(n):  # numbered red marker that points at a part of a drawing
    return f'<i class="mk">{"۰۱۲۳۴۵۶۷۸۹"[n]}</i>'


def win(title, inner, w=''):
    return f'<div class="win" style="{w}"><div class="wbar"><span></span><span></span><span></span><b>{title}</b></div><div class="wbody">{inner}</div></div>'


# ------------------------------------------------------------------ 1
h1('تصویر کلی: چه می‌شود؟', 'اول بدانید چه چیزی به چه چیزی وصل می‌شود؛ بعد هر مرحله را قدم‌به‌قدم می‌رویم.')
fig('''<div class="net">
  <div class="box b1"><b>هورمند</b><span>روی سرور اداره</span><em>مشتری، پیش‌فاکتور، انبار</em></div>
  <div class="link"><span>اینترنت یا شبکه</span><div class="ar">⇄</div></div>
  <div class="box b2"><b>برنامهٔ واسط</b><span>روی کامپیوتر سپیدار</span><em>پیام‌رسان کوچک</em></div>
  <div class="link"><span>همان کامپیوتر</span><div class="ar">⇄</div></div>
  <div class="box b3"><b>سپیدار</b><span>حسابداری</span><em>فاکتور، دریافتی، انبار</em></div>
</div>''', 'شکل ۱: سه بخش. برنامهٔ واسط در وسط است و با هر دو طرف حرف می‌زند.')
p('چرا برنامهٔ واسط لازم است؟ چون سپیدار از بیرون کامپیوتر خودش دیده نمی‌شود. پس هورمند نمی‌تواند مستقیم به سپیدار برسد. برنامهٔ واسط روی همان کامپیوتر می‌نشیند، هر چند ثانیه از هورمند می‌پرسد «کاری داری؟» و آن را در سپیدار انجام می‌دهد.')
h2('کل کار شما در یک نگاه')
table(['مرحله', 'کجا؟', 'چه کار؟', 'چقدر طول می‌کشد؟'], [
    ['۱', 'داخل سپیدار', 'روشن‌کردن سرویس و تعریف یک «دستگاه»، یادداشت سریال', 'حدود ۵ دقیقه'],
    ['۲', 'داخل هورمند', 'گرفتن «کد اتصال»', 'حدود ۱ دقیقه'],
    ['۳', 'کامپیوتر سپیدار', 'بازکردن یک فایل و جواب‌دادن به چند سؤال', 'حدود ۵ دقیقه'],
    ['۴', 'هورمند', 'سنجیدن اتصال و دادن دسترسی به همکاران', 'حدود ۵ دقیقه'],
])
tip('همهٔ این‌ها فقط یک‌بار انجام می‌شود. بعدش اتصال خودش کار می‌کند.')
end()

# ------------------------------------------------------------------ 2
h1('قبل از شروع: چه چیزهایی باید آماده باشد؟')
table(['چیز لازم', 'چطور بفهمم دارم؟'], [
    ['مجوز «وب‌سرویس» سپیدار', 'از شرکت فروشندهٔ سپیدار بپرسید: «ارتباط با فروشگاه اینترنتی» یا «سفارش‌گیری» یا «سپیدار و CRM». بدون آن، سپیدار وب‌سرویس ندارد.'],
    ['کامپیوتری که سپیدار روی آن نصب است', 'برنامهٔ سپیدار روی همین کامپیوتر باز می‌شود و ساعت‌های کاری روشن است.'],
    ['اینترنت یا شبکهٔ داخلی', 'همین کامپیوتر باید بتواند نشانی هورمند شما را در مرورگر باز کند.'],
    ['حساب مدیر در هورمند', 'برای گرفتن کد اتصال.'],
    ['نام کاربری و رمز یک کاربر سپیدار', 'همان کاربری که می‌خواهید کارها با نام او در سپیدار ثبت شود.'],
])
warn('یک برنامهٔ کمکی رایگان هم لازم است. اگر نصب نباشد، در مرحلهٔ ۳ برنامه خودش پیشنهاد نصب می‌دهد (به اینترنت نیاز دارد).')
end()

# ------------------------------------------------------------------ 3
h1('مرحلهٔ ۱: داخل سپیدار (روی کامپیوتر سپیدار)', 'این تنها بخشی است که فقط داخل خود سپیدار ممکن است. ظاهر نمونه‌ها طرح‌واره است؛ سپیدار شما ممکن است کمی فرق داشته باشد.')
h2('۱-۱: سرویس سپیدار را روشن کنید')
fig(win('ورود به سپیدار', f'''<div class="row"><label>نام کاربری</label><div class="inp">admin</div></div>
<div class="row"><label>رمز عبور</label><div class="inp">••••••</div></div>
<div class="row chk">{c(1)}<span class="cb on">✓</span> اجرای برنامه در حالت سرویس‌دهنده</div>
<div class="row"><div class="bt grn">{c(2)}شروع</div><div class="bt">ورود</div></div>''', 'max-width:430px;margin:auto'),
    'شکل ۲: صفحهٔ ورود سپیدار.')
steps(['سپیدار را با کاربر «admin» باز کنید.',
       f'تیک «اجرای برنامه در حالت سرویس‌دهنده» را بزنید (شمارهٔ ۱ در شکل).',
       f'دکمهٔ سبز «شروع» را بزنید (شمارهٔ ۲). سرویس روی پورت ۷۳۷۳ روشن می‌شود.'])
warn('این پنجره باید همیشه باز بماند. اگر بسته شود، اتصال قطع می‌شود.')
h2('۱-۲: یک «دستگاه» تعریف کنید و سریال را بردارید')
fig(win('دستگاه جدید', f'''<div class="row"><label>عنوان</label><div class="inp">هورمند</div></div>
<div class="row"><label>نوع دستگاه</label><div class="inp sel">مطابق مجوز شما ▾</div></div>
<div class="row"><label>کاربر</label><div class="inp">{c(1)}کاربر اتصال</div></div>
<div class="row"><label>سریال</label><div class="inp ser" dir="ltr">{c(2)}A1B2C3D4</div></div>
<div class="row"><div class="bt">ذخیره</div></div>''', 'max-width:430px;margin:auto'), 'شکل ۳: فرم دستگاه جدید (در بخش «سفارش‌گیری و پخش»).')
steps(['در سپیدار بخش «سفارش‌گیری و پخش» ← «دستگاه جدید» را باز کنید.',
       'برای «عنوان» بنویسید «هورمند». «نوع دستگاه» را مطابق مجوزتان انتخاب کنید.',
       f'یک سطر در جدول کاربران اضافه کنید و کاربری را انتخاب کنید که کارها با نام او ثبت شود (شمارهٔ ۱). این کاربر باید در سپیدار اجازهٔ ثبت مشتری و پیش‌فاکتور داشته باشد.',
       'ذخیره کنید. بعد از ذخیره، یک <b>کد هشت‌حرفی</b> در «سریال» می‌آید (شمارهٔ ۲).',
       '<b>این کد را روی کاغذ یا در یک پیام برای خودتان بنویسید.</b> در مرحلهٔ ۳ لازم می‌شود.'])
warn('دکمهٔ «دریافت سریال» را دوباره نزنید؛ هر بار سریال تازه می‌سازد و اتصال قبلی از کار می‌افتد.')
end()

# ------------------------------------------------------------------ 4
h1('مرحلهٔ ۲: داخل هورمند (ساخت کد اتصال)', 'این کار را مدیر سیستم انجام می‌دهد. از هر کامپیوتر می‌شود.')
fig(win('هورمند', f'''<div class="menus"><span>امور اداری</span><span>نامه</span><span class="act">{c(1)}سپیدار</span><span>انبار</span><span>مشتریان</span></div>
<div class="bar2">برنامهٔ سپیدار هنوز به هورمند وصل نشده است. <u>{c(2)}ساخت کد اتصال</u></div>
<div class="modal"><b>کد اتصال برنامهٔ سپیدار</b><div class="code" dir="ltr">{c(3)}K7M4-2PQ9</div><span>فقط ۱۵ دقیقه و فقط یک‌بار معتبر است</span></div>''', 'max-width:560px;margin:auto'), 'شکل ۴: ساخت کد اتصال در هورمند.')
steps(['وارد هورمند شوید (با حساب مدیر).',
       f'در منوی بالا روی «سپیدار» بزنید (شمارهٔ ۱).',
       f'روی «ساخت کد اتصال» بزنید (شمارهٔ ۲).',
       f'یک کد کوتاه می‌آید، مثل K7M4-2PQ9 (شمارهٔ ۳). آن را بنویسید یا کپی کنید.'])
tip('کد را همین لحظه لازم دارید. اگر ۱۵ دقیقه گذشت یا اشتباه شد، دوباره «ساخت کد اتصال» را بزنید. کد قبلی خودکار باطل می‌شود.')
end()

# ------------------------------------------------------------------ 5
h1('مرحلهٔ ۳: روی کامپیوتر سپیدار (راه‌اندازی خودکار)', 'یک فایل را باز می‌کنید و به چند سؤال جواب می‌دهید. بقیهٔ کارها را برنامه خودش می‌کند.')
h2('۳-۱: پوشه را بگذارید و فایل را باز کنید')
fig('''<div class="folder"><div class="fi">📁 sepidar</div>
<div class="fl dim">فایل‌های برنامه (دست نزنید)</div>
<div class="fl hot"><i class="mk">۱</i>فایل «۰-راه‌اندازی-خودکار» <span>← دوبار کلیک</span></div>
<div class="fl dim">فایل‌های شمارهٔ ۱ تا ۵: روش دستی، لازم نیست</div></div>''', 'شکل ۵: در پوشهٔ «sepidar» فقط روی فایل شمارهٔ صفر کلیک کنید.')
steps(['پوشهٔ <b>sepidar</b> (که همراه این راهنما به شما داده شده) را روی کامپیوتر سپیدار بگذارید؛ مثلاً در Documents.',
       'روی فایل <b>۰-راه‌اندازی-خودکار</b> دوبار کلیک کنید. یک پنجرهٔ سیاه باز می‌شود.',
       'اگر نوشت برنامهٔ کمکی نصب نیست و پیشنهاد نصب داد، آن را بپذیرید (کلید Y یعنی «بله»). بعد پنجره را ببندید و دوباره فایل را باز کنید.'])
h2('۳-۲: به سؤال‌ها جواب بدهید')
fig('''<div class="term"><div>راه‌اندازی خودکار اتصال هورمند و سپیدار</div><br>
<div>نشانی هورمند: <b class="ans">←</b></div>
<div>کد اتصال (در هورمند: منوی «سپیدار» ← «ساخت کد اتصال»): <b class="ans">←</b></div>
<div class="g">  کلید اتصال از هورمند گرفته شد.</div><br>
<div>نشانی سرویس سپیدار [پیش‌فرض]: <b class="ans">← Enter</b></div>
<div>سریال دستگاه: <b class="ans">←</b></div>
<div>نام کاربری سپیدار: <b class="ans">←</b></div>
<div>رمز سپیدار: <b class="ans">← (دیده نمی‌شود)</b></div>
<div class="g">  ورود به سپیدار موفق بود.</div>
<div>قیمت‌ها در هورمند «تومان» است و در سپیدار «ریال»؟ <b class="ans">←</b></div>
<div>برنامه هر بار که کامپیوتر روشن شد خودکار اجرا شود؟ <b class="ans">← بله</b></div>
<div class="g">تمام شد.</div></div>''', 'شکل ۶: پنجرهٔ سیاه. جای فلش‌ها را شما می‌نویسید.')
table(['سؤال', 'چه بنویسم'], [
    ['نشانی هورمند', 'همان نشانی که در مرورگر برای هورمند می‌زنید، مثلاً <span dir="ltr">https://office.example.com</span>'],
    ['کد اتصال', 'کدی که در مرحلهٔ ۲ گرفتید، مثلاً <span dir="ltr">K7M4-2PQ9</span>'],
    ['نشانی سرویس سپیدار', 'فقط Enter بزنید (پیش‌فرض درست است)'],
    ['سریال دستگاه', 'کد هشت‌حرفی مرحلهٔ ۱-۲'],
    ['نام کاربری و رمز سپیدار', 'همان کاربری که در دستگاه انتخاب کردید. رمز هنگام نوشتن دیده نمی‌شود؛ طبیعی است.'],
    ['قیمت‌ها تومان است؟', 'اگر در هورمند قیمت را به تومان می‌نویسید و سپیدار ریال کار می‌کند «بله»؛ اگر هر دو یک واحد دارند «خیر».'],
    ['اجرای خودکار', '«بله» (توصیه می‌شود) تا با روشن‌شدن کامپیوتر خودش شروع شود.'],
])
tip('هر چیزی که برنامه خودش از سپیدار بتواند پیدا کند (ارز اصلی، نوع فروش) را نمی‌پرسد.')
warn('رمز سپیدار فقط در همین کامپیوتر (فایل config.json) می‌ماند و به هورمند فرستاده نمی‌شود. آن فایل را برای کسی نفرستید.')
end()

# ------------------------------------------------------------------ 6
h1('مرحلهٔ ۴: بررسی اتصال و دادن دسترسی', 'ببینید همه‌چیز کار می‌کند و تعیین کنید هر همکار چه کاری بکند.')
h2('۴-۱: اتصال را بسنجید')
fig(win('هورمند: منوی سپیدار', f'''<div class="bar2 ok">{c(1)}برنامهٔ سپیدار وصل است (آخرین تماس: همین الان).</div>
<div class="tabs"><span class="act">پیش‌فاکتور و فاکتور</span><span>مشتریان</span><span>فاکتورهای سپیدار</span><span>قیمت‌ها</span><span>درخواست‌ها</span></div>''', 'max-width:560px;margin:auto'), 'شکل ۷: اگر نوار بالا سبز است، اتصال برقرار است.')
steps(['در هورمند منوی «سپیدار» را باز کنید.',
       f'نوار بالا باید سبز باشد و بنویسد «برنامهٔ سپیدار وصل است» (شمارهٔ ۱). اگر قرمز بود، به بخش «اگر مشکلی بود» بروید.',
       'روی «بروزرسانی اطلاعات سپیدار» بزنید. چند لحظه بعد در «فاکتورهای سپیدار» و «قیمت‌ها» اطلاعات می‌آید.'])
h2('۴-۲: به همکاران دسترسی بدهید')
fig(win('ویرایش همکار (کنسول مدیریت)', f'''<div class="row"><label>همکار</label><div class="inp">علی رضایی</div></div>
<div class="perm"><b>اتصال به حسابداری سپیدار: این همکار چه کارهایی می‌تواند بکند؟</b>
<div class="cbs"><span><i class="cb on">✓</i>دیدن اطلاعات سپیدار</span><span><i class="cb">&nbsp;</i>ثبت و بروزرسانی مشتری</span><span><i class="cb on">✓</i>پیش‌فاکتور</span><span><i class="cb">&nbsp;</i>صدور فاکتور</span><span><i class="cb">&nbsp;</i>ثبت دریافتی</span></div></div>''', 'max-width:560px;margin:auto'), 'شکل ۸: مثال: یک فروشنده فقط «دیدن» و «پیش‌فاکتور» دارد.')
steps(['«پنل مدیریت» ← «کاربران» را باز کنید و همکار را «ویرایش» کنید.',
       'در بخش «اتصال به حسابداری سپیدار» تیک کارهای مجاز را بزنید و ذخیره کنید.',
       'همکارانی که هیچ تیکی ندارند، منوی «سپیدار» را نمی‌بینند.'])
end()

# ------------------------------------------------------------------ 7
h1('استفادهٔ روزمره', 'بعد از راه‌اندازی، کار همکاران این است.')
fig('''<div class="chain">
<div class="st s1"><b>۱ پیش‌فاکتور</b><span>در هورمند نوشته می‌شود</span></div><div class="ca">←</div>
<div class="st s2"><b>۲ ارسال به سپیدار</b><span>دسترسی: پیش‌فاکتور</span></div><div class="ca">←</div>
<div class="st s3"><b>۳ صدور فاکتور</b><span>دسترسی: صدور فاکتور</span></div><div class="ca">←</div>
<div class="st s4"><b>۴ ثبت دریافتی</b><span>دسترسی: ثبت دریافتی</span></div></div>''', 'شکل ۹: هر دکمه فقط برای کسی که دسترسی‌اش را دارد دیده می‌شود.')
steps(['در هورمند پیش‌فاکتور شماره‌دار با ردیف کالا بنویسید. «کد کالا» هر ردیف باید دقیقاً همان «کد کالا» در سپیدار باشد.',
       'منوی «سپیدار» ← «پیش‌فاکتور و فاکتور» ← «ارسال به سپیدار».',
       'بعد از تأیید مشتری: «صدور فاکتور».',
       'وقتی پول رسید: «ثبت دریافتی»؛ حساب بانکی، مبلغ و تاریخ را بنویسید.',
       'نتیجهٔ هر کار در بخش «درخواست‌ها» می‌ماند؛ اگر خطا باشد، دلیلش اعلان می‌شود.'])
tip('درخواست‌ها چند ثانیه طول می‌کشد: هورمند به برنامهٔ واسط می‌گوید و برنامهٔ واسط در سپیدار انجام می‌دهد. اگر کامپیوتر سپیدار خاموش باشد، درخواست‌ها در صف می‌مانند.')
end()

# ------------------------------------------------------------------ 8
h1('اگر مشکلی بود')
table(['چه دیدید؟', 'علت و کار درست'], [
    ['نوار هورمند قرمز است («جواب نمی‌دهد»)', 'کامپیوتر سپیدار خاموش است، یا برنامهٔ واسط بسته شده. کامپیوتر را روشن کنید؛ یا فایل «۵-اجرای-خودکار» را باز کنید.'],
    ['در مرحلهٔ ۳: «کد اتصال درست نیست»', 'کد اشتباه یا منقضی است. در هورمند کد تازه بسازید و دوباره فایل ۰ را بزنید.'],
    ['«ثبت دستگاه در سپیدار نشد»', 'سریال را اشتباه نوشته‌اید، یا دکمهٔ سبز «شروع» (مرحلهٔ ۱-۱) روشن نیست، یا سریال تازه گرفته‌اید. مرحلهٔ ۱ را دوباره ببینید.'],
    ['«رمز عبور اشتباه است»', 'نام کاربری یا رمز سپیدار را اشتباه نوشته‌اید. فایل ۰ را دوباره بزنید و دقیق‌تر بنویسید.'],
    ['«کالایی با کد … پیدا نشد»', 'کد کالا در پیش‌فاکتور با کد کالا در سپیدار یکی نیست. کد را درست کنید و دوباره بفرستید.'],
    ['«کاربر دسترسی ندارد»', 'در سپیدار برای آن کاربر دسترسی ثبت مشتری یا پیش‌فاکتور را باز کنید.'],
    ['مبلغ‌ها ده برابر یا ده‌برابرکمتر است', 'واحد پول درست تنظیم نشده. فایل ۰ را دوباره بزنید و به سؤال «تومان و ریال» جور دیگر جواب بدهید.'],
    ['دکمهٔ «ساخت کد اتصال» نیست', 'فقط مدیران آن را می‌بینند. نسخهٔ آزمایشی (دمو) هم آن را نمی‌دهد.'],
])
warn('اگر باز مشکل داشتید، متن دقیق خطا (یا عکس پنجرهٔ سیاه) را برای پشتیبانی بفرستید. رمز را در عکس نمی‌گذارید؛ هنگام نوشتن دیده نمی‌شود.')
end()


toc_html = '<ol class="toc">' + ''.join(f'<li><a href="#{c}"><span class="n">{"۰۱۲۳۴۵۶۷۸۹"[0] if False else "".join("۰۱۲۳۴۵۶۷۸۹"[int(d)] for d in str(k))}</span><span class="t">{t}</span></a></li>' for c, k, t in toc) + '</ol>'

EXTRA = '''
.flow { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 18px 0 8px; }
.fb { border-radius: 14px; padding: 12px 16px; text-align: center; min-width: 150px; border: 2px solid var(--line); background: #fff; }
.fb b { display: block; font-size: 13pt; font-weight: 900; }
.fb span { font-size: 9.5pt; color: var(--muted); }
.f1 { border-color: var(--maroon); } .f1 b { color: var(--maroon); }
.f2 { border-color: var(--orange); } .f2 b { color: var(--orange); }
.f3 { border-color: var(--teal); } .f3 b { color: var(--teal); }
.fa { font-size: 22pt; color: var(--muted); }
pre.code { background: #3A241F; color: #F6D9CD; border-radius: 10px; padding: 10px 14px; font-size: 10pt; line-height: 1.7; direction: ltr; text-align: left; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10.2pt; }
th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: right; vertical-align: top; }
th { background: var(--bg); color: var(--ink); font-weight: 700; }

.fig { margin: 14px 0 18px; page-break-inside: avoid; text-align: center; }
.fig figcaption { font-size: 9.5pt; color: var(--muted); margin-top: 8px; }
.win { border: 2px solid var(--line); border-radius: 12px; background: #fff; text-align: right; overflow: hidden; box-shadow: 0 6px 18px rgba(58,36,31,.12); }
.wbar { display: flex; align-items: center; gap: 6px; background: #EFE3DA; padding: 7px 12px; }
.wbar span { width: 10px; height: 10px; border-radius: 50%; background: #D8B7A5; display: inline-block; }
.wbar b { margin-right: auto; font-size: 10pt; color: var(--ink); }
.wbody { padding: 14px 16px; display: grid; gap: 10px; }
.row { display: flex; align-items: center; gap: 10px; }
.row label { width: 90px; font-size: 10pt; font-weight: 700; color: var(--ink); }
.inp { flex: 1; border: 1.5px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--bg); font-size: 10pt; direction: rtl; }
.inp.ser { font-weight: 900; letter-spacing: 3px; text-align: left; background: #FFF6D8; border-color: #E8B923; }
.row.chk { font-size: 10pt; font-weight: 700; gap: 8px; }
.cb { display: inline-flex; width: 18px; height: 18px; border: 2px solid #B9A9A2; border-radius: 4px; align-items: center; justify-content: center; font-size: 11pt; font-style: normal; background: #fff; color: #fff; }
.cb.on { background: var(--teal); border-color: var(--teal); }
.bt { padding: 6px 18px; border-radius: 8px; border: 1.5px solid var(--line); background: #fff; font-size: 10pt; font-weight: 800; position: relative; }
.bt.grn { background: #16A34A; border-color: #16A34A; color: #fff; }
.mk { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #E11D48; color: #fff; font-style: normal; font-size: 10pt; font-weight: 900; align-items: center; justify-content: center; margin: 0 4px; vertical-align: middle; box-shadow: 0 0 0 3px rgba(225,29,72,.25); }
.menus, .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.menus span, .tabs span { padding: 6px 12px; border-radius: 10px; border: 1.5px solid var(--line); font-size: 10pt; font-weight: 800; background: #fff; }
.menus .act, .tabs .act { background: #BE123C; color: #fff; border-color: #BE123C; }
.bar2 { background: #FFF1F2; border: 1.5px solid #FDA4AF; border-radius: 10px; padding: 8px 12px; font-size: 10pt; font-weight: 700; }
.bar2.ok { background: #ECFDF5; border-color: #6EE7B7; color: #065F46; }
.modal { border: 2px dashed var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 8px; justify-items: center; background: #FFFCFA; }
.modal .code { font-size: 22pt; font-weight: 900; letter-spacing: 4px; background: var(--bg); padding: 6px 20px; border-radius: 10px; border: 1.5px solid var(--line); }
.perm { border: 1.5px solid var(--line); border-radius: 10px; padding: 10px; font-size: 10pt; display: grid; gap: 8px; }
.cbs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.cbs span { display: flex; gap: 8px; align-items: center; font-weight: 700; }
.net, .chain { display: flex; align-items: stretch; justify-content: center; gap: 6px; }
.net .box { flex: 1; border: 2.5px solid var(--line); border-radius: 14px; padding: 12px 8px; background: #fff; display: grid; gap: 3px; align-content: center; }
.net .box b { font-size: 14pt; font-weight: 900; } .net .box span { font-size: 9.5pt; font-weight: 700; } .net .box em { font-size: 9pt; font-style: normal; color: var(--muted); }
.b1 { border-color: var(--maroon) !important; } .b1 b { color: var(--maroon); } .b2 { border-color: var(--orange) !important; } .b2 b { color: var(--orange); } .b3 { border-color: var(--teal) !important; } .b3 b { color: var(--teal); }
.net .link { width: 74px; display: grid; align-content: center; justify-items: center; font-size: 8.5pt; color: var(--muted); font-weight: 700; }
.net .ar, .chain .ca { font-size: 22pt; color: var(--orange); font-weight: 900; line-height: 1.1; }
.chain { align-items: center; } .chain .ca { width: 26px; }
.st { flex: 1; border-radius: 12px; padding: 10px 6px; color: #fff; display: grid; gap: 4px; }
.st b { font-size: 11pt; font-weight: 900; } .st span { font-size: 8.5pt; opacity: .92; }
.s1 { background: #7C3AED; } .s2 { background: #BE123C; } .s3 { background: #0D9488; } .s4 { background: #D97706; }
.folder { border: 2px solid var(--line); border-radius: 12px; background: #fff; padding: 12px 16px; text-align: right; display: grid; gap: 6px; max-width: 520px; margin: auto; font-size: 10.5pt; }
.fi { font-weight: 900; font-size: 12pt; } .fl { padding: 5px 10px; border-radius: 8px; } .fl.dim { color: var(--muted); } .fl.hot { background: #FFF6D8; border: 2px solid #E8B923; font-weight: 900; } .fl.hot span { color: #B45309; margin-right: 8px; }
.term { background: #1F1B24; color: #E5E7EB; border-radius: 12px; padding: 14px 16px; text-align: right; font-size: 10pt; line-height: 2; max-width: 600px; margin: auto; border: 3px solid #3F3A47; }
.term .g { color: #4ADE80; } .term .ans { color: #FBBF24; background: rgba(251,191,36,.12); padding: 0 8px; border-radius: 6px; }
'''

html = f'''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>راه‌اندازی تصویری اتصال هورمند به سپیدار</title>
<style>{STYLE}{EXTRA}</style></head><body>
<div class="cover"><i class="orb o1"></i><i class="orb o2"></i>
<img src="img/logo.png" alt="">
<h1>اتصال هورمند به سپیدار</h1><div class="sub">راه‌اندازی قدم‌به‌قدم، همراه با شکل</div>
<div class="bar"></div><div class="ver">چهار مرحلهٔ ساده، یک‌بار برای همیشه</div></div>
<div class="tocpage"><h1>فهرست مطالب</h1>{toc_html}</div>
{''.join(body)}
</body></html>'''
open('sepidar-visual.html', 'w', encoding='utf-8').write(html)
print('chapters:', n[0])
