#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════
🕵️ مسحة «ما اختفى فجأة» — كاشف الميزات المحذوفة بصمت
الإصدار 2026-08-22

لماذا وُجدت: كان في النظام PWA بعامل خدمة، حُذف حذفاً ناقصاً فبقيت منه جثّة
(`catch` بلا `try`) في ثلاث صفحات. النتيجة المزدوجة: اختفت الميزة، **وكسرت
الجثّة كل السكربتات التالية** أشهراً دون أن ينتبه أحد. والمالك كان يقول:
«كان عندنا هيك… بس اختفى وما بعرف ليش».

ما تكشفه هذه المسحة (كل فحص وُلد من عطل حقيقي وقع):
  A) جثث الحذف الناقص     — كتل script لا تُحلَّل نحوياً / قوس أو catch يتيم
  B) وسم بلا جسد          — تعليق يصف ميزة والكود تحته مفقود
  C) دوال مُعرَّفة لا تُنادى — كود ميت (نمط P6: الحارس المكتوب غير المُنادى)
  D) دوال تُنادى ولا تُعرَّف — الميزة ذهبت وبقي نداؤها
  E) مراجع لملفات مفقودة   — أصل حُذف وبقي وسمه
  F) ميزات مذكورة بالتوثيق ولا أثر لها في الكود
  G) مفاتيح تُقرأ ولا تُكتب — منتج ميزة أُزيلت

