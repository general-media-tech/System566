-- ═══════════════════════════════════════════════════════════════════════════
-- 2️⃣0️⃣  أعمدة تسوية النقل بين الفروع
-- أُنشئ 2026-08-23
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (بلاغ المالك T8):
--   «في أشياء تعذّر خصمها أثناء النقل، أعطوني إشعار بس بقيت صامتة… لما يتكرّر
--    هيك شيء فيبقى عالق يحتاج تسوية، ما يبقى خطأ صامت — تمشي الفاتورة ويبقى
--    عندي هدول راحوا لهنيك.»
--
--   السبب المكتشَف في الكود: تحذير الإخفاق كان يُعرض ثم **تليه رسالة «✅ تم بنجاح»
--   فتطمسه**، وتُختم الفاتورة كأنها مكتملة فلا يبقى أثر يستدعي التسوية.
--
--   العلاج في الكود: وسم الفاتورة `status='needs_settlement'` + منع رسالة النجاح.
--   هذا الملف يضمن وجود الأعمدة اللازمة لذلك.
--
-- 🛡️ آمن لإعادة التشغيل · لا يمسّ أي بيانات قائمة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ① رأس فاتورة النقل
alter table if exists branch_stock_transfers add column if not exists title             text;   -- 🏷️ [T10] عنوان الفاتورة
alter table if exists branch_stock_transfers add column if not exists note              text;
alter table if exists branch_stock_transfers add column if not exists settled           boolean     default false;
alter table if exists branch_stock_transfers add column if not exists settled_at        timestamptz;
alter table if exists branch_stock_transfers add column if not exists settled_by        text;
alter table if exists branch_stock_transfers add column if not exists settlement_note   text;

-- ② بنود النقل — وسم البند الذي تعذّر خصمه
alter table if exists stock_transfer_items  add column if not exists deduction_failed  boolean     default false;
alter table if exists stock_transfer_items  add column if not exists failed_reason     text;
alter table if exists stock_transfer_items  add column if not exists requested_qty     numeric;

create index if not exists idx_bst_status  on branch_stock_transfers (status);
create index if not exists idx_bst_settled on branch_stock_transfers (settled);
create index if not exists idx_sti_failed  on stock_transfer_items   (deduction_failed);

-- ═══════════════════════════════════════════════════════════════════════════
-- ✔️ استعلامات المراجعة اليومية
-- ═══════════════════════════════════════════════════════════════════════════

-- ① فواتير نقل تحتاج تسوية (الأهم — راجعها أولاً بأول)
select transfer_number, from_branch_name, to_branch_name, status, note, created_at
from branch_stock_transfers
where status = 'needs_settlement' and coalesce(settled,false) = false
order by created_at desc;

-- ② البنود التي تعذّر خصمها فعلياً
select t.transfer_number, i.product_name, i.barcode, i.requested_qty, i.failed_reason
from stock_transfer_items i
join branch_stock_transfers t on t.id = i.transfer_id
where i.deduction_failed = true
order by t.created_at desc;

-- ③ بعد تسوية فاتورة يدوياً، اختمها:
-- update branch_stock_transfers
--   set settled = true, settled_at = now(), settled_by = 'اسمك', settlement_note = 'سبب التسوية'
-- where transfer_number = 'TRF-XXXX';
