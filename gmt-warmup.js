/* ═══════════════════════════════════════════════════════════════════════════
   🚀 GMTWarmup — التحميل الأوّلي الكامل (بيانات + صور دفعة واحدة)
   2026-08-23

   طلب المالك: «خليه يحمّل الصور والبيانات دفعة وحدة أول مرة نفتحه — متل ما كان
   موجود من قبل».

   ما كان موجوداً: `GMTCache` يخزّن **عند الطلب** فقط — البيانات تُخزَّن حين تُقرأ،
   والصورة تُخزَّن حين تظهر على الشاشة. فمن لم يتصفّح كل الصفحات تبقى بياناته ناقصة،
   ولا يعمل بلا إنترنت إلا جزئياً.

   ما تفعله هذه الوحدة: عند أول فتح (أو بطلب المالك) تُنزّل **كل** ما يحتاجه النظام
   دفعةً واحدة وتخزّنه محلياً:
     ▸ المنتجات · الفروع · الإعدادات · المستخدمون
     ▸ **كل صور المنتجات** بالتوازي (6 معاً) مع شريط تقدّم
   ثم يعمل النظام من التخزين المحلي ولا يُرهق القاعدة إلا للمزامنة.

   🛡️ الأمان: قراءة فقط · لا تكتب شيئاً في القاعدة · قابلة للإلغاء ·
   تتخطّى ما هو مخزَّن مسبقاً · تعمل مرّة واحدة تلقائياً ثم يدوياً عند الطلب.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const KEY_DONE = 'gmt_warmup_done_v1';
  const IMG_CONCURRENCY = 6;
  let _running = false, _cancel = false;

  function creds() {
    const url = global.SB || global.SUPABASE_URL || (global.GMT_DB && GMT_DB.MAIN.url);
    const key = global.KEY || global.SUPABASE_ANON_KEY || (global.GMT_DB && GMT_DB.MAIN.key);
    return { url, key };
  }

  async function fetchAll(table, select) {
    const { url, key } = creds();
    if (!url || !key) throw new Error('لا توجد مفاتيح قاعدة');
    const out = [];
    const PAGE = 1000;                      // PostgREST يفرض سقفاً — نُصفّح لتفادي النقص الصامت
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select || '*')}`, {
        headers: { apikey: key, Authorization: 'Bearer ' + key, Range: `${from}-${from + PAGE - 1}` }
      });
      if (!r.ok) throw new Error(table + ': HTTP ' + r.status);
      const rows = await r.json();
      out.push(...rows);
      if (rows.length < PAGE) break;
      if (out.length > 50000) break;        // حارس أمان
    }
    return out;
  }

  /* ── واجهة التقدّم ── */
  function ui() {
    let el = document.getElementById('gmt-warmup-ov');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'gmt-warmup-ov';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.93);' +
      'display:flex;align-items:center;justify-content:center;font-family:inherit;direction:rtl';
    el.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:26px 30px;max-width:440px;width:90%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35)">' +
        '<div style="font-size:34px;margin-bottom:8px">🚀</div>' +
        '<div style="font-weight:900;font-size:17px;color:#0f172a">تجهيز النظام للعمل بلا إنترنت</div>' +
        '<div id="gmt-wu-step" style="font-size:13px;color:#64748b;margin:10px 0 14px">جارٍ البدء…</div>' +
        '<div style="height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden">' +
          '<div id="gmt-wu-bar" style="height:100%;width:0%;background:#D5001C;transition:width .25s"></div></div>' +
        '<div id="gmt-wu-pct" style="font-size:12px;color:#64748b;margin-top:8px">0%</div>' +
        '<div style="font-size:11.5px;color:#94a3b8;margin-top:12px;line-height:1.7">' +
          'يحدث هذا <b>مرّة واحدة</b>. بعده يعمل النظام من جهازك ويخفّ الضغط على القاعدة.</div>' +
        '<button id="gmt-wu-cancel" style="margin-top:14px;background:#f1f5f9;border:1px solid #e2e8f0;' +
          'border-radius:9px;padding:8px 18px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit">تخطّي الآن</button>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
    el.querySelector('#gmt-wu-cancel').onclick = () => { _cancel = true; };
    return el;
  }
  function setStep(txt, pct) {
    try {
      const s = document.getElementById('gmt-wu-step');
      const b = document.getElementById('gmt-wu-bar');
      const p = document.getElementById('gmt-wu-pct');
      if (s) s.textContent = txt;
      if (b) b.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (p) p.textContent = Math.round(pct) + '%';
    } catch (_) {}
  }
  function close() { try { document.getElementById('gmt-warmup-ov')?.remove(); } catch (_) {} }

  /* ── التشغيل ── */
  async function run(opts) {
    opts = opts || {};
    if (_running) return;
    if (!global.GMTCache) { console.warn('[Warmup] GMTCache غير محمّل'); return; }
    _running = true; _cancel = false;
    const silent = opts.silent === true;
    if (!silent) ui();
    const report = { products: 0, images: 0, imagesFailed: 0, tables: {}, errors: [] };

    try {
      /* ① البيانات — الجداول التي يحتاجها العمل اليومي */
      const TABLES = [
        ['products',    '*',                        'المنتجات'],
        ['inv_columns', '*',                        'الفروع'],
        ['gmt_settings','*',                        'الإعدادات'],
        ['import_log',  'id,inv_number,status,transferred,created_at', 'فواتير الاستيراد'],
      ];
      let allProducts = [];
      for (let i = 0; i < TABLES.length; i++) {
        if (_cancel) break;
        const [tbl, sel, label] = TABLES[i];
        setStep('تنزيل ' + label + '…', (i / TABLES.length) * 30);
        try {
          const rows = await fetchAll(tbl, sel);
          report.tables[tbl] = rows.length;
          if (tbl === 'products') allProducts = rows;
          try { await GMTCache.bulkPut('inv_' + tbl, rows); } catch (_) {}
        } catch (e) { report.errors.push(label + ': ' + e.message); }
      }
      report.products = allProducts.length;

      /* ② الصور — كل صور المنتجات بالتوازي */
      const urls = [...new Set(allProducts.map(p => p && p.image_url).filter(u => u && /^https?:/i.test(u)))];
      setStep('تنزيل ' + urls.length + ' صورة…', 30);
      let done = 0;
      await Promise.all(Array.from({ length: IMG_CONCURRENCY }, async () => {
        while (!_cancel) {
          const u = urls[done++];
          if (u === undefined) break;
          try { await GMTCache.cacheImage(u); report.images++; }
          catch (_) { report.imagesFailed++; }
          const pct = 30 + (Math.min(done, urls.length) / Math.max(urls.length, 1)) * 68;
          if (done % 3 === 0 || done >= urls.length)
            setStep('الصور: ' + Math.min(done, urls.length) + ' / ' + urls.length, pct);
        }
      }));

      setStep('اكتمل التجهيز', 100);
      if (!_cancel) { try { localStorage.setItem(KEY_DONE, new Date().toISOString()); } catch (_) {} }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      report.errors.push(e.message);
      console.error('[Warmup]', e);
    } finally {
      _running = false;
      close();
    }

    /* لا نجاح صامت ولا فشل صامت — التقرير يُعرض دائماً */
    const msg = _cancel
      ? '⏭️ أُلغي التجهيز — سيُعاد عرضه لاحقاً'
      : '✅ جاهز للعمل بلا إنترنت: ' + report.products + ' منتج · ' + report.images + ' صورة'
        + (report.imagesFailed ? ' (تعذّر ' + report.imagesFailed + ')' : '');
    try {
      if (typeof showToast === 'function') showToast(msg, report.errors.length ? 'err' : 'ok');
      else if (typeof toast === 'function') toast(msg, report.errors.length ? 'err' : 'ok');
    } catch (_) {}
    if (report.errors.length) console.warn('[Warmup] أخطاء:', report.errors);
    global.__gmtWarmupReport = report;
    return report;
  }

  function done() { try { return localStorage.getItem(KEY_DONE); } catch (_) { return null; } }
  function reset() { try { localStorage.removeItem(KEY_DONE); } catch (_) {} }

  global.GMTWarmup = {
    run,                                   // تشغيل يدوي
    status: () => ({ done: done(), running: _running, report: global.__gmtWarmupReport }),
    reset,                                 // لإعادة التجهيز من الصفر
    isDone: () => !!done()
  };

  /* تشغيل تلقائي **مرّة واحدة** بعد استقرار الصفحة، وبوجود اتصال فقط */
  function auto() {
    try {
      if (done()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!global.GMTCache) return;
      setTimeout(() => { if (!done() && !_running) run(); }, 2500);
    } catch (_) {}
  }
  if (document.readyState !== 'loading') auto();
  else document.addEventListener('DOMContentLoaded', auto);
})(window);