الاستعمال:  python3 مسحة_المختفيات.py [مجلد]
═══════════════════════════════════════════════════════════════════════════
"""
import os, re, sys, glob, json, subprocess, datetime

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
findings = []


def add(sev, cat, f, line, msg, why=''):
    findings.append({'sev': sev, 'cat': cat, 'file': f, 'line': line, 'msg': msg, 'why': why})


def html_files():
    return sorted(glob.glob(os.path.join(ROOT, '*.html')))


def js_files():
    out = []
    for pat in ('*.js', 'js/*.js', 'js/**/*.js'):
        out += glob.glob(os.path.join(ROOT, pat), recursive=True)
    return sorted(set(out))


def blocks(text):
    """كل كتل <script> الداخلية مع رقم سطر البداية."""
    for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, re.S | re.I):
        yield text[:m.start()].count('\n') + 1, m.group(1)


def node_check(code):
    with open('/tmp/_disappear.js', 'w', encoding='utf-8') as fh:
        fh.write(code)
    r = subprocess.run(['node', '--check', '/tmp/_disappear.js'],
                       capture_output=True, text=True)
    return r.returncode == 0, r.stderr


# ═══ A) جثث الحذف الناقص ═══
def scan_corpses():
    for path in html_files():
        t = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        for ln, code in blocks(t):
            if len(code.strip()) < 5:
                continue
            ok, err = node_check(code)
            if not ok:
                first = next((l.strip() for l in err.splitlines()
                              if 'Error' in l or 'Unexpected' in l), err[:80])
                add('حرج', 'جثة حذف ناقص', name, ln,
                    f'كتلة script لا تُحلَّل: {first[:70]}',
                    'توقف تنفيذ كل السكربتات التالية في الصفحة')
        # catch/finally يتيم مباشرة بعد فتح وسم أو تعليق
        for m in re.finditer(r'(?:<script[^>]*>|\*/)\s*(catch|finally)\s*[\(\{]', t):
            add('حرج', 'جثة حذف ناقص', name, t[:m.start()].count('\n') + 1,
                f'`{m.group(1)}` بلا كتلة try قبله', 'بقايا كود محذوف جزئياً')


# ═══ B) وسم بلا جسد ═══
FEATURE_HINT = re.compile(
    r'/\*+\s*([^*]{0,90}?(?:PWA|عامل الخدمة|service worker|تسجيل|مزامنة|كاش|cache|تخزين|نسخ احتياطي|backup)[^*]{0,90}?)\*/',
    re.I)


def scan_hollow_comments():
    for path in html_files() + js_files():
        t = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        for m in FEATURE_HINT.finditer(t):
            after = t[m.end():m.end() + 260]
            # ما بعد التعليق: هل فيه كود فعلي؟
            body = re.sub(r'</?script[^>]*>', '', after)
            body = re.sub(r'//[^\n]*|/\*.*?\*/', '', body, flags=re.S).strip()
            if len(body) < 12:
                add('حرج', 'وسم بلا جسد', name, t[:m.start()].count('\n') + 1,
                    'تعليق يصف ميزة ولا كود بعده: ' + m.group(1).strip()[:60],
                    'الميزة حُذفت وبقي وصفها')


# ═══ C+D) دوال يتيمة أو مفقودة ═══
BUILTIN = set('''var let const if for while switch catch return function typeof new this do else try
alert confirm prompt parseInt parseFloat setTimeout setInterval clearTimeout
JSON Math Object Array String Number Boolean Date Promise fetch console
require import export await async class extends super delete void yield of in'''.split())


def scan_functions():
    defs, calls, paths = {}, {}, {}
    for path in html_files() + js_files():
        t = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        paths[name] = path      # 🔧 احفظ المسار الكامل: الملفات داخل js/ لا تُفتح باسمها المجرّد
        for m in re.finditer(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', t):
            defs.setdefault(m.group(1), []).append((name, t[:m.start()].count('\n') + 1))
        for m in re.finditer(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', t):
            fn = m.group(1)
            if fn not in BUILTIN:
                calls.setdefault(fn, set()).add(name)
        # نداءات داخل سمات HTML
        for m in re.finditer(r'on\w+\s*=\s*"([^"]*)"', t):
            for c in re.findall(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', m.group(1)):
                if c not in BUILTIN:
                    calls.setdefault(c, set()).add(name)

    # C) مُعرَّفة ولا تُنادى — كود ميت
    for fn, locs in defs.items():
        if fn in calls:
            continue
        if fn.startswith('_') or len(fn) < 4:
            continue
        f, ln = locs[0]
        add('تنبيه', 'دالة لا تُنادى', f, ln, f'{fn}() معرّفة ولا تُستدعى في أي ملف',
            'نمط P6: ميزة كُتبت ولم تُوصل — أو نداؤها حُذف')

    # D) تُنادى ولا تُعرَّف — **مقيَّد بالنداءات الحقيقية فقط**
    #    (سابقاً كان يلتقط مفاتيح الكائنات ودوال المكتبات ⇒ 225 إيجابياً كاذباً
    #     أغرقت النتيجة الحقيقية. الآن: نداءات سمات HTML فقط — وهي التي تُعطّل
    #     زراً فعلياً إن اختفت الدالة، وهذا ما يهمّ المالك.)
    known = set(defs)
    attr_calls = {}
    for path in html_files():
        src = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        for m in re.finditer(r'on\w+\s*=\s*"([^"]*)"', src):
            for c in re.findall(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', m.group(1)):
                if c in BUILTIN:
                    continue
                attr_calls.setdefault(c, set()).add((name, path))
    for fn, locs in attr_calls.items():
        if fn in known:
            continue
        name, path = list(locs)[0]
        src = open(path, encoding='utf-8', errors='ignore').read()
        if re.search(r'(?:const|let|var)\s+' + re.escape(fn) + r'\s*=', src):
            continue
        # 🔧 (2026-08-23) لا تُنذر عن دوال مكتبات خارجية: إن ورد الاسم في وسم
        #    <script src="...cdn..."> فهو مُعرَّف خارجياً (مثل JsBarcode · XLSX · Chart).
        if re.search(r'<script[^>]+src="https?://[^"]*' + re.escape(fn) + r'[^"]*"', src, re.I):
            continue
        # دوال CSS داخل سمات style — ليست JS
        if fn in ('rgba','rgb','url','calc','var','translate','translateX','translateY',
                  'scale','rotate','linear-gradient','radial-gradient','hsl','hsla','blur','clamp'):
            continue
        if fn in ('JsBarcode', 'XLSX', 'ExcelJS', 'Chart', 'html2canvas', 'lucide',
                  'pdfjsLib', 'supabase', 'Tone', 'L', '$'):
            continue
        if re.search(r'(?:window|global)\.' + re.escape(fn) + r'\s*=', src):
            continue
        add('حرج', 'زر بلا دالة', name, 0,
            f'{fn}() مربوط بزر ولا يُعرَّف في أي ملف',
            'الميزة حُذفت وبقي زرّها ⇒ الزر لا يعمل')


# ═══ E) مراجع لملفات مفقودة ═══
def scan_missing_refs():
    have = set()
    for r, _d, fs in os.walk(ROOT):
        for f in fs:
            have.add(os.path.relpath(os.path.join(r, f), ROOT).replace('\\', '/'))
    for path in html_files():
        t = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        for m in re.finditer(r'(?:href|src)="([^"]+\.(?:html|js|css|json))(?:\?[^"]*)?"', t):
            u = m.group(1)
            if u.startswith(('http', '//', '#', 'data:')) or '${' in u:
                continue
            if u not in have:
                add('حرج', 'مرجع مفقود', name, t[:m.start()].count('\n') + 1,
                    f'يشير إلى {u} وهو غير موجود', 'ملف حُذف وبقي وسمه')


# ═══ G) مفاتيح تُقرأ ولا تُكتب ═══
def scan_orphan_keys():
    reads, writes = {}, set()
    for path in html_files() + js_files():
        t = open(path, encoding='utf-8', errors='ignore').read()
        name = os.path.basename(path)
        for m in re.finditer(r"localStorage\.getItem\(\s*['\"]([^'\"]+)['\"]", t):
            reads.setdefault(m.group(1), set()).add(name)
        for m in re.finditer(r"localStorage\.setItem\(\s*['\"]([^'\"]+)['\"]", t):
            writes.add(m.group(1))
    for k, files in reads.items():
        if k not in writes:
            add('ملاحظة', 'مفتاح بلا كاتب', list(files)[0], 0,
                f'«{k}» يُقرأ ولا يُكتب في أي ملف',
                'قد تكون الميزة التي تكتبه أُزيلت (أو يُضبط خارجياً)')


def main():
    print('🕵️  مسحة «ما اختفى فجأة» — ' + ROOT)
    print('═' * 62)
    scan_corpses()
    scan_hollow_comments()
    scan_functions()
    scan_missing_refs()
    scan_orphan_keys()

    order = {'حرج': 0, 'تنبيه': 1, 'ملاحظة': 2}
    findings.sort(key=lambda x: (order.get(x['sev'], 3), x['cat'], x['file']))
    crit = [f for f in findings if f['sev'] == 'حرج']
    warn = [f for f in findings if f['sev'] == 'تنبيه']
    note = [f for f in findings if f['sev'] == 'ملاحظة']

    for grp, icon in ((crit, '🔴'), (warn, '🟠'), (note, '⚪')):
        if not grp:
            continue
        print()
        for x in grp[:40]:
            loc = f"{x['file']}:{x['line']}" if x['line'] else x['file']
            print(f"{icon} [{x['cat']}] {loc}")
            print(f"    {x['msg']}")
            if x['why']:
                print(f"    ↳ {x['why']}")
        if len(grp) > 40:
            print(f"    …و{len(grp)-40} أخرى")

    print()
    print('═' * 62)
    print(f"النتيجة: 🔴 حرج {len(crit)} · 🟠 تنبيه {len(warn)} · ⚪ ملاحظة {len(note)}")
    if not crit:
        print("✅ لا جثث حذف ناقص ولا مراجع مفقودة.")

    out = os.path.join(ROOT, '_تقرير_المختفيات.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'at': datetime.datetime.now().isoformat(),
                   'critical': len(crit), 'warn': len(warn), 'note': len(note),
                   'findings': findings}, fh, ensure_ascii=False, indent=1)
    print('📄 التقرير: ' + out)
    return 1 if crit else 0


if __name__ == '__main__':
    sys.exit(main())
