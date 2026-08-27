/* ═══════════════════════════════════════════════════════════════════════════
   📴 GMTSync — طابور الكتابة بلا إنترنت   (2026-08-22)

   الحاجة (بلاغ المالك): «فيني ضيف أوردر بلا إنترنت أو أسجّل شحن أو استلام،
   وبس يجي النت بيتحدّث».

   ما كان موجوداً: تخزين محلي **للقراءة** فقط (GMTCache/IndexedDB). أي كتابة
   أثناء الانقطاع كانت تفشل وتضيع.

   ما تفعله هذه الوحدة: تحتجز الكتابة في **طابور دائم** (IndexedDB مع احتياطي
   localStorage)، تُظهرها فوراً في الواجهة (تفاؤلياً) بمعرّف مؤقّت، ثم ترسلها
   تلقائياً حين يعود الاتصال — بالترتيب، مع إعادة محاولة متدرّجة، وربط المعرّف
   المؤقّت بالمعرّف الحقيقي القادم من القاعدة.

   ضمانات مقصودة:
   • **الترتيب محفوظ**: الطلبات تُرسل بترتيب إنشائها (إضافة قبل تعديلها).
   • **لا تكرار**: لكل عملية مفتاح فريد؛ الناجحة تُحذف فوراً من الطابور.
   • **لا ضياع صامت**: ما يفشل نهائياً يبقى في الطابور ويُعرض للمالك.
   • **لا كتابة مزدوجة**: المزامنة محميّة بقفل تشغيل واحد.

   الاستعمال:
     GMTSync.wrap({ table:'invoices', base:SUPA_URL, headers:SB_HEADERS })
     → يعيد { insert, update, remove } تعمل أونلاين وأوفلاين بنفس الطريقة.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const DB_NAME = 'gmt_sync_db', STORE = 'queue', LS_KEY = 'gmt_sync_queue';
  const MAX_TRIES = 8;
  let _db = null, _running = false;

  /* ── تخزين دائم: IndexedDB مع احتياطي localStorage ── */
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      r.onsuccess = () => { _db = r.result; res(_db); };
      r.onerror = () => rej(r.error);
    });
  }
  async function qAll() {
    try {
      const db = await openDB();
      return await new Promise((res) => {
        const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = () => res(rq.result || []);
        rq.onerror = () => res([]);
      });
    } catch (_) {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
    }
  }
  /* 🔧 سلسلة كتابة واحدة: بدونها كانت عمليتان متتاليتان تقرآن نفس النسخة القديمة
     من localStorage فتدهس الثانية الأولى ⇒ **ضياع صامت لعملية من الطابور**.
     (اكتُشف باختبار: insert ثم update ينتج عنصراً واحداً بدل اثنين.) */
  let _chain = Promise.resolve();
  function serial(fn) { const p = _chain.then(fn, fn); _chain = p.catch(() => {}); return p; }

  async function qPut(item) {
    return serial(async () => {
      try {
        const db = await openDB();
        await new Promise((res, rej) => {
          const rq = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
          rq.onsuccess = res; rq.onerror = () => rej(rq.error);
        });
      } catch (_) {
        let all = [];
        try { all = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { all = []; }
        const i = all.findIndex((x) => x.key === item.key);
        if (i >= 0) all[i] = item; else all.push(item);
        try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) {}
      }
    });
  }
  async function qDel(key) {
    return serial(async () => {
      try {
        const db = await openDB();
        await new Promise((res) => {
          const rq = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
          rq.onsuccess = res; rq.onerror = res;
        });
      } catch (_) {
        let all = [];
        try { all = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { all = []; }
        all = all.filter((x) => x.key !== key);
        try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) {}
      }
    });
  }

  const newKey = () => 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const tempId = () => 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const isTemp = (id) => typeof id === 'string' && id.startsWith('tmp_');

  /* خريطة: معرّف مؤقّت ⇐ معرّف حقيقي (تُحفظ ليصمد التعديل عبر جلسات) */
  function idMap() { try { return JSON.parse(localStorage.getItem('gmt_sync_idmap') || '{}'); } catch (_) { return {}; } }
  function mapId(tmp, real) {
    const m = idMap(); m[tmp] = real;
    try { localStorage.setItem('gmt_sync_idmap', JSON.stringify(m)); } catch (_) {}
  }
  const realId = (id) => idMap()[id] || id;

  function online() {
    /* 🔧 نقرأ navigator من الكائن العام الممرَّر لا من النطاق المعجمي: في بعض
       البيئات (وأثناء الاختبار) لا يكون navigator مرئياً معجمياً فيُقيَّم
       typeof navigator === 'undefined' ⇒ تُعتبر الحالة «متصل» دائماً فلا يعمل
       الطابور إطلاقاً. */
    const nav = (global && global.navigator) || (typeof navigator !== 'undefined' ? navigator : null);
    return !nav || nav.onLine !== false;
  }

  function emit(name, detail) {
    try { global.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  async function enqueue(op) {
    const item = Object.assign({ key: newKey(), at: Date.now(), tries: 0 }, op);
    await qPut(item);
    emit('gmt-sync-change', { pending: (await qAll()).length });
    if (online()) { try { await flush(); } catch (_) {} }   /* 🔧 انتظره: تركه معلّقاً كان يُبقي وعد flush قائماً فيُهمَل نداء «عاد الاتصال» */
    return item;
  }

  /* ── إرسال عملية واحدة ── */
  async function send(op) {
    const id = op.id != null ? realId(op.id) : null;
    if (op.method !== 'POST' && isTemp(id)) {
      // ما زال المعرّف الحقيقي غير معروف — أجّل حتى تُرسل عملية الإنشاء
      throw Object.assign(new Error('pending-parent'), { retry: true });
    }
    let url = op.base + '/rest/v1/' + op.table;
    if (op.method !== 'POST') url += '?id=eq.' + encodeURIComponent(id);
    const init = { method: op.method, headers: op.headers };
    if (op.method !== 'DELETE') init.body = JSON.stringify(op.body);
    if (op.method === 'DELETE') init.headers = Object.assign({}, op.headers, { Prefer: 'return=minimal' });
    const r = await fetch(url, init);
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      const err = new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120));
      // 4xx (عدا 408/429) = خطأ دائم: لا فائدة من إعادة المحاولة إلى ما لا نهاية
      err.permanent = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
      throw err;
    }
    if (op.method === 'POST' && op.tmpId) {
      try {
        const j = await r.json();
        const row = Array.isArray(j) ? j[0] : j;
        if (row && row.id != null) mapId(op.tmpId, row.id);
      } catch (_) {}
    }
    return true;
  }

  /* ── تفريغ الطابور: بالترتيب، مع قفل تشغيل واحد ── */
  let _flushing = null, _flushOnline = false;
  async function flush() {
    /* 🔧 مشاركة الوعد الجاري تمنع التفريغ المزدوج، **لكن** إن كان الوعد قد بدأ
       أثناء الانقطاع فهو محكوم بالفشل؛ إعادته لمن ينادي بعد عودة الاتصال تجعل
       المزامنة تبدو وكأنها «لم ترسل شيئاً» ويبقى الطابور معلّقاً حتى الدورة
       التالية. لذلك لا نُعيد استخدامه إلا إن بدأ ونحن متصلون. */
    const isOn = online();
    if (_flushing && _flushOnline === isOn) return _flushing;
    if (!isOn) return { sent: 0, failed: 0 };
    if (_flushing) { try { await _flushing; } catch (_) {} }
    _flushOnline = true;
    _flushing = (async () => {
      let sent = 0, failed = 0;
      try {
      /* نمرّ مرّات متعدّدة: بعد نجاح POST يصبح المعرّف الحقيقي معروفاً، فتنجح
         التعديلات التي كانت مؤجَّلة بـ pending-parent في الجولة التالية.
         (بدون هذا كان الطابور يتوقّف للأبد عند أول تعديل على عنصر مؤقّت.) */
      for (let round = 0; round < 5; round++) {
        const items = (await qAll()).filter((x) => !x.dead).sort((a, b) => a.at - b.at);
        if (!items.length) break;
        let progressed = false;
        for (const it of items) {
          try {
            await send(it);
            await qDel(it.key);
            sent++; progressed = true;
          } catch (e) {
            if (e.retry) continue;              // ينتظر إنشاء أصله — جرّب البقية
            /* 🔧 انقطاع الشبكة ليس فشلاً منطقياً: لا يُحتسب ضمن حدّ المحاولات،
               وإلا استُهلكت المحاولات الثماني أثناء انقطاع طويل فتُعتبر العملية
               «ميّتة» ولا تُرسل أبداً عند عودة الاتصال. */
            const netDown = /Failed to fetch|NetworkError|network|ERR_INTERNET|load failed/i.test(e.message || '');
            if (netDown) { await qPut(it); break; }
            it.tries = (it.tries || 0) + 1;
            it.lastError = e.message;
            if (e.permanent || it.tries >= MAX_TRIES) {
              it.dead = true;                   // يبقى محفوظاً وظاهراً — لا يُحذف بصمت
              await qPut(it); failed++; progressed = true;
            } else {
              await qPut(it);
              break;                            // تعثّر شبكي: أوقف الجولة وحافظ على الترتيب
            }
          }
        }
        if (!progressed) break;
      }
      } finally { /* لا شيء — القفل يُحرَّر أدناه */ }
      const pending = (await qAll()).filter((x) => !x.dead).length;
      emit('gmt-sync-change', { pending, sent, failed });
      if (sent) emit('gmt-sync-done', { sent });
      return { sent, failed };
    })();
    try { return await _flushing; } finally { _flushing = null; _flushOnline = false; }
  }

  /* ── الغلاف: يُستعمل بدل fetch المباشر ── */
  function wrap(cfg) {
    const base = cfg.base, table = cfg.table, headers = cfg.headers;
    return {
      async insert(data) {
        if (online()) {
          try {
            const r = await fetch(base + '/rest/v1/' + table, { method: 'POST', headers, body: JSON.stringify(data) });
            if (r.ok) return r.json();
            const t = await r.text().catch(() => '');
            if (r.status >= 400 && r.status < 500) throw new Error(t || ('HTTP ' + r.status));
          } catch (e) { if (online() && !/Failed to fetch|NetworkError/i.test(e.message)) throw e; }
        }
        const tmp = tempId();
        await enqueue({ method: 'POST', table, base, headers, body: data, tmpId: tmp });
        return [Object.assign({}, data, { id: tmp, _pendingSync: true })];
      },
      async update(id, data) {
        if (online()) {
          try {
            const r = await fetch(base + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(realId(id)),
              { method: 'PATCH', headers, body: JSON.stringify(data) });
            if (r.ok) return r.json();
            const t = await r.text().catch(() => '');
            if (r.status >= 400 && r.status < 500) throw new Error(t || ('HTTP ' + r.status));
          } catch (e) { if (online() && !/Failed to fetch|NetworkError/i.test(e.message)) throw e; }
        }
        await enqueue({ method: 'PATCH', table, base, headers, id, body: data });
        return [Object.assign({}, data, { id, _pendingSync: true })];
      },
      async remove(id) {
        if (online()) {
          try {
            const r = await fetch(base + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(realId(id)),
              { method: 'DELETE', headers: Object.assign({}, headers, { Prefer: 'return=minimal' }) });
            if (r.ok) return true;
            const t = await r.text().catch(() => '');
            if (r.status >= 400 && r.status < 500) throw new Error(t || ('HTTP ' + r.status));
          } catch (e) { if (online() && !/Failed to fetch|NetworkError/i.test(e.message)) throw e; }
        }
        await enqueue({ method: 'DELETE', table, base, headers, id });
        return true;
      }
    };
  }

  async function status() {
    const all = await qAll();
    return { pending: all.filter((x) => !x.dead).length, failed: all.filter((x) => x.dead).length, items: all };
  }
  async function retryFailed() {
    const all = await qAll();
    for (const it of all) if (it.dead) { it.dead = false; it.tries = 0; await qPut(it); }
    return flush();
  }
  async function clearFailed() {
    const all = await qAll();
    for (const it of all) if (it.dead) await qDel(it.key);
    emit('gmt-sync-change', { pending: (await qAll()).length });
  }

  global.GMTSync = { wrap, flush, status, retryFailed, clearFailed, isTemp, realId, online };

  /* مزامنة تلقائية عند عودة الاتصال، وعند العودة للتبويب، ودورياً */
  try {
    global.addEventListener('online', () => flush());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
    setInterval(() => { if (online()) flush(); }, 30000);
    if (document.readyState !== 'loading') setTimeout(flush, 1200);
    else document.addEventListener('DOMContentLoaded', () => setTimeout(flush, 1200));
  } catch (_) {}
})(window);

