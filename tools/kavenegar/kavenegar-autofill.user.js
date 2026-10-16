// ==UserScript==
// @name         هورمند - ساخت خودکار الگوهای کاوه‌نگار
// @namespace    hoormand
// @version      1.0
// @description  فرم «ایجاد الگوی جدید» کاوه‌نگار را برای هر الگو پر می‌کند و ثبت می‌کند.
// @match        *://*.kavenegar.com/*
// @match        http://localhost:9801/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  const T = [
{
"n": "1",
"title": "خودکار: خوش‌آمدگویی به مشتری تازه",
"name": "hmcustomernew",
"text": "%token عزیز، به %token20 خوش آمدید. از آشنایی با شما خوشحالیم.\nاتوماسیون هورمند"
},
{
"n": "2",
"title": "خودکار: ثبت درخواست (فرصت فروش تازه)",
"name": "hmdealnew",
"text": "%token عزیز، درخواست شما در %token20 ثبت شد و کارشناس ما به‌زودی با شما تماس می‌گیرد.\nاتوماسیون هورمند"
},
{
"n": "3",
"title": "خودکار: صدور پیش‌فاکتور",
"name": "hmproformaissued",
"text": "%token عزیز، پیش‌فاکتور شما به شمارهٔ %token2 صادر شد.\n%token20\nاتوماسیون هورمند"
},
{
"n": "4",
"title": "خودکار: سپاس از خرید",
"name": "hmdealwon",
"text": "%token عزیز، از اعتماد و خرید شما از %token20 سپاسگزاریم.\nاتوماسیون هورمند"
},
{
"n": "5",
"title": "خودکار: ثبت گارانتی",
"name": "hmwarrantyissued",
"text": "%token عزیز، گارانتی کالای «%token10» شما به شمارهٔ %token2 ثبت شد و تا %token3 معتبر است.\n%token20\nاتوماسیون هورمند"
},
{
"n": "6",
"title": "خودکار: تبریک تولد (یک روز قبل)",
"name": "hmbirthdayeve",
"text": "%token عزیز، فردا تولد شماست؛ پیشاپیش تولدتان مبارک! از همراهی شما در %token20 سپاسگزاریم.\nاتوماسیون هورمند"
},
{
"n": "7",
"title": "خودکار: حل شدن درخواست پشتیبانی",
"name": "hmticketresolved",
"text": "%token عزیز، درخواست پشتیبانی شما (%token2) انجام شد. اگر مشکل ادامه داشت، پاسخ بدهید تا دوباره بررسی شود.\n%token20\nاتوماسیون هورمند"
},
{
"n": "8",
"title": "خودکار: یادآوری پیش‌فاکتور در حال انقضا",
"name": "hmproformalastday",
"text": "%token عزیز، اعتبار پیش‌فاکتور شما به شمارهٔ %token2 تا %token3 است. برای نهایی‌کردن سفارش یا هر پرسشی در خدمت شما هستیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "9",
"title": "فروش و پیش‌فاکتور: ارسال پیش‌فاکتور",
"name": "hmproformasent",
"text": "%token عزیز، پیش‌فاکتور درخواستی برای شما ارسال شد. لطفاً پس از بررسی اعلام نظر بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "10",
"title": "فروش و پیش‌فاکتور: یادآوری اعتبار پیش‌فاکتور",
"name": "hmproformaexpiring",
"text": "%token عزیز، یادآوری می‌کنیم که اعتبار پیش‌فاکتور ارسالی در حال اتمام است.\n%token20\nاتوماسیون هورمند"
},
{
"n": "11",
"title": "فروش و پیش‌فاکتور: پایان اعتبار پیش‌فاکتور",
"name": "hmproformaexpired",
"text": "%token عزیز، اعتبار پیش‌فاکتور قبلی به پایان رسیده است. در صورت تمایل، پیش‌فاکتور تازه با قیمت روز برایتان صادر می‌کنیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "12",
"title": "فروش و پیش‌فاکتور: ارسال پیشنهاد قیمت",
"name": "hmofferready",
"text": "%token عزیز، پیشنهاد قیمت درخواستی شما آماده شد و برایتان ارسال گردید. منتظر نظر شما هستیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "13",
"title": "فروش و پیش‌فاکتور: اطلاع تغییر قیمت",
"name": "hmpricechange",
"text": "%token عزیز، قیمت برخی کالاها تغییر کرده است. برای دریافت قیمت روز با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "14",
"title": "فروش و پیش‌فاکتور: موجود شدن کالا",
"name": "hmstockback",
"text": "%token عزیز، کالایی که درخواست کرده بودید موجود شد. برای هماهنگی خرید با ما در تماس باشید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "15",
"title": "فروش و پیش‌فاکتور: کالا فعلاً موجود نیست",
"name": "hmstocknone",
"text": "%token عزیز، کالای درخواستی شما فعلاً موجود نیست. به‌محض تأمین، به شما اطلاع می‌دهیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "16",
"title": "فروش و پیش‌فاکتور: خوش‌آمدگویی",
"name": "hmwelcome",
"text": "%token عزیز، از آشنایی با شما خوشحالیم. برای هر راهنمایی و سفارش، در خدمت شما هستیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "17",
"title": "پیگیری و جلسه: هماهنگی جلسه",
"name": "hmmeeting",
"text": "%token عزیز، جلسهٔ هماهنگی فردا در ساعت مقرر برگزار می‌شود. منتظر شما هستیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "18",
"title": "پیگیری و جلسه: یادآوری جلسه",
"name": "hmmeetingremind",
"text": "%token عزیز، یادآوری می‌کنیم که امروز با شما جلسه داریم. لطفاً در ساعت تعیین‌شده حضور داشته باشید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "19",
"title": "پیگیری و جلسه: تغییر زمان جلسه",
"name": "hmmeetingmove",
"text": "%token عزیز، به‌دلیل پیش‌آمدن مورد ضروری، زمان جلسه تغییر کرد. لطفاً برای هماهنگی زمان تازه با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "20",
"title": "پیگیری و جلسه: پیگیری درخواست",
"name": "hmfollowup",
"text": "%token عزیز، برای پیگیری درخواست قبلی شما تماس گرفتیم. لطفاً در اولین فرصت با ما در تماس باشید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "21",
"title": "پیگیری و جلسه: تماس بی‌پاسخ ما",
"name": "hmmissedcall",
"text": "%token عزیز، تماس گرفتیم و پاسخی دریافت نشد. هر زمان که مناسب بود با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "22",
"title": "پیگیری و جلسه: تماس مجدد خواهیم گرفت",
"name": "hmcallback",
"text": "%token عزیز، پیام شما را دریافت کردیم و در اولین فرصت با شما تماس می‌گیریم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "23",
"title": "پیگیری و جلسه: هماهنگی بازدید",
"name": "hmvisit",
"text": "%token عزیز، برای هماهنگی بازدید حضوری لطفاً زمان مناسب خود را اعلام بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "24",
"title": "پیگیری و جلسه: درخواست مدارک",
"name": "hmdocsneeded",
"text": "%token عزیز، برای ادامهٔ کار، لطفاً مدارک درخواستی را در اولین فرصت ارسال بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "25",
"title": "پشتیبانی و گارانتی: دریافت درخواست پشتیبانی",
"name": "hmsupportreceived",
"text": "%token عزیز، درخواست پشتیبانی شما دریافت شد و کارشناس ما در حال بررسی است.\n%token20\nاتوماسیون هورمند"
},
{
"n": "26",
"title": "پشتیبانی و گارانتی: پایان درخواست پشتیبانی",
"name": "hmsupportdone",
"text": "%token عزیز، درخواست پشتیبانی شما انجام شد. اگر مشکل ادامه داشت، لطفاً پاسخ بدهید تا دوباره بررسی شود.\n%token20\nاتوماسیون هورمند"
},
{
"n": "27",
"title": "پشتیبانی و گارانتی: نیاز به اطلاعات بیشتر",
"name": "hmsupportinfo",
"text": "%token عزیز، برای بررسی درخواست شما به اطلاعات بیشتری نیاز داریم. لطفاً توضیح یا تصویر مشکل را ارسال بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "28",
"title": "پشتیبانی و گارانتی: پایان نزدیک پلن پشتیبانی",
"name": "hmplanexpiring",
"text": "%token عزیز، اشتراک پشتیبانی شما به‌زودی به پایان می‌رسد. برای تمدید با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "29",
"title": "پشتیبانی و گارانتی: ثبت گارانتی",
"name": "hmwarrantyregistered",
"text": "%token عزیز، گارانتی کالای شما ثبت شد. لطفاً گواهی گارانتی را تا پایان دوره نزد خود نگه دارید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "30",
"title": "پشتیبانی و گارانتی: پایان نزدیک گارانتی",
"name": "hmwarrantyexpiring",
"text": "%token عزیز، گارانتی کالای شما به‌زودی به پایان می‌رسد. برای بررسی و خدمات پس از آن با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "31",
"title": "پشتیبانی و گارانتی: دریافت کالای خراب",
"name": "hmclaimreceived",
"text": "%token عزیز، کالای شما برای بررسی گارانتی دریافت شد. نتیجه را به‌زودی اطلاع می‌دهیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "32",
"title": "پشتیبانی و گارانتی: آماده تحویل (گارانتی)",
"name": "hmclaimdone",
"text": "%token عزیز، بررسی گارانتی کالای شما انجام شد و برای تحویل آماده است.\n%token20\nاتوماسیون هورمند"
},
{
"n": "33",
"title": "تشکر و مناسبت: تشکر از اعتماد",
"name": "hmthankstrust",
"text": "%token عزیز، از اعتماد شما سپاسگزاریم. در صورت نیاز به راهنمایی با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "34",
"title": "تشکر و مناسبت: تشکر از خرید",
"name": "hmthanksbuy",
"text": "%token عزیز، از خرید شما سپاسگزاریم. امیدواریم از آن راضی باشید. هر سؤالی داشتید در خدمتیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "35",
"title": "تشکر و مناسبت: درخواست نظر",
"name": "hmfeedback",
"text": "%token عزیز، نظر شما برای ما ارزشمند است. لطفاً دربارهٔ تجربهٔ خود از همکاری با ما بنویسید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "36",
"title": "تشکر و مناسبت: تبریک نوروز",
"name": "hmnewyear",
"text": "%token عزیز، فرارسیدن نوروز و سال نو را صمیمانه تبریک می‌گوییم. سالی سرشار از موفقیت برایتان آرزومندیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "37",
"title": "تشکر و مناسبت: تعطیلی شرکت",
"name": "hmholiday",
"text": "%token عزیز، به‌مناسبت تعطیلات، شرکت در روزهای اعلام‌شده تعطیل است. درخواست‌ها پس از بازگشایی پیگیری می‌شود.\n%token20\nاتوماسیون هورمند"
},
{
"n": "38",
"title": "تشکر و مناسبت: تبریک تولد",
"name": "hmbirthday",
"text": "%token عزیز، تولدتان مبارک! آرزوی سلامتی و شادکامی برای شما داریم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "39",
"title": "پرداخت و تحویل: یادآوری پرداخت",
"name": "hmpayremind",
"text": "%token عزیز، یادآوری می‌کنیم که موعد پرداخت فاکتور شما نزدیک است. لطفاً نسبت به تسویه اقدام فرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "40",
"title": "پرداخت و تحویل: دریافت وجه",
"name": "hmpayreceived",
"text": "%token عزیز، پرداخت شما دریافت شد. سپاس از همکاری شما.\n%token20\nاتوماسیون هورمند"
},
{
"n": "41",
"title": "پرداخت و تحویل: پرداخت معوق",
"name": "hmpaylate",
"text": "%token عزیز، موعد پرداخت فاکتور شما گذشته است. لطفاً در اولین فرصت نسبت به تسویه اقدام بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "42",
"title": "پرداخت و تحویل: سفارش آماده است",
"name": "hmorderready",
"text": "%token عزیز، سفارش شما آماده تحویل است. لطفاً برای هماهنگی دریافت یا ارسال با ما تماس بگیرید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "43",
"title": "پرداخت و تحویل: سفارش ارسال شد",
"name": "hmordersent",
"text": "%token عزیز، سفارش شما ارسال شد. پس از رسیدن، لطفاً دریافت آن را تأیید بفرمایید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "44",
"title": "پرداخت و تحویل: زمان تحویل",
"name": "hmdeliverytime",
"text": "%token عزیز، سفارش شما در بازهٔ زمانی اعلام‌شده تحویل داده می‌شود. هر تغییری را اطلاع می‌دهیم.\n%token20\nاتوماسیون هورمند"
},
{
"n": "45",
"title": "همکاران: جهت امضا",
"name": "hmstaffsign",
"text": "%token عزیز، نامهٔ «%token10» برای امضای شما در %token20 ثبت شد. لطفاً به کارتابل سامانه مراجعه کنید.\nاتوماسیون هورمند"
},
{
"n": "46",
"title": "همکاران: وظیفه جدید",
"name": "hmstafftasknew",
"text": "%token عزیز، وظیفهٔ جدید «%token10» در %token20 به شما سپرده شد.\nاتوماسیون هورمند"
},
{
"n": "47",
"title": "همکاران: موعد وظیفه امروز",
"name": "hmstafftasktoday",
"text": "%token عزیز، موعد وظیفهٔ «%token10» امروز است.\n%token20\nاتوماسیون هورمند"
},
{
"n": "48",
"title": "همکاران: موعد وظیفه گذشته",
"name": "hmstafftasklate",
"text": "%token عزیز، موعد وظیفهٔ «%token10» گذشته است؛ لطفاً در سامانه بررسی کنید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "49",
"title": "همکاران: تماس بی‌پاسخ",
"name": "hmstaffmissedcall",
"text": "%token عزیز، تماس بی‌پاسخ از «%token10» داشتید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "50",
"title": "همکاران: پیگیری مشتری امروز",
"name": "hmstafffollowuptoday",
"text": "%token عزیز، پیگیری مشتری «%token10» امروز موعد دارد.\n%token20\nاتوماسیون هورمند"
},
{
"n": "51",
"title": "همکاران: پیگیری مشتری عقب‌افتاده",
"name": "hmstafffollowuplate",
"text": "%token عزیز، پیگیری مشتری «%token10» عقب افتاده است؛ لطفاً انجام دهید.\n%token20\nاتوماسیون هورمند"
},
{
"n": "52",
"title": "همکاران: فروش موفق",
"name": "hmstaffdealwon",
"text": "%token عزیز، فروش موفق «%token10» در %token20 ثبت شد؛ تبریک!\nاتوماسیون هورمند"
},
{
"n": "53",
"title": "مشتری: یادآوری پرداخت",
"name": "hmcpaymentdue2",
"text": "%token عزیز، سفارش شما به شمارهٔ %token2 تأیید شد. لطفاً مبلغ آن را تا %token3 واریز فرمایید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "54",
"title": "مشتری: پرداخت دریافت شد",
"name": "hmcpaymentreceived2",
"text": "%token عزیز، پرداخت شما برای سفارش %token2 دریافت شد. از اعتماد شما سپاسگزاریم.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "55",
"title": "مشتری: سررسید چک",
"name": "hmcchequedue2",
"text": "%token عزیز، سررسید چک شما به شمارهٔ %token2 در تاریخ %token3 است.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "56",
"title": "مشتری: بازگشت مشتری خوابیده",
"name": "hmcwinback2",
"text": "%token عزیز، مدتی است از شما خبری نداریم. برای خرید بعدی از تخفیف ویژهٔ باشگاه مشتریان بهره‌مند شوید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "57",
"title": "مشتری: ارتقای سطح باشگاه",
"name": "hmcclubupgrade2",
"text": "%token عزیز، تبریک! به سطح «%token10» باشگاه مشتریان رسیدید و از تخفیف این سطح بهره‌مند می‌شوید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "58",
"title": "مشتری: نظرسنجی",
"name": "hmcsurvey2",
"text": "%token عزیز، نظر شما دربارهٔ خدمات ما برایمان مهم است. امتیاز خود را از ۱ تا ۵ به کارشناس ما اعلام کنید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "59",
"title": "مشتری: انقضای گارانتی",
"name": "hmcwarrantyexpiring2",
"text": "%token عزیز، اعتبار گارانتی کالای «%token10» شما به شمارهٔ %token2 در تاریخ %token3 به پایان می‌رسد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "60",
"title": "مشتری: انقضای پشتیبانی",
"name": "hmcsupportexpiring2",
"text": "%token عزیز، اشتراک پشتیبانی شما (%token2) تا %token3 معتبر است. برای تمدید با ما تماس بگیرید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "61",
"title": "مشتری: یادآوری جلسه",
"name": "hmcmeetingreminder2",
"text": "%token عزیز، یادآوری: جلسهٔ شما با ما در تاریخ %token3 برگزار می‌شود. منتظر شما هستیم.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "62",
"title": "مشتری: ارسال سفارش",
"name": "hmcshipped2",
"text": "%token عزیز، سفارش شما به شمارهٔ %token2 ارسال شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "63",
"title": "مشتری: مراجعهٔ نصب",
"name": "hmcinstallvisit2",
"text": "%token عزیز، همکار ما در تاریخ %token3 برای نصب یا بازدید به شما مراجعه می‌کند.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "64",
"title": "مشتری: پاسخ به تماس بی‌پاسخ",
"name": "hmccallback2",
"text": "%token عزیز، تماس شما را دیدیم؛ کارشناس ما به‌زودی با شما تماس می‌گیرد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "65",
"title": "مشتری: صدور فاکتور رسمی",
"name": "hmcinvoiceissued2",
"text": "%token عزیز، فاکتور رسمی شما به شمارهٔ %token2 صادر شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "66",
"title": "مشتری: تبریک مناسبت",
"name": "hmcoccasion2",
"text": "%token عزیز، %token10 را به شما تبریک می‌گوییم.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "67",
"title": "مشتری: پیشنهاد ویژه",
"name": "hmcoffer2",
"text": "%token عزیز، پیشنهاد ویژه برای شما: %token10\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "68",
"title": "مشتری: خوش‌آمد به پورتال",
"name": "hmcportalwelcome2",
"text": "%token عزیز، به پورتال مشتریان خوش آمدید. اطلاعات پرونده و پیش‌فاکتورهای خود را آنجا ببینید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "69",
"title": "همکاران: مشتری یا فرصت جدید به نام شما",
"name": "hmstaffcustomernew2",
"text": "%token عزیز، مشتری یا فرصت جدید «%token10» به نام شما ثبت شد؛ لطفاً سریع پیگیری کنید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "70",
"title": "همکاران: فرصت فروش بی‌پیگیری",
"name": "hmstaffdealstale2",
"text": "%token عزیز، فرصت فروش «%token10» چند روز است بدون پیگیری مانده است.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "71",
"title": "همکاران: تأیید یا رد پیش‌فاکتور",
"name": "hmstaffproformadecided2",
"text": "%token عزیز، تصمیم مدیرعامل دربارهٔ پیش‌فاکتور «%token10» ثبت شد؛ نتیجه را در سامانه ببینید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "72",
"title": "همکاران: پیش‌فاکتور منتظر تأیید",
"name": "hmstaffproformawait2",
"text": "%token عزیز، پیش‌فاکتور «%token10» منتظر تأیید شماست.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "73",
"title": "همکاران: انتقال مشتری",
"name": "hmstaffcustomermoved2",
"text": "%token عزیز، مشتری «%token10» به شما منتقل شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "74",
"title": "همکاران: درخواست مرخصی جدید",
"name": "hmstaffleavenew2",
"text": "%token عزیز، درخواست مرخصی «%token10» برای بررسی شما ثبت شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "75",
"title": "همکاران: نتیجهٔ درخواست مرخصی",
"name": "hmstaffleavedecided2",
"text": "%token عزیز، نتیجهٔ درخواست مرخصی شما («%token10») در سامانه ثبت شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "76",
"title": "همکاران: نامه امضا شد",
"name": "hmstafflettersigned2",
"text": "%token عزیز، نامهٔ «%token10» امضا شد؛ می‌توانید آن را در سامانه ببینید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "77",
"title": "همکاران: ارجاع به شما",
"name": "hmstaffreferral2",
"text": "%token عزیز، «%token10» به شما ارجاع شد؛ لطفاً در کارتابل بررسی کنید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "78",
"title": "همکاران: گزارش روزانه ثبت نشده",
"name": "hmstaffreportmissing2",
"text": "%token عزیز، گزارش روزانهٔ امروز هنوز ثبت نشده است؛ لطفاً تا پایان وقت ثبت کنید.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "79",
"title": "همکاران: پشتیبانی یا گارانتی به شما سپرده شد",
"name": "hmstaffsupportassigned2",
"text": "%token عزیز، درخواست «%token10» برای پیگیری به شما سپرده شد.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "80",
"title": "همکاران: خلاصهٔ امروز",
"name": "hmstaffdailysummary2",
"text": "%token عزیز، خلاصهٔ امروز شما: %token10\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "81",
"title": "همکاران: پیشرفت هدف ماه",
"name": "hmstafftargetprogress2",
"text": "%token عزیز، پیشرفت هدف ماه شما: %token10\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "82",
"title": "همکاران: تبریک مناسبت همکاران",
"name": "hmstaffoccasion2",
"text": "%token عزیز، %token10 را به شما تبریک می‌گوییم.\nاز طرف %token20\nاتوماسیون هورمند"
},
{
"n": "83",
"title": "همکاران: هشدار امنیتی",
"name": "hmstaffsecurity2",
"text": "%token عزیز، هشدار امنیتی: %token10. اگر شما نبودید، رمز عبور را عوض کنید.\nاز طرف %token20\nاتوماسیون هورمند"
}
];
  const K = 'hmKvgState';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
  const save = (s) => localStorage.setItem(K, JSON.stringify(s));
  let S = Object.assign({ i: 0, running: false, auto: true, company: '', product: 'هورمند', link: '', desc: '', url: '', paused: '' }, load());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const q = (sel, root) => (root || document).querySelector(sel);
  const all = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const findName = () => q('input[name=name]') || all('input[type=text],input:not([type])').find((e) => /template/i.test(e.placeholder || ''));
  const findText = () => all('textarea').find((e) => /تایپ کنید/.test(e.placeholder || '')) || all('textarea')[0];
  const findBtn = (re) => all('button').find((b) => re.test(b.textContent || ''));

  // ---------- panel ----------
  const box = document.createElement('div');
  box.dir = 'rtl';
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;width:300px;background:#fff;color:#222;border:2px solid #6E1B1B;border-radius:14px;font:13px/1.7 Tahoma,sans-serif;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)';
  document.body.appendChild(box);
  const btn = 'padding:6px 10px;margin:2px;border:0;border-radius:8px;background:#6E1B1B;color:#fff;cursor:pointer;font:inherit';
  const formPresent = () => !!findName() && !!findText();
  const render = (msg) => {
    const cur = T[S.i];
    box.innerHTML =
      '<b>ساخت خودکار الگوهای کاوه‌نگار</b><br>' +
      '<div id="hmst">' + (msg || S.paused || (S.running ? 'در حال کار...' : 'آماده')) + '</div>' +
      '<div>پیشرفت: ' + fa(Math.min(S.i, T.length)) + ' از ' + fa(T.length) + (cur ? '<br><small>' + cur.title + '</small>' : '<br>همهٔ الگوها انجام شد.') + '</div>' +
      '<div>نام سامانه: <input id="hmpr" style="width:150px" value="' + (S.product || '') + '"></div>' +
      '<div>لینک سامانه: <input id="hmlk" dir="ltr" style="width:150px" value="' + (S.link || '') + '"></div>' +
      '<div>توضیحات (اختیاری): <input id="hmds" style="width:150px" value="' + (S.desc || '').replace(/"/g, '&quot;') + '"></div>' +
      '<label><input type="checkbox" id="hmau" ' + (S.auto ? 'checked' : '') + '> خودش دکمهٔ ساخت را بزند</label><br>' +
      '<button id="hmgo" style="' + btn + '">' + (S.running ? 'ادامه' : 'شروع') + '</button>' +
      '<button id="hmst2" style="' + btn + ';background:#666">توقف</button>' +
      '<button id="hmsk" style="' + btn + ';background:#666">رد کردن این یکی</button>' +
      '<button id="hmrs" style="' + btn + ';background:#999">از اول</button>' +
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd"><b>پاک‌سازی (در صفحهٔ فهرست الگوها)</b><br>' +
      '<button id="hmdl" style="' + btn + ';background:#c0392b">حذف الگوهای «در حال بررسی»</button>' +
      '<button id="hmdx" style="' + btn + ';background:#666">توقف حذف</button></div>';
    q('#hmgo', box).onclick = () => { readFields(); S.running = true; S.paused = ''; if (formPresent() || !S.url) S.url = location.href; save(S); run(); };
    q('#hmst2', box).onclick = () => { S.running = false; save(S); render('متوقف شد.'); };
    q('#hmsk', box).onclick = () => { S.i++; S.paused = ''; save(S); go(); };
    q('#hmdl', box).onclick = () => purgePending();
    q('#hmdx', box).onclick = () => { stopPurge = true; };
    q('#hmrs', box).onclick = () => { S.i = 0; S.running = false; S.paused = ''; save(S); render(); };
  };
  const readFields = () => { S.product = q('#hmpr', box).value.trim(); S.link = q('#hmlk', box).value.trim(); S.desc = q('#hmds', box).value.trim(); S.auto = q('#hmau', box).checked; save(S); };
  const go = () => { if (S.url && location.href !== S.url) location.href = S.url; else location.reload(); };
  const status = (m) => { const e = q('#hmst', box); if (e) e.textContent = m; };
  const pause = (why) => { S.running = false; S.paused = why; save(S); render(why); };

  async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(250); } return null; }

  // Real mouse click: the host browser (when it offers hmRealClick) clicks at the element; otherwise a plain click.
  async function realClick(el) {
    el.scrollIntoView({ block: 'center' });
    await sleep(200);
    const r = el.getBoundingClientRect();
    if (typeof window.hmRealClick === 'function') await window.hmRealClick(r.x + r.width / 2, r.y + r.height / 2);
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(500);
  }
  const productEl = () => q('input[name=productName]');
  // «نوع استفاده» = سایر; that opens the fields «نام سامانه»، «لینک سامانه» و «توضیحات».
  async function chooseType() {
    if (productEl()) return true;
    const trigger = all('button').find((e) => /نوع استفاده خود را/.test(e.textContent || ''));
    if (!trigger) return true; // this form has no such field
    await realClick(trigger);
    const opt = await waitFor(() => all('span,[role=option]').find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'سایر'), 3000);
    if (!opt) return false;
    await realClick(opt);
    return !!(await waitFor(productEl, 3000));
  }

  async function run() {
    if (!S.running) return;
    const cur = T[S.i];
    if (!cur) { S.running = false; const sk = S.skipped || []; S.skipped = []; save(S); return render('همهٔ الگوها انجام شد.' + (sk.length ? ' ' + fa(sk.length) + ' الگو را کاوه‌نگار نپذیرفت (معمولاً تکراری) و رد شد: ' + sk.join('، ') : '')); }
    render('الگوی ' + fa(cur.n) + ' در حال پر شدن...');
    const nameEl = await waitFor(findName, S.url && location.href !== S.url ? 2500 : 15000);
    const textEl = findText();
    if (!nameEl || !textEl) {
      if (S.url && location.href !== S.url) { go(); return; }
      return pause('فرم ایجاد الگو پیدا نشد. به صفحهٔ «ایجاد الگوی جدید» بروید و «ادامه» را بزنید.');
    }
    if (!S.link) return pause('اول لینک سامانه را بنویسید و دوباره «ادامه» را بزنید.');
    const ok = await chooseType();
    if (!ok) return pause('نوع استفاده را خودتان روی «سایر» بگذارید و «ادامه» را بزنید.');
    if (productEl()) { setVal(productEl(), S.product || 'هورمند'); const lk = q('input[name=platformLink]'); if (lk) setVal(lk, S.link); const ds = q('textarea[name=description]'); if (ds && S.desc) setVal(ds, S.desc); }
    setVal(findName(), cur.name);
    setVal(findText(), cur.text);
    if (!S.auto) return pause('الگو پر شد. خودتان «ساخت الگو» را بزنید، بعد در صفحهٔ بعد «ادامه» را بزنید.');
    const submit = findBtn(/ساخت الگو/);
    if (!submit) return pause('دکمهٔ «ساخت الگو» پیدا نشد.');
    const before = location.href;
    S.i++; save(S); // counted before the click: the page may reload at once
    submit.click();
    const done = await waitFor(() => location.href !== before || !formPresent(), 10000);
    if (done) { await sleep(1200); go(); return; }
    // the form refused it (a red message: usually «تکراری» = the name already exists): do not stop, note it and go to the next one
    S.skipped = (S.skipped || []).concat([cur.name]); save(S);
    await sleep(600);
    go();
  }

  // ---------- delete the templates that are still «در حال بررسی» (only the ones this tool made: names starting with hm) ----------
  let stopPurge = false;
  const pendingRows = () => all('tbody tr').filter((r) => /در حال بررسی/.test(r.innerText || '') && /\bhm[a-z0-9]+\b/.test(r.innerText || ''));
  const rowName = (r) => ((r.innerText || '').match(/\bhm[a-z0-9]+\b/) || [''])[0];
  const dlgBtn = (sel, label) => all(sel + ' button').find((b) => (b.textContent || '').trim() === label);
  async function purgePending() {
    const n = pendingRows().length;
    if (!n) { status('در این صفحه الگوی «در حال بررسی» که نامش با hm شروع شود پیدا نشد (فهرست الگوها را باز کنید).'); return; }
    if (!confirm(n + ' الگوی «در حال بررسی» (فقط با نام hm...) یکی‌یکی حذف می‌شود و قابل بازیابی نیست. ادامه می‌دهید؟')) return;
    stopPurge = false;
    let done = 0;
    for (;;) {
      if (stopPurge) { status('حذف متوقف شد. ' + fa(done) + ' الگو حذف شد.'); return; }
      const row = pendingRows()[0];
      if (!row) break;
      const name = rowName(row);
      status('در حال حذف ' + name + ' ... (' + fa(done) + ' تا اینجا)');
      const eye = q('svg[data-icon=eye]', row);
      if (!eye) { status('دکمهٔ چشم برای ' + name + ' پیدا نشد؛ متوقف شد.'); return; }
      await realClick(eye);
      const dlg = await waitFor(() => q('[role=dialog]'), 4000);
      if (!dlg || !(dlg.innerText || '').includes(name) || !/در حال بررسی/.test(dlg.innerText || '')) { status('پنجرهٔ ' + name + ' درست باز نشد؛ متوقف شد.'); return; }
      const del = await waitFor(() => dlgBtn('[role=dialog]', 'حذف الگو'), 3000);
      if (!del) { status('دکمهٔ «حذف الگو» پیدا نشد؛ متوقف شد.'); return; }
      await realClick(del);
      const ok = await waitFor(() => dlgBtn('[role=alertdialog]', 'حذف'), 3000);
      if (!ok) { status('پنجرهٔ تأیید حذف باز نشد؛ متوقف شد.'); return; }
      await realClick(ok);
      const gone = await waitFor(() => !all('tbody tr').some((r) => rowName(r) === name), 10000);
      if (!gone) { status(name + ' حذف نشد؛ متوقف شد.'); return; }
      done++;
      await sleep(600);
      const close = await waitFor(() => dlgBtn('[role=dialog]', 'Close'), 600);
      if (close) await realClick(close);
    }
    status('تمام شد. ' + fa(done) + ' الگوی «در حال بررسی» حذف شد.');
  }

  render();
  if (S.running) setTimeout(run, 1200);
})();
