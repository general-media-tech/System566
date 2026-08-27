-- ═══════════════════════════════════════════════════════════════════════════
-- 2️⃣2️⃣  حماية الكوبونات + تتبّع النقل
-- أُنشئ 2026-08-24
-- ─────────────────────────────────────────────────────────────────────────
-- ① قيد فريد على كود الكوبون — دفاع على مستوى القاعدة
--    الثغرة: كان بالإمكان إنشاء كوبونين بالكود نفسه. الختم الذرّي يختم واحداً
--    ويبقى الآخر صالحاً ⇒ **يُطبَّق الخصم مرّتين على فاتورتين**.
--    فحص الواجهة وحده لا يكفي (سباق بين جهازين) — القيد في القاعدة هو الضمان.
--
-- ② حقول تتبّع النقل الناقصة (sent_at · reopened_by · cancelled_by)
--
-- 🛡️ آمن لإعادة التشغيل. شغّله بعد الملفات السابقة.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ ① الكوبونات ═══

-- استعرض التكرارات القائمة قبل فرض القيد (لن ينجح القيد إن وُجدت)
select code, count(*) as "عدد", string_agg(id::text, ' | ') as "المعرّفات"
from gmt_coupons
group by code
having count(*) > 1;

-- ⚠️ إن ظهرت نتائج أعلاه: احذف المكرّر يدوياً (أبقِ الأقدم) ثم أعد التشغيل.
-- مثال:  delete from gmt_coupons where id = '<المعرّف الأحدث>';

do $$ begin
  alter table gmt_coupons add constraint gmt_coupons_code_unique unique (code);
exception
  when duplicate_table then null;      -- القيد موجود مسبقاً
  when duplicate_object then null;
  when unique_violation then
    raise notice '⚠️ يوجد كوبونات مكرّرة — نظّفها أولاً ثم أعد تشغيل هذا الملف';
end $$;

create index if not exists idx_coupons_code   on gmt_coupons (code);
create index if not exists idx_coupons_unused on gmt_coupons (is_used) where is_used = false;


-- ═══ ② تتبّع فاتورة النقل ═══
alter table if exists branch_stock_transfers add column if not exists sent_at       timestamptz;
alter table if exists branch_stock_transfers add column if not exists reopened_by   text;
alter table if exists branch_stock_transfers add column if not exists reopened_at   timestamptz;
alter table if exists branch_stock_transfers add column if not exists cancelled_by  text;
alter table if exists branch_stock_transfers add column if not exists cancelled_at  timestamptz;


-- ═══ ✔️ التحقّق ═══

-- لا كوبونات مكرّرة (يجب أن يعيد صفر صفوف)
select code, count(*) from gmt_coupons group by code having count(*) > 1;

-- سجلّ حركة فواتير النقل (يتطلّب SQL ‏1️⃣7️⃣)
select at, actor, action, entity_name, reason
from gmt_audit
where entity = 'branch_stock_transfers'
order by at desc
limit 30;