/* ═══════════════════════════════════════════════════════════════════════════
   🔔 مؤشّر المزامنة — شارة صغيرة تُظهر ما ينتظر الإرسال
   لماذا: العمل بلا إنترنت بلا مؤشّر يخلق قلقاً مشروعاً («هل ضاع ما سجّلته؟»).
   الشارة تظهر **فقط** عند وجود معلّقات أو فاشلات، وتختفي حين يفرغ الطابور.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  function el() {
    let b = document.getElementById('gmt-sync-badge');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'gmt-sync-badge';
    b.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9500;background:#0f172a;color:#fff;' +
      'padding:8px 14px;border-radius:999px;font-family:inherit;font-size:12.5px;font-weight:800;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:none;direction:rtl';
    b.onclick = async () => {
      const s = await global.GMTSync.status();
      if (!s.failed) { await global.GMTSync.flush(); return; }
      const lines = s.items.filter((x) => x.dead).slice(0, 5)
        .map((x) => '• ' + x.method + ' → ' + (x.lastError || 'سبب غير معروف')).join('\n');
      if (confirm('⚠️ ' + s.failed + ' عملية لم تُرسل:\n\n' + lines + '\n\nهل تريد إعادة المحاولة؟'))
        await global.GMTSync.retryFailed();
    };
    (document.body || document.documentElement).appendChild(b);
    return b;
  }
  async function paint() {
    try {
      if (!global.GMTSync) return;
      const s = await global.GMTSync.status();
      const b = el();
      if (!s.pending && !s.failed) { b.style.display = 'none'; return; }
      b.style.display = 'block';
      if (s.failed) { b.style.background = '#C00012'; b.textContent = '⚠️ ' + s.failed + ' لم تُرسل — اضغط للمراجعة'; }
      else if (!global.GMTSync.online()) { b.style.background = '#b45309'; b.textContent = '📴 ' + s.pending + ' بانتظار الإنترنت'; }
      else { b.style.background = '#0f172a'; b.textContent = '🔄 مزامنة ' + s.pending + '…'; }
    } catch (_) {}
  }
  try {
    global.addEventListener('gmt-sync-change', paint);
    global.addEventListener('online', paint);
    global.addEventListener('offline', paint);
    setInterval(paint, 5000);
    if (document.readyState !== 'loading') setTimeout(paint, 800);
    else document.addEventListener('DOMContentLoaded', () => setTimeout(paint, 800));
  } catch (_) {}
  global.GMTSyncBadge = { paint };
})(window);
