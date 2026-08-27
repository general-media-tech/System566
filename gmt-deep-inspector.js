/* ═══════════════════════════════════════════════════════════════════════════
   🔬 GMT Deep Inspector — الفاحص العميق الذاتي
   الإصدار: 2026-08-18

   الفكرة (بطلب المالك): لا يكتفي بفحص «هل الزر موجود؟» بل **ينفّذ العمليات فعلياً**:
   يعرّف منتجاً · يعدّل سعره · يغيّر العملة · ينشئ فاتورة · يصدّر/يستورد · يرحّل ·
   يحذف · ثم **يقرأ من القاعدة** ليتأكّد ممّا جرى حقاً — ويسجّل النتيجة في القاعدة
   وفي الصفحة، ويربط كل فشل بنمط الخطأ المعروف (P1..P6).

   🛡️ الأمان (غير قابل للتفاوض):
     • كل ما يُنشئه يحمل الوسم __GMT_TEST__ وباركود يبدأ بـ TEST- ⇒ لا يختلط ببياناتك.
     • لا يلمس أي سجل لا يحمل الوسم. أبداً.
     • ينظّف نفسه في النهاية (ويُبقي التقرير).
     • الوضع الافتراضي «قراءة فقط»؛ الكتابة تتطلّب تأكيداً صريحاً من المالك.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const TAG      = '__GMT_TEST__';
  const BARPFX   = 'TEST-';
  const VERSION  = '2026-08-18';

  /* ── اكتشاف بيانات الاتصال من الصفحة المضيفة (كل صفحة تسمّيها بطريقتها) ── */
  function creds() {
    const url = global.SB || global.SUPABASE_URL || global.SUPA_URL || null;
    const key = global.KEY || global.SUPABASE_KEY || global.SUPABASE_ANON_KEY || null;
    return { url, key };
  }
  function ready() { const c = creds(); return !!(c.url && c.key); }

  async function api(method, path, body, extra) {
    const { url, key } = creds();
    if (!url || !key) throw new Error('لا توجد بيانات اتصال بالقاعدة في هذه الصفحة');
    const res = await fetch(url + '/rest/v1/' + path, {
      method,
      headers: Object.assign({
        apikey: key, Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      }, extra || {}),
      body: body ? JSON.stringify(body) : null
    });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
    if (!res.ok) { const e = new Error((data && data.message) || ('HTTP ' + res.status)); e.status = res.status; e.body = data; throw e; }
    return data;
  }

  /* ── الأنماط المعروفة (تُربط بها كل نتيجة فشل) ── */
  const PATTERNS = {
    P1: 'عمود/جدول ناقص في القاعدة (400 يُبتلع بصمت)',
    P2: 'افتراض موقعي متحجّر (عمود/صف/إزاحة ثابتة)',
    P3: 'الدهس بعد التنقيح (Object.assign يدهس التعديل)',
    P4: 'الإكمال رغم فشل خطوة فرعية (يحفظ قيمة فارغة)',
    P5: 'كود مكرّر عبر الصفحات (يُصلَح هنا ويبقى هناك)',
    P6: 'حارس مكتوب لكنه غير مُنادى (كود ميت)'
  };

  /* ── سجل النتائج ── */
  let LOG = [];
  const now = () => new Date().toISOString();
  function rec(o) {
    const row = Object.assign({ at: now() }, o);
    LOG.push(row);
    const ic = row.ok === true ? '✅' : row.ok === false ? '❌' : row.ok === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${ic} [${row.area}] ${row.step}` + (row.detail ? ' — ' + row.detail : ''));
    if (typeof global.__gmtInspectorTick === 'function') { try { global.__gmtInspectorTick(row); } catch (_) {} }
    return row;
  }

  /* ── مساعدات ── */
  async function branchKeys() {
    const base = ['germany','china','haleb','homs','daraa','kurani','sarmada','fakhouri','hny_sbyl'];
    try {
      const rows = await api('GET', 'inv_columns?select=key_name');
      const dyn = (rows || []).map(r => r.key_name).filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k || ''));
      return [...new Set([...base, ...dyn])];
    } catch (_) { return base; }
  }
  const testBarcode = () => BARPFX + Date.now() + '-' + Math.floor(Math.random() * 1000);

  /* ═══════════════ الفحوصات ═══════════════ */
  const SUITES = {

    /* ①  المخطط — هل الأعمدة التي يكتبها الكود موجودة فعلاً؟ [P1] */
    async schema() {
      const area = 'المخطط';
      const need = {
        products: ['name','barcode','price','wholesale_price','cost_price','net_cost','count','in_transit','min_stock','image_url','created_at'],
        import_log: ['inv_number','supplier','status','items_snapshot','transfer_moved','transferred','transferred_at','transferred_by','source_branch','dest_branch','total_amount','items_count','total_qty','currency'],
        stock_receipts: ['import_id','product_id','branch_key','qty','kind','note','created_by']
      };
      need.products = need.products.concat(await branchKeys());
      let bad = 0;
      for (const [tbl, cols] of Object.entries(need)) {
        const missing = [];
        for (const c of cols) {
          try { await api('GET', `${tbl}?select=${encodeURIComponent(c)}&limit=1`); }
          catch (e) { if (/does not exist|column|schema cache/i.test(e.message || '')) missing.push(c); }
        }
        if (missing.length) { bad++; rec({ area, step: `أعمدة ${tbl}`, ok: false, pattern: 'P1', detail: 'ناقص: ' + missing.join(', '), fix: `alter table ${tbl} add column if not exists …` }); }
        else rec({ area, step: `أعمدة ${tbl}`, ok: true, detail: cols.length + ' عمود موجود' });
      }
      return bad === 0;
    },

    /* ②  دورة حياة المنتج كاملة: إنشاء ← قراءة ← تعديل سعر ← حذف ← تأكيد الحذف */
    async productLifecycle(write) {
      const area = 'المنتجات';
      if (!write) { rec({ area, step: 'دورة حياة المنتج', ok: null, detail: 'تخطّي — وضع القراءة فقط' }); return true; }
      const bc = testBarcode();
      let id = null, allOk = true;
      try {
        const np = { name: TAG + ' منتج فحص', barcode: bc, price: 100, wholesale_price: 80, net_cost: 60, cost_price: 55 };
        (await branchKeys()).forEach(k => { np[k] = 0; });
        const created = await api('POST', 'products', np);
        id = (Array.isArray(created) ? created[0] : created)?.id;
        rec({ area, step: 'إنشاء منتج', ok: !!id, detail: id ? 'id=' + id : 'لم يُرجَع id' });
        if (!id) return false;

        const back = await api('GET', `products?id=eq.${id}&select=id,name,barcode,price,net_cost`);
        const p = (back || [])[0];
        const okRead = p && p.barcode === bc && Number(p.price) === 100;
        rec({ area, step: 'قراءة ما كُتب', ok: !!okRead, pattern: okRead ? null : 'P1',
              detail: okRead ? 'القيم مطابقة' : 'القيم غير مطابقة: ' + JSON.stringify(p || {}) });
        allOk = allOk && !!okRead;

        await api('PATCH', `products?id=eq.${id}`, { price: 175.5 }, { Prefer: 'return=minimal' });
        const after = ((await api('GET', `products?id=eq.${id}&select=price`)) || [])[0];
        const okUpd = after && Math.abs(Number(after.price) - 175.5) < 0.001;
        rec({ area, step: 'تعديل السعر ويُحفظ', ok: !!okUpd, pattern: okUpd ? null : 'P1',
              detail: okUpd ? '100 ⇐ 175.5' : 'السعر لم يتغيّر: ' + JSON.stringify(after || {}) });
        allOk = allOk && !!okUpd;

        // [P4] فحص عدم مسح الصورة: ضع صورة ثم عدّل حقلاً آخر
        await api('PATCH', `products?id=eq.${id}`, { image_url: 'https://example.com/t.png' }, { Prefer: 'return=minimal' });
        await api('PATCH', `products?id=eq.${id}`, { name: TAG + ' منتج فحص 2' }, { Prefer: 'return=minimal' });
        const img = ((await api('GET', `products?id=eq.${id}&select=image_url`)) || [])[0];
        const okImg = img && img.image_url;
        rec({ area, step: 'الصورة تبقى بعد تعديل حقل آخر', ok: !!okImg, pattern: okImg ? null : 'P4',
              detail: okImg ? 'محفوظة' : '⚠️ الصورة مُسِحت — نمط P4' });
        allOk = allOk && !!okImg;
      } catch (e) {
        rec({ area, step: 'دورة حياة المنتج', ok: false, pattern: 'P1', detail: e.message });
        allOk = false;
      } finally {
        if (id) {
          try {
            await api('DELETE', `products?id=eq.${id}`, null, { Prefer: 'return=minimal' });
            const gone = await api('GET', `products?id=eq.${id}&select=id`);
            const okDel = !gone || !gone.length;
            rec({ area, step: 'الحذف يُثبَّت في القاعدة', ok: okDel, pattern: okDel ? null : 'P3',
                  detail: okDel ? 'اختفى فعلياً' : '⚠️ ما زال موجوداً بعد الحذف' });
            allOk = allOk && okDel;
          } catch (e) { rec({ area, step: 'تنظيف المنتج', ok: 'warn', detail: e.message }); }
        }
      }
      return allOk;
    },

    /* ③  دورة الفاتورة: إنشاء ← تعديل حالة (جذر المضاعفة) ← سجل الاستلام ← حذف */
    async invoiceLifecycle(write) {
      const area = 'الفواتير';
      if (!write) { rec({ area, step: 'دورة الفاتورة', ok: null, detail: 'تخطّي — وضع القراءة فقط' }); return true; }
      let invId = null, allOk = true;
      const no = TAG + '-INV-' + Date.now();
      try {
        const snap = [{ id: null, name: TAG + ' بند', barcode: testBarcode(), qty: 3, unit_price: 10, sale_price: 20 }];
        /* 🔧 (2026-08-23) كان الفاحص لا يرسل inv_type وهو NOT NULL في القاعدة ⇒
           «null value in column inv_type violates not-null constraint» فيفشل فحص
           دورة الفاتورة كاملاً. أُضيف بقيمة صالحة مطابقة لما يرسله كود المشتريات. */
        const body = { inv_number: no, supplier: TAG, status: 'transit', inv_type: 'germany', items_snapshot: snap,
                       items_count: 1, total_qty: 3, total_amount: 30, currency: 'USD',
                       source_branch: 'germany', dest_branch: 'haleb' };
        const created = await api('POST', 'import_log', body);
        invId = (Array.isArray(created) ? created[0] : created)?.id;
        rec({ area, step: 'إنشاء فاتورة (كل الأعمدة)', ok: !!invId, pattern: invId ? null : 'P1',
              detail: invId ? 'id=' + invId : 'فشل — غالباً عمود ناقص' });
        if (!invId) return false;

        // 🔴 جذر المضاعفة: هل تُحفظ أعمدة حالة الترحيل؟
        await api('PATCH', `import_log?id=eq.${invId}`,
          { status: 'arrived', transferred: true, transferred_at: now(), transferred_by: 'inspector', transfer_moved: 1 },
          { Prefer: 'return=minimal' });
        const st = ((await api('GET', `import_log?id=eq.${invId}&select=status,transferred,transferred_at`)) || [])[0];
        const okSt = st && st.status === 'arrived' && st.transferred === true;
        rec({ area, step: '🔴 تحديث حالة الترحيل يُحفظ (جذر المضاعفة)', ok: !!okSt, pattern: okSt ? null : 'P1',
              detail: okSt ? 'الحالة ثابتة ⇒ لن تتكرّر' : 'لم تُحفظ ⇒ ستُرحَّل ثانيةً وتتضاعف الكمية!' });
        allOk = allOk && !!okSt;

        // سجل الاستلام — الحماية الثانية
        try {
          const r = await api('POST', 'stock_receipts',
            { import_id: invId, product_id: null, branch_key: 'haleb', qty: 3, kind: 'transfer_arrive', note: TAG, created_by: 'inspector' });
          const rid = (Array.isArray(r) ? r[0] : r)?.id;
          rec({ area, step: 'سجل الاستلام يقبل الكتابة', ok: !!rid, pattern: rid ? null : 'P1',
                detail: rid ? 'مكتوب' : 'فشل — تحقّق من note/created_by' });
          if (rid) await api('DELETE', `stock_receipts?id=eq.${rid}`, null, { Prefer: 'return=minimal' });
          allOk = allOk && !!rid;
        } catch (e) {
          rec({ area, step: 'سجل الاستلام يقبل الكتابة', ok: false, pattern: 'P1', detail: e.message });
          allOk = false;
        }

        // تعديل العملة
        await api('PATCH', `import_log?id=eq.${invId}`, { currency: 'EUR' }, { Prefer: 'return=minimal' });
        const cur = ((await api('GET', `import_log?id=eq.${invId}&select=currency`)) || [])[0];
        const okCur = cur && cur.currency === 'EUR';
        rec({ area, step: 'تغيير العملة يُحفظ', ok: !!okCur, pattern: okCur ? null : 'P1',
              detail: okCur ? 'USD ⇐ EUR' : 'لم تتغيّر' });
        allOk = allOk && !!okCur;

        // حذف بند من items_snapshot [P3]
        await api('PATCH', `import_log?id=eq.${invId}`, { items_snapshot: [], items_count: 0 }, { Prefer: 'return=minimal' });
        const sn = ((await api('GET', `import_log?id=eq.${invId}&select=items_snapshot`)) || [])[0];
        const okSnap = sn && Array.isArray(sn.items_snapshot) && sn.items_snapshot.length === 0;
        rec({ area, step: 'حذف بند من الفاتورة يُثبَّت', ok: !!okSnap, pattern: okSnap ? null : 'P3',
              detail: okSnap ? 'القائمة فرغت فعلياً' : '⚠️ البند عاد — نمط P3 (الدهس)' });
        allOk = allOk && !!okSnap;
      } catch (e) {
        rec({ area, step: 'دورة الفاتورة', ok: false, pattern: 'P1', detail: e.message });
        allOk = false;
      } finally {
        if (invId) { try { await api('DELETE', `import_log?id=eq.${invId}`, null, { Prefer: 'return=minimal' }); } catch (_) {} }
      }
      return allOk;
    },

    /* ④  الحُرّاس — مكتوبة **ومُنادَاة**؟ [P6] */
    async guards() {
      const area = 'الحُرّاس';
      const G = global.GMTIntegrity;
      if (!G) { rec({ area, step: 'GMTIntegrity محمّل', ok: false, pattern: 'P6', detail: 'غير موجود في هذه الصفحة' }); return false; }
      let ok = true;
      ['guardDelete','guardTransfer','guardDuplicateInvoice'].forEach(fn => {
        const has = typeof G[fn] === 'function';
        if (!has) ok = false;
        rec({ area, step: 'الحارس ' + fn + ' معرّف', ok: has, pattern: has ? null : 'P6' });
      });
      // هل الحارس مُنادى في هذه الصفحة؟ (فحص نصّي على الصفحة نفسها)
      /* 🔧 (2026-08-23) كان يُنذر في **كل** صفحة، فتظهر ثلاثة تحذيرات P6 على الصفحة
         الرئيسية رغم أنها لا تُرحّل ولا تحذف — إنذار كاذب يُفقد التقرير مصداقيته.
         الآن: لكل حارس صفحاته المعنيّة؛ خارجها لا يُذكر أصلاً. */
      try {
        const src  = document.documentElement.innerHTML;
        const here = (location.pathname.split('/').pop() || '').toLowerCase();
        const OWNER = {
          guardTransfer:         { pages: ['purchase.html'],   label: 'الترحيل' },
          guardDelete:           { pages: ['inventory.html'],  label: 'الحذف' },
          guardDuplicateInvoice: { pages: ['purchase.html'],   label: 'تكرار الفاتورة' }
        };
        Object.entries(OWNER).forEach(([fn, cfg]) => {
          const mine   = cfg.pages.some(p => here.endsWith(p));
          const called = new RegExp('GMTIntegrity\\s*\\.\\s*' + fn + '\\s*\\(').test(src);
          if (!mine) {
            if (called) rec({ area, step: `حارس ${cfg.label} مُنادى هنا أيضاً`, ok: true });
            return;   // ليست صفحته ⇒ لا إنذار
          }
          rec({ area, step: `حارس ${cfg.label} مُنادى في صفحته`, ok: called, pattern: called ? null : 'P6',
                detail: called ? 'موصول ✓' : '🔴 مكتوب وغير مُنادى — الميزة معطّلة فعلياً' });
          if (!called) ok = false;
        });
      } catch (_) {}
      return ok;
    },

    /* ⑤  الأزرار — كل onclick يشير إلى دالة موجودة فعلاً */
    async buttons() {
      const area = 'الأزرار';
      const BUILTIN = new Set(['if','for','while','return','function','switch','catch','typeof','new','this','alert','confirm','parseInt','parseFloat','setTimeout','event']);
      const found = new Map(); let broken = 0;
      document.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit]').forEach(el => {
        ['onclick','onchange','oninput','onsubmit'].forEach(a => {
          const v = el.getAttribute(a); if (!v) return;
          (v.match(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach(m => {
            const fn = m.replace(/\s*\($/, '');
            if (!BUILTIN.has(fn)) found.set(fn, (found.get(fn) || 0) + 1);
          });
        });
      });
      found.forEach((n, fn) => {
        if (typeof global[fn] !== 'function') {
          broken++;
          rec({ area, step: 'زر يستدعي دالة غير موجودة: ' + fn + '()', ok: false, pattern: 'P6', detail: n + ' موضع' });
        }
      });
      /* 🔧 (2026-08-23) كان التقرير يقول «0 دالة مرتبطة» في صفحات تستعمل
         addEventListener بدل onclick (كالصفحة الرئيسية) فيبدو وكأن لا أزرار فيها.
         الآن نعدّ الأزرار الفعلية في DOM أيضاً ونذكر الأسلوب المستعمل. */
      const domBtns = document.querySelectorAll('button, a[href], [role="button"]').length;
      rec({ area, step: 'فحص الأزرار', ok: broken === 0,
            detail: `${domBtns} عنصر تفاعلي · ${found.size} عبر onclick · ${broken} مكسورة` +
                    (found.size === 0 && domBtns > 0 ? ' (الصفحة تربط أحداثها بـaddEventListener — استعمل clickAll() لفحصها حيّاً)' : '') });
      return broken === 0;
    },

    /* ⑥  سلامة البيانات — يتائم ومكرّرات (قراءة فقط) */
    async dataIntegrity() {
      const area = 'سلامة البيانات';
      let ok = true;
      try {
        const prods = await api('GET', 'products?select=id,name,barcode&limit=1000');
        const seen = new Map(); const dup = [];
        (prods || []).forEach(p => {
          const b = String(p.barcode || '').trim().toLowerCase();
          if (!b) return;
          if (seen.has(b)) dup.push(p.name); else seen.set(b, p.id);
        });
        rec({ area, step: 'باركودات مكرّرة', ok: dup.length === 0 ? true : 'warn',
              detail: dup.length ? dup.slice(0, 5).join(' · ') + (dup.length > 5 ? ` …و${dup.length - 5}` : '') : 'لا تكرار في أول 1000' });
        if (dup.length) ok = false;

        const invs = await api('GET', 'import_log?select=inv_number,status,transferred&limit=500');
        const risky = (invs || []).filter(i => i.status === 'arrived' && i.transferred !== true);
        rec({ area, step: 'فواتير «واصلة» بلا ختم ترحيل (خطر مضاعفة)', ok: risky.length === 0 ? true : false,
              pattern: risky.length ? 'P1' : null,
              detail: risky.length ? risky.slice(0, 5).map(r => r.inv_number).join(' · ') : 'لا شيء' });
        if (risky.length) ok = false;
      } catch (e) { rec({ area, step: 'سلامة البيانات', ok: 'warn', detail: e.message }); }
      return ok;
    },

    /* ⑦  بقايا الفحوصات السابقة */
    /* ⑧ مخطّط نقطة البيع — الجداول العشرون التي تعتمد عليها [P1] */
    async posSchema() {
      const area = 'مخطّط نقطة البيع';
      const need = {
        invoices: ['inv_number','branch_key','total','discount','paid','payment_method','user_name','created_at'],
        invoice_items: ['invoice_id','product_id','qty','price','name'],
        invoice_commissions: ['invoice_id','branch_key','amount','paid','created_by'],
        gmt_coupons: ['code','amount','is_used','used_at','expires_at','min_purchase'],
        gmt_offers: ['title','is_active'],
        gmt_customers: ['name','phone'],
        gmt_users: ['username','role'],
        gmt_reservations: ['id']          // 🔴 يُتوقّع أن يكون مفقوداً — انظر B2
      };
      let bad = 0;
      for (const [tbl, cols] of Object.entries(need)) {
        try {
          await api('GET', `${tbl}?select=${encodeURIComponent(cols[0])}&limit=1`);
        } catch (e) {
          if (/does not exist|schema cache|relation/i.test(e.message || '')) {
            bad++;
            rec({ area, step: `الجدول ${tbl}`, ok: false, pattern: 'P1',
                  detail: 'غير موجود في القاعدة — كل استعلام عليه يفشل بصمت',
                  fix: `أنشئ الجدول ${tbl}` });
            continue;
          }
        }
        const missing = [];
        for (const c of cols) {
          try { await api('GET', `${tbl}?select=${encodeURIComponent(c)}&limit=1`); }
          catch (e) { if (/does not exist|column|schema cache/i.test(e.message || '')) missing.push(c); }
        }
        if (missing.length) {
          bad++;
          rec({ area, step: `أعمدة ${tbl}`, ok: false, pattern: 'P1', detail: 'ناقص: ' + missing.join(', ') });
        } else {
          rec({ area, step: `أعمدة ${tbl}`, ok: true, detail: cols.length + ' عمود موجود' });
        }
      }
      return bad === 0;
    },

    /* ⑨ دورة بيع كاملة — إنشاء فاتورة · بند · عمولة · كوبون · قراءة · حذف */
    async saleCycle(write) {
      const area = 'دورة البيع';
      if (!write) { rec({ area, step: 'دورة البيع الكاملة', ok: null, detail: 'تخطّي — وضع القراءة فقط' }); return true; }
      let invId = null, itemId = null, commId = null, coupId = null, allOk = true;
      const no = TAG + '-POS-' + Date.now();
      try {
        // ① فاتورة بيع
        const created = await api('POST', 'invoices', {
          inv_number: no, branch_key: 'haleb', total: 100, discount: 0,
          paid: true, payment_method: 'cash', user_name: TAG
        });
        invId = (Array.isArray(created) ? created[0] : created)?.id;
        rec({ area, step: 'إنشاء فاتورة بيع', ok: !!invId, pattern: invId ? null : 'P1',
              detail: invId ? 'id=' + invId : 'فشل — غالباً عمود ناقص أو NOT NULL' });
        if (!invId) return false;

        // ② بند
        try {
          const it = await api('POST', 'invoice_items', {
            invoice_id: invId, product_id: null, qty: 2, price: 50, name: TAG + ' بند بيع'
          });
          itemId = (Array.isArray(it) ? it[0] : it)?.id;
          rec({ area, step: 'إضافة بند للفاتورة', ok: !!itemId, pattern: itemId ? null : 'P1' });
          allOk = allOk && !!itemId;
        } catch (e) { rec({ area, step: 'إضافة بند للفاتورة', ok: false, pattern: 'P1', detail: e.message }); allOk = false; }

        // ③ التحقّق من الربط (يقرأ ما كُتب فعلاً)
        const back = await api('GET', `invoice_items?invoice_id=eq.${invId}&select=id,qty,price`);
        const okLink = Array.isArray(back) && back.length > 0 && Number(back[0].qty) === 2;
        rec({ area, step: 'البند مرتبط بالفاتورة فعلياً', ok: okLink, pattern: okLink ? null : 'P1',
              detail: okLink ? 'قُرئ من القاعدة' : 'لم يُقرأ — الربط غير محفوظ' });
        allOk = allOk && okLink;

        // ④ عمولة
        try {
          const cm = await api('POST', 'invoice_commissions', {
            invoice_id: invId, branch_key: 'haleb', amount: 5, paid: false, created_by: TAG
          });
          commId = (Array.isArray(cm) ? cm[0] : cm)?.id;
          rec({ area, step: 'تسجيل عمولة', ok: !!commId, pattern: commId ? null : 'P1' });
          allOk = allOk && !!commId;
        } catch (e) { rec({ area, step: 'تسجيل عمولة', ok: false, pattern: 'P1', detail: e.message }); allOk = false; }

        // ⑤ كوبون: إنشاء ⇐ ختم ⇐ التأكّد أنه لا يُختَم مرّتين
        try {
          const code = 'TESTCP-' + Date.now();
          const cp = await api('POST', 'gmt_coupons', { code, amount: 10, is_used: false });
          coupId = (Array.isArray(cp) ? cp[0] : cp)?.id;
          if (coupId) {
            const first = await api('PATCH',
              `gmt_coupons?code=eq.${encodeURIComponent(code)}&or=(is_used.is.false,is_used.is.null)`,
              { is_used: true, used_at: new Date().toISOString() });
            const second = await api('PATCH',
              `gmt_coupons?code=eq.${encodeURIComponent(code)}&or=(is_used.is.false,is_used.is.null)`,
              { is_used: true, used_at: new Date().toISOString() });
            const okOnce = Array.isArray(first) && first.length === 1 &&
                           Array.isArray(second) && second.length === 0;
            rec({ area, step: '🎫 الكوبون يُختَم مرّة واحدة فقط', ok: okOnce, pattern: okOnce ? null : 'P1',
                  detail: okOnce ? 'الختم الذرّي يمنع الاستهلاك المزدوج ✓'
                                 : '⚠️ الكوبون قابل للختم مرّتين — خطر خصم مزدوج' });
            allOk = allOk && okOnce;
          }
        } catch (e) { rec({ area, step: '🎫 اختبار الكوبون', ok: false, pattern: 'P1', detail: e.message }); allOk = false; }
      } catch (e) {
        rec({ area, step: 'دورة البيع', ok: false, pattern: 'P1', detail: e.message });
        allOk = false;
      } finally {
        // تنظيف بالترتيب العكسي (الأبناء قبل الأب)
        for (const [tbl, id] of [['invoice_items', itemId], ['invoice_commissions', commId],
                                 ['gmt_coupons', coupId], ['invoices', invId]]) {
          if (!id) continue;
          try { await api('DELETE', `${tbl}?id=eq.${id}`, null, { Prefer: 'return=minimal' }); } catch (_) {}
        }
        if (invId) {
          try {
            const gone = await api('GET', `invoices?id=eq.${invId}&select=id`);
            const okDel = !gone || !gone.length;
            rec({ area, step: 'تنظيف فاتورة الفحص', ok: okDel,
                  detail: okDel ? 'حُذفت بالكامل' : '⚠️ بقيت — احذفها يدوياً: ' + no });
          } catch (_) {}
        }
      }
      return allOk;
    },

    /* ⑩ مخطّط النقل بين الفروع + كشف الفواتير المعلّقة (2026-08-23) */
    async transferSchema() {
      const area = 'النقل بين الفروع';
      const need = {
        branch_stock_transfers: ['transfer_number','from_branch','to_branch','status','created_by',
                                 'title','note','settled','settled_at','settlement_note'],
        stock_transfer_items:   ['transfer_id','product_id','product_name','qty','unit_cost',
                                 'sale_price','deduction_failed','failed_reason','requested_qty']
      };
      let bad = 0;
      for (const [tbl, cols] of Object.entries(need)) {
        try { await api('GET', `${tbl}?select=${encodeURIComponent(cols[0])}&limit=1`); }
        catch (e) {
          if (/does not exist|relation|schema cache/i.test(e.message || '')) {
            bad++; rec({ area, step: `الجدول ${tbl}`, ok: false, pattern: 'P1',
                         detail: 'غير موجود — كل عملية نقل تفشل بصمت' });
            continue;
          }
        }
        const missing = [];
        for (const c of cols) {
          try { await api('GET', `${tbl}?select=${encodeURIComponent(c)}&limit=1`); }
          catch (e) { if (/does not exist|column|schema cache/i.test(e.message || '')) missing.push(c); }
        }
        if (missing.length) {
          bad++;
          rec({ area, step: `أعمدة ${tbl}`, ok: false, pattern: 'P1',
                detail: 'ناقص: ' + missing.join(', '),
                fix: 'شغّل _SQL_2️⃣0️⃣_تسوية_النقل.sql' });
        } else rec({ area, step: `أعمدة ${tbl}`, ok: true, detail: cols.length + ' عمود موجود' });
      }

      /* 🔴 فواتير نقل ناقصة لم تُسوَّ — أخطر ما في هذا القسم:
         بضاعة خرجت من فرع ولم تدخل الآخر، أو لم تُخصم أصلاً. */
      try {
        const stuck = await api('GET',
          'branch_stock_transfers?status=eq.needs_settlement&settled=is.false&select=transfer_number,from_branch,to_branch,note&limit=50');
        const n = Array.isArray(stuck) ? stuck.length : 0;
        rec({ area, step: '🔴 فواتير نقل تحتاج تسوية', ok: n === 0, pattern: n ? 'P1' : null,
              detail: n ? stuck.slice(0,5).map(r=>r.transfer_number).join(' · ') + (n>5?` …و${n-5}`:'')
                        : 'لا شيء — كل النقل مكتمل' });
        if (n) bad++;
      } catch (_) {}

      /* بنود تعذّر خصمها */
      try {
        const failed = await api('GET',
          'stock_transfer_items?deduction_failed=is.true&select=product_name,requested_qty&limit=50');
        const n = Array.isArray(failed) ? failed.length : 0;
        rec({ area, step: 'بنود تعذّر خصمها', ok: n === 0, pattern: n ? 'P1' : null,
              detail: n ? failed.slice(0,5).map(r=>r.product_name).join(' · ') : 'لا شيء' });
      } catch (_) {}

      /* الدوال الذرّية — بدونها يصير الخصم غير آمن تحت التزامن */
      for (const fn of ['deduct_branch_stock','add_branch_stock']) {
        try {
          await api('POST', 'rpc/' + fn, { p_product_id: '00000000-0000-0000-0000-000000000000', p_branch_key: '__none__', p_qty: 0 });
          rec({ area, step: 'الدالة الذرّية ' + fn, ok: true, detail: 'موجودة' });
        } catch (e) {
          const miss = /function|does not exist|schema cache/i.test(e.message || '');
          rec({ area, step: 'الدالة الذرّية ' + fn, ok: !miss, pattern: miss ? 'P1' : null,
                detail: miss ? '🔴 غير معرّفة — شغّل _SQL/🔟 دوال المخزون' : 'موجودة (رفضت بيانات الفحص كما يجب)' });
          if (miss) bad++;
        }
      }
      return bad === 0;
    },

    /* ⑪ دورة نقل بين الفروع كاملة — إنشاء · خصم · إضافة · تحقّق من الكميات · تنظيف
       طلب المالك: «درّب البوتات تعمل تجارب: إنشاء ونقل والتحقّق من الكمية التي انتقلت».
       ينفّذ نقلاً حقيقياً على منتج فحص موسوم، ثم **يقرأ الأرقام من القاعدة** ليثبت:
       نقص المصدر بالضبط · زاد الوجهة بالضبط · المجموع محفوظ. */
    async transferCycle(write) {
      const area = 'دورة النقل';
      if (!write) { rec({ area, step: 'دورة النقل الكاملة', ok: null, detail: 'تخطّي — وضع القراءة فقط' }); return true; }
      let pid = null, trId = null, allOk = true;
      const FROM = 'haleb', TO = 'daraa', QTY = 3, START = 10;
      try {
        // ① منتج فحص برصيد معلوم في الفرع المُصدِّر
        const np = { name: TAG + ' منتج نقل', barcode: testBarcode(), price: 100, [FROM]: START, [TO]: 0 };
        const created = await api('POST', 'products', np);
        pid = (Array.isArray(created) ? created[0] : created)?.id;
        rec({ area, step: 'إنشاء منتج فحص برصيد ' + START, ok: !!pid, pattern: pid ? null : 'P1' });
        if (!pid) return false;

        // ② فاتورة نقل
        const th = await api('POST', 'branch_stock_transfers', {
          transfer_number: TAG + '-TRF-' + Date.now(),
          from_branch: FROM, to_branch: TO, status: 'pending', created_by: TAG
        });
        trId = (Array.isArray(th) ? th[0] : th)?.id;
        rec({ area, step: 'إنشاء فاتورة نقل', ok: !!trId, pattern: trId ? null : 'P1' });
        allOk = allOk && !!trId;

        if (trId) {
          await api('POST', 'stock_transfer_items', {
            transfer_id: trId, product_id: pid, product_name: np.name, qty: QTY, unit_cost: 0, sale_price: 100
          });
        }

        // ③ الخصم الذرّي من المصدر
        let deducted = false;
        try {
          const d = await api('POST', 'rpc/deduct_branch_stock', { p_product_id: pid, p_branch_key: FROM, p_qty: QTY });
          deducted = (d !== false);
        } catch (e) {
          rec({ area, step: 'الخصم الذرّي من المصدر', ok: false, pattern: 'P1', detail: e.message });
          allOk = false;
        }
        if (deducted) rec({ area, step: 'الخصم الذرّي من المصدر', ok: true, detail: QTY + ' قطعة' });

        // ④ الإضافة للوجهة
        try { await api('POST', 'rpc/add_branch_stock', { p_product_id: pid, p_branch_key: TO, p_qty: QTY }); }
        catch (e) { rec({ area, step: 'الإضافة للوجهة', ok: false, pattern: 'P1', detail: e.message }); allOk = false; }

        // ⑤ 🔴 التحقّق الحاسم: اقرأ الأرقام الحقيقية من القاعدة
        const after = ((await api('GET', `products?id=eq.${pid}&select=${FROM},${TO}`)) || [])[0] || {};
        const gotFrom = Number(after[FROM]) || 0;
        const gotTo   = Number(after[TO])   || 0;
        const okFrom  = gotFrom === START - QTY;
        const okTo    = gotTo === QTY;
        const okSum   = (gotFrom + gotTo) === START;

        rec({ area, step: `🔴 المصدر نقص ${QTY}`, ok: okFrom, pattern: okFrom ? null : 'P1',
              detail: okFrom ? `${START} ⇐ ${gotFrom} ✓` : `متوقّع ${START - QTY} ووُجد ${gotFrom}` });
        rec({ area, step: `🔴 الوجهة زادت ${QTY}`, ok: okTo, pattern: okTo ? null : 'P1',
              detail: okTo ? `0 ⇐ ${gotTo} ✓` : `متوقّع ${QTY} ووُجد ${gotTo}` });
        rec({ area, step: '🔴 المجموع محفوظ (لا ضياع ولا ازدواج)', ok: okSum, pattern: okSum ? null : 'P1',
              detail: okSum ? `${gotFrom} + ${gotTo} = ${START} ✓`
                            : `⚠️ ${gotFrom} + ${gotTo} = ${gotFrom + gotTo} بدل ${START}` });
        allOk = allOk && okFrom && okTo && okSum;

        // ⑥ الخصم لا يتجاوز الرصيد (حماية من السالب)
        try {
          const over = await api('POST', 'rpc/deduct_branch_stock', { p_product_id: pid, p_branch_key: FROM, p_qty: 9999 });
          const refused = (over === false);
          const chk = ((await api('GET', `products?id=eq.${pid}&select=${FROM}`)) || [])[0] || {};
          const stillOk = (Number(chk[FROM]) || 0) === START - QTY;
          rec({ area, step: '🛡️ يرفض الخصم فوق الرصيد', ok: refused || stillOk, pattern: (refused || stillOk) ? null : 'P1',
                detail: (refused || stillOk) ? 'الرصيد لم يتأثّر ✓' : '⚠️ سُمح بخصم يفوق الرصيد — خطر رصيد سالب' });
          allOk = allOk && (refused || stillOk);
        } catch (_) {
          rec({ area, step: '🛡️ يرفض الخصم فوق الرصيد', ok: true, detail: 'رُفض كما يجب ✓' });
        }
      } catch (e) {
        rec({ area, step: 'دورة النقل', ok: false, pattern: 'P1', detail: e.message });
        allOk = false;
      } finally {
        // تنظيف عكسي: البنود ثم الفاتورة ثم المنتج
        if (trId) {
          try { await api('DELETE', `stock_transfer_items?transfer_id=eq.${trId}`, null, { Prefer: 'return=minimal' }); } catch (_) {}
          try { await api('DELETE', `branch_stock_transfers?id=eq.${trId}`, null, { Prefer: 'return=minimal' }); } catch (_) {}
        }
        if (pid) {
          try {
            await api('DELETE', `products?id=eq.${pid}`, null, { Prefer: 'return=minimal' });
            const gone = await api('GET', `products?id=eq.${pid}&select=id`);
            rec({ area, step: 'تنظيف بيانات النقل', ok: !gone || !gone.length,
                  detail: (!gone || !gone.length) ? 'حُذفت بالكامل' : '⚠️ بقيت — احذفها يدوياً' });
          } catch (_) {}
        }
      }
      return allOk;
    },

    async leftovers(write) {
      const area = 'التنظيف';
      let n = 0;
      for (const [t, f] of [['products', 'barcode=like.' + BARPFX + '*'],
                            ['import_log', 'inv_number=like.*' + TAG + '*'],
                            ['invoices', 'inv_number=like.*' + TAG + '*'],
                            ['gmt_coupons', 'code=like.TESTCP-*']]) {
        try {
          const rows = await api('GET', `${t}?select=id&${f}&limit=200`);
          if (rows && rows.length) {
            n += rows.length;
            if (write) { for (const r of rows) { try { await api('DELETE', `${t}?id=eq.${r.id}`, null, { Prefer: 'return=minimal' }); } catch (_) {} } }
          }
        } catch (_) {}
      }
      rec({ area, step: 'بقايا بيانات الفحص', ok: n === 0 ? true : 'warn',
            detail: n === 0 ? 'نظيف' : (write ? 'حُذفت ' + n + ' سجلاً' : n + ' سجلاً — شغّل بوضع الكتابة للتنظيف') });
      return true;
    }
  };

  /* ═══════════════ المُشغّل ═══════════════ */
  async function run(opts) {
    opts = opts || {};
    const write = opts.write === true;
    LOG = [];
    rec({ area: 'بدء', step: `الفاحص العميق v${VERSION} — الوضع: ${write ? '✍️ كتابة حقيقية (بيانات موسومة)' : '👁️ قراءة فقط'}`, ok: null });
    if (!ready()) { rec({ area: 'بدء', step: 'الاتصال بالقاعدة', ok: false, detail: 'لا توجد مفاتيح في هذه الصفحة' }); return report(); }

    await SUITES.schema();
    await SUITES.guards();
    await SUITES.buttons();
    await SUITES.dataIntegrity();
    await SUITES.productLifecycle(write);
    await SUITES.invoiceLifecycle(write);
    /* 🔧 (2026-08-23) فحوص نقطة البيع — كان الفاحص يغطّي 3 جداول بينما تعتمد
       نقطة البيع على 20. أُضيف فحص مخطّطها ودورة بيع كاملة حقيقية. */
    await SUITES.posSchema();
    await SUITES.saleCycle(write);
    await SUITES.transferSchema();
    await SUITES.transferCycle(write);
    await SUITES.leftovers(write);

    return report();
  }

  function report() {
    const fail = LOG.filter(r => r.ok === false);
    const warn = LOG.filter(r => r.ok === 'warn');
    const pass = LOG.filter(r => r.ok === true);
    const byPattern = {};
    fail.forEach(r => { if (r.pattern) (byPattern[r.pattern] = byPattern[r.pattern] || []).push(r.step); });
    const out = { version: VERSION, at: now(), pass: pass.length, warn: warn.length, fail: fail.length, byPattern, log: LOG };
    console.log(`%c🔬 النتيجة: ✅ ${pass.length} · ⚠️ ${warn.length} · ❌ ${fail.length}`,
                'font-weight:bold;font-size:14px;color:' + (fail.length ? '#C00012' : '#16a34a'));
    Object.entries(byPattern).forEach(([p, steps]) =>
      console.log(`  【${p}】 ${PATTERNS[p] || ''} → ${steps.length} إخفاق`));
    global.__gmtLastReport = out;
    return out;
  }

  function toText(r) {
    r = r || global.__gmtLastReport; if (!r) return 'لا يوجد تقرير — شغّل الفحص أولاً.';
    const L = ['🔬 تقرير الفاحص العميق GMT', 'التاريخ: ' + new Date(r.at).toLocaleString('ar-SY'),
               `النتيجة: ✅ ${r.pass} · ⚠️ ${r.warn} · ❌ ${r.fail}`, ''];
    if (Object.keys(r.byPattern).length) {
      L.push('أنماط الإخفاق:');
      Object.entries(r.byPattern).forEach(([p, s]) => L.push(`  【${p}】 ${PATTERNS[p] || ''} (${s.length})`));
      L.push('');
    }
    r.log.forEach(x => L.push(`${x.ok === true ? '✅' : x.ok === false ? '❌' : x.ok === 'warn' ? '⚠️' : 'ℹ️'} [${x.area}] ${x.step}${x.detail ? ' — ' + x.detail : ''}${x.pattern ? ' «' + x.pattern + '»' : ''}`));
    return L.join('\n');
  }

  global.GMTDeepInspector = {
    version: VERSION, PATTERNS,
    scan: () => run({ write: false }),
    full: async function () {
      const go = confirm(
        '🔬 الفحص العميق الكامل\n\n' +
        'سيُنشئ الفاحص بيانات فحص حقيقية في القاعدة (منتج + فاتورة + سجل استلام)،\n' +
        'يقرأها ليتأكّد ممّا حدث فعلاً، ثم **يحذفها كلها**.\n\n' +
        'كل ما يُنشئه موسوم بـ ' + TAG + ' وباركود ' + BARPFX + '… ولا يلمس أي سجل آخر.\n\n' +
        'هل تريد المتابعة؟');
      if (!go) return null;
      return run({ write: true });
    },
    cleanup: () => SUITES.leftovers(true),
    report: () => global.__gmtLastReport,
    text: toText,
    copy: function () {
      const t = toText(); const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta); return t;
    }
  };

  console.log('%c🔬 GMTDeepInspector جاهز — GMTDeepInspector.scan() للقراءة، .full() للفحص الكامل',
              'color:#C00012;font-weight:bold');
})(window);

/* ═══════════════════════════════════════════════════════════════════════════
   🖱️ فاحص الأزرار الحيّ — يكبس كل زر ويرصد ما يحدث   (2026-08-22)

   سبب الإضافة (بلاغ المالك): «ليش في شغلات أنا عم أكتشفها وأنت ما عم تكتشفها؟»
   الجواب الصادق: فحصي كان **ثابتاً** (يقرأ الكود)، والمالك يفحص **حيّاً** (يكبس).
   أخطاء مثل: زر يعطي 404 · تجمّد الواجهة · رسالة «لا توجد فروع» · شريط فوق شريط
   لا تظهر إلا عند التشغيل الحقيقي. هذه الوحدة تسدّ الفجوة: تكبس الأزرار فعلياً
   وترصد الأخطاء والوعود المرفوضة وزمن الاستجابة والتنقّل إلى روابط مكسورة.

   🛡️ الأمان: تتخطّى تلقائياً أي زر يطابق قائمة الخطر (حذف · ترحيل · حفظ · إرسال…)
   وتمنع أي تنقّل فعلي، وتوقف الكبس عند أول تجمّد طويل.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const DANGER = /حذف|احذف|امسح|مسح|ترحيل|رحّل|رحل|وصلت|حفظ|احفظ|إرسال|ارسال|تأكيد|اعتماد|دفع|تسوية|سحب|استيراد|تصدير|إنشاء|أنشئ|delete|remove|save|submit|send|confirm/i;

  function label(el) {
    return (el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 60);
  }

  async function clickAll(opts) {
    opts = opts || {};
    const maxMs = opts.maxMs || 1200;
    const out = { clicked: [], skipped: [], errors: [], slow: [], nav: [] };

    /* اعترض الأخطاء أثناء الكبس */
    const errs = [];
    const onErr = (e) => errs.push('خطأ: ' + (e.message || e.error?.message || e));
    const onRej = (e) => errs.push('وعد مرفوض: ' + (e.reason?.message || e.reason));
    global.addEventListener('error', onErr);
    global.addEventListener('unhandledrejection', onRej);

    /* امنع أي تنقّل فعلي أثناء الفحص، وسجّل الوجهة */
    const guard = (ev) => {
      const a = ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        ev.preventDefault(); ev.stopPropagation();
        out.nav.push({ label: label(a), href });
      }
    };
    document.addEventListener('click', guard, true);

    const els = Array.from(document.querySelectorAll('button, a[href], [onclick], [role="button"]'));
    for (const el of els) {
      const nm = label(el);
      if (!nm) continue;
      if (DANGER.test(nm)) { out.skipped.push(nm); continue; }
      const cs = (() => { try { return getComputedStyle(el); } catch (_) { return null; } })();
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) { out.skipped.push(nm + ' (مخفي)'); continue; }
      const before = errs.length;
      const t0 = performance.now();
      try { el.click(); } catch (e) { errs.push('كبس ' + nm + ': ' + e.message); }
      await new Promise((r) => setTimeout(r, 40));
      const dt = Math.round(performance.now() - t0);
      out.clicked.push(nm);
      if (dt > maxMs) out.slow.push({ label: nm, ms: dt });
      if (errs.length > before) out.errors.push({ label: nm, errors: errs.slice(before) });
      /* أغلق أي نافذة انفتحت كي لا تحجب البقية */
      try {
        document.querySelectorAll('.modal-overlay,[id$="-ov"],[id$="-modal"]').forEach((m) => {
          if (m.style && m.style.display !== 'none') m.style.display = 'none';
          m.classList && m.classList.add('hidden');
        });
      } catch (_) {}
    }

    document.removeEventListener('click', guard, true);
    global.removeEventListener('error', onErr);
    global.removeEventListener('unhandledrejection', onRej);

    /* روابط تنقّل مكسورة: افحص وجودها فعلياً */
    for (const n of out.nav) {
      const url = n.href.split('#')[0].split('?')[0];
      if (!url || /^https?:/i.test(url)) continue;
      try {
        const r = await fetch(url, { method: 'GET', cache: 'no-store' });
        n.status = r.status;
        if (!r.ok) out.errors.push({ label: n.label, errors: ['رابط مكسور (' + r.status + '): ' + url] });
      } catch (e) { n.status = 0; out.errors.push({ label: n.label, errors: ['تعذّر الوصول: ' + url] }); }
    }

    console.log(`%c🖱️ فحص الأزرار: كُبس ${out.clicked.length} · تُخطّي ${out.skipped.length} · أخطاء ${out.errors.length} · بطيء ${out.slow.length}`,
                'font-weight:bold;color:' + (out.errors.length ? '#C00012' : '#16a34a'));
    out.errors.forEach((e) => console.log('  ❌', e.label, '→', e.errors.join(' · ')));
    out.slow.forEach((s) => console.log('  🐢', s.label, s.ms + 'ms'));
    global.__gmtButtonReport = out;
    return out;
  }

  if (global.GMTDeepInspector) {
    global.GMTDeepInspector.clickAll = clickAll;
    global.GMTDeepInspector.buttonReport = () => global.__gmtButtonReport;
  } else {
    global.GMTDeepInspector = { clickAll, buttonReport: () => global.__gmtButtonReport };
  }
})(window);
