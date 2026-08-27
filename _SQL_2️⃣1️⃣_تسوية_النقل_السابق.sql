-- ═══════════════════════════════════════════════════════════════════════════
-- 2️⃣1️⃣  تسوية فواتير النقل السابقة  ·  الأشياء التي لم تُخصم
-- أُنشئ 2026-08-23
-- ─────────────────────────────────────────────────────────────────────────
-- طلب المالك:
--   «خلي التصليح يشمل فواتير النقل السابقة — ينعمل تسوية للأشياء اللي ما انخصمت.»
--
-- الخلفية:
--   الكود القديم كان **يوسم** البند الفاشل (`deduction_failed=true` وتصفير الكمية)
--   لكن التحذير كان يُطمَس برسالة «✅ تم بنجاح» ولا يُترك أثر يستدعي التسوية.
--   ⇒ **البيانات موجودة في القاعدة** لكن لم يرها أحد. هذا الملف يستخرجها ويسوّيها.
--
-- 🛡️ آمن: الأقسام ①–③ **قراءة فقط**. القسم ④ يعدّل الحالة فقط ولا يمسّ أي كمية.
--          القسم ⑤ اختياري ويُنفَّذ يدوياً لكل بند بعد قرارك.
--          شغّل `_SQL_2️⃣0️⃣` أولاً (يضيف الأعمدة المطلوبة).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ ① الصورة الكاملة: كل فاتورة فيها بنود لم تُخصم ═══
select
  t.transfer_number                          as "رقم الفاتورة",
  t.from_branch_name                         as "من",
  t.to_branch_name                           as "إلى",
  t.status                                   as "الحالة",
  coalesce(t.settled,false)                  as "مُسوّاة",
  count(i.id)                                as "بنود لم تُخصم",
  string_agg(i.product_name, ' · ')          as "الأصناف",
  t.created_at::date                         as "التاريخ"
from branch_stock_transfers t
join stock_transfer_items   i on i.transfer_id = t.id
where i.deduction_failed = true
group by t.id, t.transfer_number, t.from_branch_name, t.to_branch_name,
         t.status, t.settled, t.created_at
order by t.created_at desc;


-- ═══ ② التفصيل: أي قطعة بالضبط لم تُخصم ومن أي فرع ═══
select
  t.transfer_number      as "رقم الفاتورة",
  t.from_branch          as "الفرع المُصدِّر",
  t.to_branch            as "الفرع المستقبِل",
  i.product_name         as "المنتج",
  i.barcode              as "الباركود",
  coalesce(i.requested_qty, i.qty, 0) as "الكمية المطلوبة",
  i.qty                  as "الكمية المسجّلة",
  i.failed_reason        as "السبب",
  t.created_at::date     as "التاريخ"
from stock_transfer_items i
join branch_stock_transfers t on t.id = i.transfer_id
where i.deduction_failed = true
order by t.created_at desc, i.product_name;


-- ═══ ③ فحص الاتّساق: فواتير «مستلَمة» رغم وجود بنود لم تُخصم ═══
--     هذه الأخطر: الفرع المستقبِل أكّد الاستلام وبضاعة لم تخرج أصلاً.
select
  t.transfer_number as "رقم الفاتورة",
  t.status          as "الحالة",
  count(i.id)       as "بنود لم تُخصم",
  string_agg(i.product_name, ' · ') as "الأصناف"
from branch_stock_transfers t
join stock_transfer_items   i on i.transfer_id = t.id
where i.deduction_failed = true
  and t.status in ('received','confirmed','completed')
group by t.id, t.transfer_number, t.status
order by count(i.id) desc;


-- ═══ ④ وسم الفواتير السابقة بأنها تحتاج تسوية (لا يمسّ أي كمية) ═══
--     بعد هذا تظهر تلقائياً في «الفاحص العميق» تحت: «🔴 فواتير نقل تحتاج تسوية»
update branch_stock_transfers t
set status = 'needs_settlement',
    note   = coalesce(t.note,'') ||
             case when coalesce(t.note,'') = '' then '' else ' | ' end ||
             'تسوية أثرية 2026-08-23: ' || sub.n || ' بند لم يُخصم (' || sub.names || ')'
from (
  select i.transfer_id, count(*) n, string_agg(i.product_name, '، ') names
  from stock_transfer_items i
  where i.deduction_failed = true
  group by i.transfer_id
) sub
where t.id = sub.transfer_id
  and coalesce(t.settled,false) = false
  and t.status is distinct from 'needs_settlement';

-- ✔️ تحقّق: كم فاتورة وُسمت الآن
select count(*) as "فواتير تحتاج تسوية"
from branch_stock_transfers
where status = 'needs_settlement' and coalesce(settled,false) = false;


-- ═══ ⑤ التسوية اليدوية — بعد قرارك لكل حالة ═══
-- ⚠️ لا تُنفَّذ جملةً واحدة. لكل بند لم يُخصم اختر أحد المسارين:

-- (أ) البضاعة **لم تُنقل فعلياً** (بقيت في الفرع المُصدِّر):
--     لا تعديل على المخزون — يكفي إغلاق الفاتورة بالسبب.
--
-- (ب) البضاعة **نُقلت فعلياً** ولم يُسجَّل الخصم:
--     اخصمها من المُصدِّر وأضفها للمستقبِل بالدوال الذرّية:
--
--     select deduct_branch_stock('<product_id>'::uuid, '<from_branch>', <qty>);
--     select add_branch_stock  ('<product_id>'::uuid, '<to_branch>',   <qty>);

-- ثم اختم الفاتورة (في الحالتين):
-- update branch_stock_transfers
--   set settled = true,
--       settled_at = now(),
--       settled_by = 'اسمك',
--       settlement_note = 'سبب التسوية وما تقرّر'
-- where transfer_number = 'TRF-XXXXXXXX';

-- وأزل وسم الفشل عن البنود التي عولجت:
-- update stock_transfer_items
--   set deduction_failed = false,
--       failed_reason = 'سُوّيت يدوياً 2026-08-23'
-- where transfer_id = (select id from branch_stock_transfers where transfer_number = 'TRF-XXXXXXXX');


-- ═══ ⑥ المتابعة اليومية ═══
select transfer_number as "رقم", from_branch_name as "من", to_branch_name as "إلى",
       note as "ما نقص", created_at::date as "التاريخ"
from branch_stock_transfers
where status = 'needs_settlement' and coalesce(settled,false) = false
order by created_at desc;
