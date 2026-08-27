/* ═══════════════════════════════════════════════════════════════════════
   gmt-config.js — مصدر الحقيقة الوحيد لمفاتيح قواعد البيانات
   استُخرج كملف مستقل: 2026-08-18

   سبب الاستخراج: الصفحات تستدعي <script src="gmt-config.js"> وتتوقّع كائن
   GMT_DB، لكن الملف لم يكن موجوداً في المستودع (كان مدموجاً داخل gmt-core.js
   فقط) ⇒ رسالة «مفاتيح Supabase غير موجودة — الصفحة لا تعرف عنوان القاعدة».
   المحتوى منسوخ حرفياً من الكتلة المدموجة — لا تغيير في أي مفتاح.

   ⚠️ يجب أن يُستدعى **قبل** باقي السكربتات:
       <script src="gmt-config.js"></script>
       <script src="gmt-core.js"></script>
   ═══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   gmt-config.js — مصدر الحقيقة الوحيد لمفاتيح قواعد البيانات
   أُنشئ 2026-07-12 · توصية المهندس المعتمدة من المالك.

   المشكلة التي يحلّه: رابط القاعدة والمفتاح كانا مكرَّرين يدوياً في 16 ملفاً
   عبر 4 قواعد مختلفة. أي تدوير مفتاح = 16 تعديل يدوي — وأول ملف تنساه يفشل
   بصمت (لا رسالة خطأ، فقط بيانات لا تُحمَّل).

   بعد اليوم: أي مفتاح جديد يُغيَّر هنا فقط، ويُنشر هذا الملف على المجلدات.
   ⚠️ الملفات القديمة ما زالت تحمل مفاتيحها المضمّنة (لم نلمسها كي لا تنكسر)؛
   الهجرة تدريجية: كل ملف يُعدَّل مستقبلاً يقرأ من هنا:
       const { url, key } = GMT_DB.MAIN;
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const GMT_DB = {
    /* القاعدة الرئيسية — نقاط البيع · الجرد · الأوردرات · المشتريات · العمولات */
    MAIN: {
      url: 'https://ysawzwtmodkqqbqoiojj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYXd6d3Rtb2RrcXFicW9pb2pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjI0OTUsImV4cCI6MjA5MjAzODQ5NX0.g-dBDpHzMsP_0IQAKFxzWkKzc_I13bGUMeYNgcUmrKQ',
    },

    /* قاعدة الكفالات — إنشاء الكفالة · إدارتها · البحث عنها */
    WARRANTY: {
      url: 'https://abppuwylukzpqckazegk.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFicHB1d3lsdWt6cHFja2F6ZWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTQ4NzYsImV4cCI6MjA5ODczMDg3Nn0.Dx6WCUfXD4T8D_tJclB9VuMUS3B0YSwejexrRrYhnqo',
    },

    /* قاعدة المتجر — المنتجات · الطلبات · العروض */
    STORE: {
      url: 'https://tupldwylzrkjzqtaiscv.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1cGxkd3lsenJranpxdGFpc2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTEzNTQsImV4cCI6MjA5MTA2NzM1NH0.RKsdAg4v7TcuMhBepztJtRdTtsR-f8cMcoDXKmnZXO0',
    },

    /* قاعدة الموقع الرئيسي — الأخبار · الوكلاء · بطاقات العروض */
    SITE: {
      url: 'https://znpakcaizvkwqzhosxvm.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpucGFrY2FpenZrd3F6aG9zeHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzM0NTMsImV4cCI6MjA5NTkwOTQ1M30.YW3YuT-RRTpKw5WeFHkPeTUcXBBtaQFGCaCrBQWykks',
    },

  };

  /* رؤوس REST جاهزة لأي قاعدة: GMT_DB.headers(GMT_DB.MAIN) */
  GMT_DB.headers = (db, extra) => Object.assign({
    apikey         : db.key,
    Authorization  : 'Bearer ' + db.key,
    'Content-Type' : 'application/json',
  }, extra || {});

  /* عميل supabase-js جاهز (إن كانت المكتبة محمّلة) */
  GMT_DB.client = (db) => (global.supabase && global.supabase.createClient)
    ? global.supabase.createClient(db.url, db.key)
    : null;

  Object.freeze(GMT_DB);
  global.GMT_DB = GMT_DB;

  /* ══════════════════════════════════════════════════════════════════════
     🔧 (2026-08-18) أسماء مرادفة للتوافق — لا تُستعمل في الكود الجديد.
     السبب: صفحات قديمة تبحث عن أسماء مختلفة لنفس البيانات:
        • checks.html  ⇐ GMT_CONFIG.SUPABASE_URL / .SUPABASE_ANON_KEY
        • صفحات أخرى   ⇐ window.SUPABASE_URL / window.SUPABASE_ANON_KEY / SB / KEY
     ولأن هذا الملف يعرّف GMT_DB.MAIN.url فقط، كانت تلك الصفحات تُبلّغ
     «رابط/مفتاح القاعدة غير متوفر» رغم أن المفاتيح محمّلة فعلاً (نمط P1 على
     مستوى الأسماء: عدم تطابق صامت). نُوفّر المرادفات هنا **دون أن ندهس** أي
     قيمة عرّفتها الصفحة لنفسها.
     ══════════════════════════════════════════════════════════════════════ */
  if (!global.GMT_CONFIG) {
    global.GMT_CONFIG = Object.freeze({
      SUPABASE_URL      : GMT_DB.MAIN.url,
      SUPABASE_ANON_KEY : GMT_DB.MAIN.key,
      WARRANTY_URL      : GMT_DB.WARRANTY.url,
      WARRANTY_ANON_KEY : GMT_DB.WARRANTY.key,
      STORE_URL         : GMT_DB.STORE.url,
      STORE_ANON_KEY    : GMT_DB.STORE.key,
      SITE_URL          : GMT_DB.SITE.url,
      SITE_ANON_KEY     : GMT_DB.SITE.key,
    });
  }
  if (!global.SUPABASE_URL)      global.SUPABASE_URL      = GMT_DB.MAIN.url;
  if (!global.SUPABASE_ANON_KEY) global.SUPABASE_ANON_KEY = GMT_DB.MAIN.key;
  if (!global.SUPABASE_KEY)      global.SUPABASE_KEY      = GMT_DB.MAIN.key;
})(window);
