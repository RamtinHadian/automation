"""One source for every Kavenegar template.

Reads the automatic messages (server/internal/sms/auto.go) and the ready-made texts (web/src/lib/smsLibrary.ts) and writes:
  1. server/internal/sms/kvtemplates_gen.go   what the server sends (template name + text with {variables})
  2. sms-kavenegar-templates.md               the same list, for copying by hand
  3. <autofill folder>/kavenegar-autofill.user.js   the panel that registers them in the Kavenegar console

Every text ends with the fixed line «اتوماسیون هورمند»; the company name is a variable ({company} -> %token20 (several words, so a parameter that accepts spaces)).
Run:  python tools/kavenegar/gen_templates.py [folder-of-the-autofill-tool]
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SIGN = 'اتوماسیون هورمند'
FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
# variable -> Kavenegar parameter (%token is required in every template; only token10/token20 accept spaces)
TOKEN = {'name': '%token', 'number': '%token2', 'end': '%token3', 'company': '%token20', 'product': '%token10', 'subject': '%token10'}
LABEL = {'name': 'نام مشتری', 'number': 'شماره', 'end': 'تاریخ', 'company': 'نام شرکت', 'product': 'نام کالا', 'subject': 'موضوع'}


def read(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()


auto_src = read('server/internal/sms/auto.go')
autos = re.findall(r'Key: "(\w+)", Title: "([^"]+)", When: "([^"]+)",\s*\n\s*Text:\s*"([^"]+)"', auto_src)
lib_src = read('web/src/lib/smsLibrary.ts')
libs = re.findall(r"key: '([\w-]+)', group: '([^']+)', label: '([^']+)', text: '([^']+)'", lib_src)

items = []  # key, name, title, when, text, auto
for key, title, when, text in autos:
    if '{company}' not in text:
        text += '\n{company}'
    items.append((key, 'hm' + key.replace('_', ''), 'خودکار: ' + title, when, text + '\n' + SIGN, True))
for key, group, label, text in libs:
    body = re.sub(r'^با سلام( و احترام)?[؛،]?\s*', '', text)
    items.append((key, 'hm' + key.replace('-', ''), group + ': ' + label, '', '{name} عزیز، ' + body + '\n{company}\n' + SIGN, False))

# messages to the company's own staff (the notifications that are also sent as SMS): {name} = the person, {subject} = what it is about
STAFF = [
    ('staff_sign', 'جهت امضا', 'نامهٔ «{subject}» برای امضای شما در {company} ثبت شد. لطفاً به کارتابل سامانه مراجعه کنید.'),
    ('staff_task_new', 'وظیفه جدید', 'وظیفهٔ جدید «{subject}» در {company} به شما سپرده شد.'),
    ('staff_task_today', 'موعد وظیفه امروز', 'موعد وظیفهٔ «{subject}» امروز است.\n{company}'),
    ('staff_task_late', 'موعد وظیفه گذشته', 'موعد وظیفهٔ «{subject}» گذشته است؛ لطفاً در سامانه بررسی کنید.\n{company}'),
    ('staff_missed_call', 'تماس بی‌پاسخ', 'تماس بی‌پاسخ از «{subject}» داشتید.\n{company}'),
    ('staff_followup_today', 'پیگیری مشتری امروز', 'پیگیری مشتری «{subject}» امروز موعد دارد.\n{company}'),
    ('staff_followup_late', 'پیگیری مشتری عقب‌افتاده', 'پیگیری مشتری «{subject}» عقب افتاده است؛ لطفاً انجام دهید.\n{company}'),
    ('staff_deal_won', 'فروش موفق', 'فروش موفق «{subject}» در {company} ثبت شد؛ تبریک!'),
]
for key, label, text in STAFF:
    items.append((key, 'hm' + key.replace('_', ''), 'همکاران: ' + label, 'اعلان داخلی که پیامک هم می‌شود', '{name} عزیز، ' + text + '\n' + SIGN, True))

# More messages for customers (prepared in the Kavenegar console first; the app starts sending each one when its event is built)
MORE_CUSTOMER = [
    ('c_payment_due', 'یادآوری پرداخت', 'سفارش شما به شمارهٔ {number} تأیید شد. لطفاً مبلغ آن را تا {end} واریز فرمایید.'),
    ('c_payment_received', 'پرداخت دریافت شد', 'پرداخت شما برای سفارش {number} دریافت شد. از اعتماد شما سپاسگزاریم.'),
    ('c_cheque_due', 'سررسید چک', 'سررسید چک شما به شمارهٔ {number} در تاریخ {end} است.'),
    ('c_win_back', 'بازگشت مشتری خوابیده', 'مدتی است از شما خبری نداریم. برای خرید بعدی از تخفیف ویژهٔ باشگاه مشتریان بهره‌مند شوید.'),
    ('c_club_upgrade', 'ارتقای سطح باشگاه', 'تبریک! به سطح «{subject}» باشگاه مشتریان رسیدید و از تخفیف این سطح بهره‌مند می‌شوید.'),
    ('c_survey', 'نظرسنجی', 'نظر شما دربارهٔ خدمات ما برایمان مهم است. امتیاز خود را از ۱ تا ۵ به کارشناس ما اعلام کنید.'),
    ('c_warranty_expiring', 'انقضای گارانتی', 'اعتبار گارانتی کالای «{product}» شما به شمارهٔ {number} در تاریخ {end} به پایان می‌رسد.'),
    ('c_support_expiring', 'انقضای پشتیبانی', 'اشتراک پشتیبانی شما ({number}) تا {end} معتبر است. برای تمدید با ما تماس بگیرید.'),
    ('c_meeting_reminder', 'یادآوری جلسه', 'یادآوری: جلسهٔ شما با ما در تاریخ {end} برگزار می‌شود. منتظر شما هستیم.'),
    ('c_shipped', 'ارسال سفارش', 'سفارش شما به شمارهٔ {number} ارسال شد.'),
    ('c_install_visit', 'مراجعهٔ نصب', 'همکار ما در تاریخ {end} برای نصب یا بازدید به شما مراجعه می‌کند.'),
    ('c_callback', 'پاسخ به تماس بی‌پاسخ', 'تماس شما را دیدیم؛ کارشناس ما به‌زودی با شما تماس می‌گیرد.'),
    ('c_invoice_issued', 'صدور فاکتور رسمی', 'فاکتور رسمی شما به شمارهٔ {number} صادر شد.'),
    ('c_occasion', 'تبریک مناسبت', '{subject} را به شما تبریک می‌گوییم.'),
    ('c_offer', 'پیشنهاد ویژه', 'پیشنهاد ویژه برای شما: {subject}'),
    ('c_portal_welcome', 'خوش‌آمد به پورتال', 'به پورتال مشتریان خوش آمدید. اطلاعات پرونده و پیش‌فاکتورهای خود را آنجا ببینید.'),
]
for key, label, text in MORE_CUSTOMER:
    items.append((key, 'hm' + key.replace('_', ''), 'مشتری: ' + label, 'رویداد آینده', '{name} عزیز، ' + text + '\n{company}\n' + SIGN, True))

# More messages for the company's own staff
MORE_STAFF = [
    ('staff_customer_new', 'مشتری یا فرصت جدید به نام شما', 'مشتری یا فرصت جدید «{subject}» به نام شما ثبت شد؛ لطفاً سریع پیگیری کنید.'),
    ('staff_deal_stale', 'فرصت فروش بی‌پیگیری', 'فرصت فروش «{subject}» چند روز است بدون پیگیری مانده است.'),
    ('staff_proforma_decided', 'تأیید یا رد پیش‌فاکتور', 'تصمیم مدیرعامل دربارهٔ پیش‌فاکتور «{subject}» ثبت شد؛ نتیجه را در سامانه ببینید.'),
    ('staff_proforma_wait', 'پیش‌فاکتور منتظر تأیید', 'پیش‌فاکتور «{subject}» منتظر تأیید شماست.'),
    ('staff_customer_moved', 'انتقال مشتری', 'مشتری «{subject}» به شما منتقل شد.'),
    ('staff_leave_new', 'درخواست مرخصی جدید', 'درخواست مرخصی «{subject}» برای بررسی شما ثبت شد.'),
    ('staff_leave_decided', 'نتیجهٔ درخواست مرخصی', 'نتیجهٔ درخواست مرخصی شما («{subject}») در سامانه ثبت شد.'),
    ('staff_letter_signed', 'نامه امضا شد', 'نامهٔ «{subject}» امضا شد؛ می‌توانید آن را در سامانه ببینید.'),
    ('staff_referral', 'ارجاع به شما', '«{subject}» به شما ارجاع شد؛ لطفاً در کارتابل بررسی کنید.'),
    ('staff_report_missing', 'گزارش روزانه ثبت نشده', 'گزارش روزانهٔ امروز هنوز ثبت نشده است؛ لطفاً تا پایان وقت ثبت کنید.'),
    ('staff_support_assigned', 'پشتیبانی یا گارانتی به شما سپرده شد', 'درخواست «{subject}» برای پیگیری به شما سپرده شد.'),
    ('staff_daily_summary', 'خلاصهٔ امروز', 'خلاصهٔ امروز شما: {subject}'),
    ('staff_target_progress', 'پیشرفت هدف ماه', 'پیشرفت هدف ماه شما: {subject}'),
    ('staff_occasion', 'تبریک مناسبت همکاران', '{subject} را به شما تبریک می‌گوییم.'),
    ('staff_security', 'هشدار امنیتی', 'هشدار امنیتی: {subject}. اگر شما نبودید، رمز عبور را عوض کنید.'),
]
for key, label, text in MORE_STAFF:
    items.append((key, 'hm' + key.replace('_', ''), 'همکاران: ' + label, 'رویداد آینده', '{name} عزیز، ' + text + '\n{company}\n' + SIGN, True))

names = [i[1] for i in items]
assert len(set(names)) == len(names), 'template names must be unique'


def tokens(text):
    return text, [v for v in dict.fromkeys(re.findall(r'\{(\w+)\}', text))]


def to_kv(text):
    return re.sub(r'\{(\w+)\}', lambda m: TOKEN[m.group(1)], text)


# 1. Go
go = ['// Code generated by tools/kavenegar/gen_templates.py; DO NOT EDIT.', '', 'package sms', '',
      '// KVTemplates are the texts registered in the Kavenegar console under the given names. {name} {company} {number} {end} {product} {subject}', '// are sent as parameters; every text ends with the fixed line of the product.',
      'var KVTemplates = []KVTemplate{']
for key, name, title, when, text, is_auto in items:
    go.append('\t{Key: %s, Name: %s, Auto: %s, Staff: %s, Text: %s},' % (json.dumps(key), json.dumps(name), 'true' if is_auto else 'false', 'true' if key.startswith('staff_') else 'false', json.dumps(text, ensure_ascii=False)))
go.append('}')
open(os.path.join(ROOT, 'server/internal/sms/kvtemplates_gen.go'), 'w', encoding='utf-8', newline='\n').write('\n'.join(go) + '\n')

# 2. markdown
o = ['# الگوهای کاوه‌نگار برای سامانهٔ هورمند', '',
     'هر الگو یک «نام» لاتین و یک «متن» دارد. هر دو را عیناً در «ایجاد الگوی جدید» کاوه‌نگار بگذارید (یا با ابزار خودکار ثبت کنید).', '',
     '## معنی پارامترها', '']
o += ['- %s = %s' % (TOKEN[k], LABEL[k]) for k in ('name', 'company', 'number', 'end', 'product', 'subject')]
o += ['', 'آخر همهٔ متن‌ها خطِ ثابت «%s» هست و نام شرکت از پارامتر می‌آید؛ پس یک فایل برای همهٔ مشتریان کافی است.' % SIGN, '', '## الگوها', '']
for n, (key, name, title, when, text, is_auto) in enumerate(items, 1):
    o.append('### الگوی %s: %s' % (str(n).translate(FA), title))
    if when:
        o.append('زمان ارسال: ' + when)
    o += ['', 'نام الگو:', '```', name, '```', '', 'متن الگو:', '```', to_kv(text), '```', '',
          'پارامترها: ' + '، '.join('%s = %s' % (TOKEN[v], LABEL[v]) for v in tokens(text)[1]), '']
open(os.path.join(ROOT, 'sms-kavenegar-templates.md'), 'w', encoding='utf-8').write('\n'.join(o))

# 3. autofill panel
data = [{'n': str(n), 'title': title, 'name': name, 'text': to_kv(text)} for n, (key, name, title, when, text, a) in enumerate(items, 1)]
tpl = read('tools/kavenegar/autofill.template.js')
out = tpl.replace('/*DATA*/[]', json.dumps(data, ensure_ascii=False, indent=0))
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'kavenegar')
os.makedirs(dest, exist_ok=True)
open(os.path.join(dest, 'kavenegar-autofill.user.js'), 'w', encoding='utf-8').write(out)
print('templates:', len(items), 'ok')
