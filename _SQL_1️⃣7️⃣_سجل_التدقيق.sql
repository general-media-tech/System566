-- ═══════════════════════════════════════════════════════════════════════════
-- 1️⃣7️⃣  سجلّ التدقيق السيادي  ·  كل تعديل يدوي يُسجَّل ولا يُمحى
-- أُنشئ 2026-08-18
-- ─────────────────────────────────────────────────────────────────────────
-- لماذا: كانت التعديلات اليدوية (فكّ قفل الكميات مثلاً) تُسجَّل في localStorage
-- فقط ⇒ أثرٌ محليّ يزول بمسح المتصفّح ولا يراه أحد غير صاحب الجهاز. المطلوب أن
-- **كل** تعديل يدوي: يطلب كلمة السر السيادية · يوجب سبباً · ويُحفظ في القاعدة
-- بما فيه القيمة قبل وبعد والتاريخ ومَن نفّذه.
--
-- آمن لإعادة التشغيل. شغّله بعد الملفات السابقة.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gmt_audit (
  id           bigserial primary key,
  at           timestamptz default now(),   -- وقت التنفيذ
  actor        text,                        -- من نفّذ (المستخدم/الدور)
  page         text,                        -- الصفحة التي جرى فيها التعديل
  action       text,                        -- نوع العملية: qty_manual · price_edit · delete · unlock …
  entity       text,                        -- الجدول المتأثّر: products · import_log …
  entity_id    text,                        -- معرّف السجل
  entity_name  text,                        -- اسم مقروء (اسم المنتج/رقم الفاتورة)
  field        text,                        -- الحقل المعدَّل (إن وُجد)
  old_value    text,                        -- القيمة قبل
  new_value    text,                        -- القيمة بعد
  reason       text,                        -- السبب الإجباري
  sovereign    boolean default false,       -- هل جرى بصلاحية سيادية
  meta         jsonb,                       -- تفاصيل إضافية
  created_at   timestamptz default now()
);

-- إكمال وقائي (نمط P1: create table لا يضيف أعمدة لجدول موجود)
alter table if exists gmt_audit add column if not exists at          timestamptz default now();
alter table if exists gmt_audit add column if not exists actor       text;
alter table if exists gmt_audit add column if not exists page        text;
alter table if exists gmt_audit add column if not exists action      text;
alter table if exists gmt_audit add column if not exists entity      text;
alter table if exists gmt_audit add column if not exists entity_id   text;
alter table if exists gmt_audit add column if not exists entity_name text;
alter table if exists gmt_audit add column if not exists field       text;
alter table if exists gmt_audit add column if not exists old_value   text;
alter table if exists gmt_audit add column if not exists new_value   text;
alter table if exists gmt_audit add column if not exists reason      text;
alter table if exists gmt_audit add column if not exists sovereign   boolean default false;
alter table if exists gmt_audit add column if not exists meta        jsonb;
alter table if exists gmt_audit add column if not exists created_at  timestamptz default now();

create index if not exists idx_gmt_audit_at     on gmt_audit (at desc);
create index if not exists idx_gmt_audit_entity on gmt_audit (entity, entity_id);
create index if not exists idx_gmt_audit_action on gmt_audit (action);

do $$ begin
  execute 'grant select,insert on gmt_audit to anon, authenticated';
exception when others then null; end $$;

-- ✔️ للمراجعة:  select at, actor, action, entity_name, field, old_value, new_value, reason
--               from gmt_audit order by at desc limit 50;
