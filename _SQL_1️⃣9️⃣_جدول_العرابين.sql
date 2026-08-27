-- ═══════════════════════════════════════════════════════════════════════════
-- 1️⃣9️⃣  جدول العرابين والحجوزات  ·  gmt_reservations
-- أُنشئ 2026-08-23
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة (كشفها فحص نقطة البيع):
--   `أدمن_نقاط_البيع.html` سطر 4504 يستعلم:
--       GET /rest/v1/gmt_reservations?select=*&limit=2000
--   والجدول **غير معرّف في أي ملف SQL** ⇒ كل استعلام يفشل بـ400 ويُبتلع
--   ⇒ **قائمة العرابين والمتبقّي تظهر فارغة دائماً بلا أي رسالة خطأ**. (نمط P1)
--
--   قُورنت 20 جدولاً تستعملها نقطة البيع وأدمنها مع كل ملفات _SQL/:
--   19 معرّف · 1 مفقود = هذا الجدول.
--
-- ⚠️ ملاحظة صريحة للمالك:
--   الكود يقرأ الجدول بـ`select=*` فقط ولا يكشف أسماء الحقول التي يتوقّعها،
--   لذلك **لم أخترع مخطّطاً مالياً من فراغ**. الحقول أدناه هي الحدّ الأدنى
--   المنطقي لعربون (زبون · مبلغ · متبقٍّ · حالة)، وكلها **قابلة للتعديل**.
--   إن كان لديك مخطّط مختلف فأخبرني لأضبطه — الجدول آمن للتعديل ما دام فارغاً.
--
-- 🛡️ آمن لإعادة التشغيل · لا يمسّ أي بيانات قائمة.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gmt_reservations (
  id             bigserial primary key,
  branch_key     text,                        -- الفرع الذي سُجّل فيه الحجز
  customer_name  text,                        -- اسم الزبون
  customer_phone text,                        -- هاتف الزبون
  product_id     uuid,                        -- المنتج المحجوز (إن وُجد)
  product_name   text,                        -- اسمه وقت الحجز (لقطة تاريخية)
  qty            numeric      default 1,      -- الكمية المحجوزة
  total_amount   numeric      default 0,      -- إجمالي قيمة الحجز
  deposit        numeric      default 0,      -- العربون المدفوع
  remaining      numeric      default 0,      -- المتبقّي على الزبون
  status         text         default 'open', -- open · completed · cancelled
  invoice_id     uuid,                        -- الفاتورة عند إتمام البيع
  note           text,
  created_by     text,
  created_at     timestamptz  default now(),
  updated_at     timestamptz  default now()
);

-- إكمال وقائي (نمط P1: create table لا يضيف أعمدة لجدول موجود مسبقاً)
alter table if exists gmt_reservations add column if not exists branch_key     text;
alter table if exists gmt_reservations add column if not exists customer_name  text;
alter table if exists gmt_reservations add column if not exists customer_phone text;
alter table if exists gmt_reservations add column if not exists product_id     uuid;
alter table if exists gmt_reservations add column if not exists product_name   text;
alter table if exists gmt_reservations add column if not exists qty            numeric     default 1;
alter table if exists gmt_reservations add column if not exists total_amount   numeric     default 0;
alter table if exists gmt_reservations add column if not exists deposit        numeric     default 0;
alter table if exists gmt_reservations add column if not exists remaining      numeric     default 0;
alter table if exists gmt_reservations add column if not exists status         text        default 'open';
alter table if exists gmt_reservations add column if not exists invoice_id     uuid;
alter table if exists gmt_reservations add column if not exists note           text;
alter table if exists gmt_reservations add column if not exists created_by     text;
alter table if exists gmt_reservations add column if not exists created_at     timestamptz default now();
alter table if exists gmt_reservations add column if not exists updated_at     timestamptz default now();

create index if not exists idx_gmt_reservations_branch on gmt_reservations (branch_key);
create index if not exists idx_gmt_reservations_status on gmt_reservations (status);
create index if not exists idx_gmt_reservations_at     on gmt_reservations (created_at desc);

do $$ begin
  execute 'grant select,insert,update,delete on gmt_reservations to anon, authenticated';
  execute 'grant usage, select on sequence gmt_reservations_id_seq to anon, authenticated';
exception when others then null; end $$;

-- ✔️ تحقّق: يجب أن يعيد صفر صفوف بلا خطأ
select count(*) as "عدد_الحجوزات" from gmt_reservations;
