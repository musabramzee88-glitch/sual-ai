import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../api/client.dart';
import '../catalog.g.dart';
import 'errors.dart';
import 'ui.dart';

/// القوالب: الجاهزة (للنسخ) وقوالب المدرس (إنشاء، تعديل، حذف، افتراضي) والشعارات
class TemplatesPage extends StatefulWidget {
  const TemplatesPage({super.key, required this.api});
  final SualApi api;
  @override
  State<TemplatesPage> createState() => _TemplatesPageState();
}

class _TemplatesPageState extends State<TemplatesPage> {
  late Future<List<Map<String, dynamic>>> _f = widget.api.templates();
  void _reload() => setState(() => _f = widget.api.templates());

  Future<void> _open(Map<String, dynamic> t, {bool copy = false}) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => TemplateEditor(api: widget.api, initial: t, copy: copy)));
    if (saved == true) _reload();
  }

  Future<void> _delete(Map<String, dynamic> t) async {
    if (!await confirm(context, 'حذف القالب «${t['name']}»؟', yes: 'حذف', danger: true) || !mounted) return;
    if (await guarded(context, () => widget.api.deleteTemplate(t['id'] as String), ok: 'حُذف القالب.')) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('القوالب', style: TextStyle(fontWeight: FontWeight.w900)), actions: [
        IconButton(tooltip: 'الشعارات', icon: const Icon(Icons.image_outlined), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LogosPage(api: widget.api)))),
      ]),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) return EmptyState(text: messageOf(s.error!), action: 'إعادة المحاولة', onTap: _reload, icon: Icons.cloud_off);
          final all = s.data!;
          final own = all.where((t) => t['preset'] != true).toList(), presets = all.where((t) => t['preset'] == true).toList();
          return ListView(padding: const EdgeInsets.all(16), children: [
            const Text('قوالبي', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            if (own.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('لا قوالب بعد. انسخ قالباً جاهزاً وعدّله.')),
            for (final t in own)
              Card(child: ListTile(
                title: Text(t['name'] as String? ?? ''),
                subtitle: Text('${layoutNamesAr[t['layout']] ?? t['layout']} · ${t['fontFamily']} ${ar(t['fontSizePt'] as num)}${t['isDefault'] == true ? ' · الافتراضي' : ''}'),
                leading: Icon(t['isDefault'] == true ? Icons.star : Icons.article_outlined, color: t['isDefault'] == true ? amber : brand),
                onTap: () => _open(t),
                trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(t)),
              )),
            const SizedBox(height: 16),
            const Text('قوالب جاهزة', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            for (final t in presets)
              Card(child: ListTile(
                title: Text(t['name'] as String? ?? ''),
                subtitle: Text(layoutNamesAr[t['layout']] ?? '${t['layout']}'),
                leading: const Icon(Icons.auto_awesome_mosaic_outlined, color: brand),
                trailing: TextButton(onPressed: () => _open(t, copy: true), child: const Text('نسخ وتعديل')),
              )),
          ]);
        },
      ),
    );
  }
}

/// محرر القالب: كل حقول templateSchema في الموقع
class TemplateEditor extends StatefulWidget {
  const TemplateEditor({super.key, required this.api, required this.initial, this.copy = false});
  final SualApi api;
  final Map<String, dynamic> initial;
  final bool copy;
  @override
  State<TemplateEditor> createState() => _TemplateEditorState();
}

class _TemplateEditorState extends State<TemplateEditor> {
  late final Map<String, dynamic> t = {
    for (final e in widget.initial.entries) e.key: e.value,
    if (widget.copy) 'name': '${widget.initial['name']} (نسختي)',
  };
  late final Map<String, bool> visible = {for (final k in headerKeys) k: ((t['visible'] as Map?)?[k] as bool?) ?? !hiddenByDefault.contains(k)};
  late final Map<String, TextEditingController> values = {for (final k in headerKeys) k: TextEditingController(text: '${(t['values'] as Map?)?[k] ?? ''}')};
  late final name = TextEditingController(text: t['name'] as String? ?? '');
  late final footer = TextEditingController(text: t['footerNote'] as String? ?? '');
  List<Map<String, dynamic>> _logos = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    widget.api.logos().then((l) => mounted ? setState(() => _logos = l) : null).catchError((_) {});
  }

  num _num(String k, num d) => (t[k] as num?) ?? d;
  Map<String, dynamic> get _margins => Map<String, dynamic>.from(t['margins'] as Map? ?? {'top': 12, 'right': 14, 'bottom': 12, 'left': 14});

  Future<void> _save() async {
    final body = <String, dynamic>{
      'name': name.text.trim().isEmpty ? 'قالبي' : name.text.trim(),
      'layout': t['layout'] ?? 'CLASSIC', 'pageSize': t['pageSize'] ?? 'A4', 'orientation': t['orientation'] ?? 'PORTRAIT',
      'fontFamily': t['fontFamily'] ?? 'Traditional Arabic', 'fontSizePt': _num('fontSizePt', 14).round(), 'lineSpacing': _num('lineSpacing', 1.65),
      'margins': _margins, 'showPageNumbers': t['showPageNumbers'] ?? true,
      'visible': visible, 'values': {for (final e in values.entries) if (e.value.text.trim().isNotEmpty) e.key: e.value.text.trim()},
      'answerLines': _num('answerLines', 0).round(), 'footerNote': footer.text.trim().isEmpty ? null : footer.text.trim(),
      'signLine': t['signLine'] ?? false, 'accent': t['accent'], 'maxPages': _num('maxPages', 2).round(),
      'logoAssetId': t['logoAssetId'], 'isDefault': t['isDefault'] ?? false,
    };
    setState(() => _busy = true);
    final isNew = widget.copy || t['preset'] == true || t['id'] == null;
    final ok = await guarded(context, () => isNew ? widget.api.createTemplate(body) : widget.api.updateTemplate(t['id'] as String, body), ok: 'حُفظ القالب.');
    if (mounted) setState(() => _busy = false);
    if (ok && mounted) Navigator.pop(context, true);
  }

  Widget _dd<T>(String label, String key, Map<T, String> items) => DropdownButtonFormField<T>(
        initialValue: t[key] as T?, isExpanded: true,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: [for (final e in items.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
        onChanged: (v) => setState(() => t[key] = v),
      );

  Widget _slider(String label, num v, double min, double max, int div, void Function(double) on, {String Function(num)? fmt}) => Row(children: [
        SizedBox(width: 110, child: Text('$label: ${fmt?.call(v) ?? ar(v)}')),
        Expanded(child: Slider(value: v.toDouble().clamp(min, max), min: min, max: max, divisions: div, onChanged: (x) => setState(() => on(x)))),
      ]);

  @override
  Widget build(BuildContext context) {
    final m = _margins;
    return Scaffold(
      appBar: AppBar(title: Text(widget.copy ? 'قالب جديد' : 'تعديل القالب'), actions: [
        TextButton(onPressed: _busy ? null : _save, child: const Text('حفظ')),
      ]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم القالب')),
        const SizedBox(height: 10),
        _dd<String>('شكل الترويسة', 'layout', {for (final l in layouts) l: layoutNamesAr[l] ?? l}),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: _dd<String>('الورق', 'pageSize', const {'A4': 'A4', 'A3': 'A3'})),
          const SizedBox(width: 10),
          Expanded(child: _dd<String>('الاتجاه', 'orientation', const {'PORTRAIT': 'عمودي', 'LANDSCAPE': 'أفقي'})),
        ]),
        const SizedBox(height: 10),
        _dd<String>('الخط', 'fontFamily', {for (final f in fonts) f: f}),
        _slider('حجم الخط', _num('fontSizePt', 14), 10, 22, 12, (x) => t['fontSizePt'] = x.round()),
        _slider('تباعد الأسطر', _num('lineSpacing', 1.65), 1, 2.5, 30, (x) => t['lineSpacing'] = double.parse(x.toStringAsFixed(2)), fmt: (v) => v.toStringAsFixed(2)),
        _slider('أسطر الإجابة', _num('answerLines', 0), 0, 8, 8, (x) => t['answerLines'] = x.round()),
        _slider('أقصى صفحات', _num('maxPages', 2), 0, 10, 10, (x) => t['maxPages'] = x.round(), fmt: (v) => v == 0 ? 'بلا حد' : ar(v)),
        const Text('الهوامش (ملم)', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final side in const {'top': 'أعلى', 'bottom': 'أسفل', 'right': 'يمين', 'left': 'يسار'}.entries)
          _slider(side.value, (m[side.key] as num?) ?? 12, 5, 40, 35, (x) { m[side.key] = x.round(); t['margins'] = m; }),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('ترقيم الصفحات'), value: t['showPageNumbers'] as bool? ?? true, onChanged: (v) => setState(() => t['showPageNumbers'] = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('سطر «معلم/ة المادة» في الذيل'), value: t['signLine'] as bool? ?? false, onChanged: (v) => setState(() => t['signLine'] = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('القالب الافتراضي'), value: t['isDefault'] as bool? ?? false, onChanged: (v) => setState(() => t['isDefault'] = v)),
        const Text('لون الترويسة', style: TextStyle(fontWeight: FontWeight.w700)),
        Wrap(spacing: 8, children: [
          ChoiceChip(label: const Text('أسود'), selected: t['accent'] == null, onSelected: (_) => setState(() => t['accent'] = null)),
          for (final a in accents)
            ChoiceChip(
              label: const Text('  '),
              avatar: CircleAvatar(backgroundColor: Color(int.parse('FF${a.substring(1)}', radix: 16))),
              selected: t['accent'] == a,
              onSelected: (_) => setState(() => t['accent'] = a),
            ),
        ]),
        const SizedBox(height: 10),
        const Text('الشعار', style: TextStyle(fontWeight: FontWeight.w700)),
        Wrap(spacing: 8, runSpacing: 8, children: [
          ChoiceChip(label: const Text('بلا شعار'), selected: t['logoAssetId'] == null, onSelected: (_) => setState(() => t['logoAssetId'] = null)),
          for (final l in _logos)
            GestureDetector(
              onTap: () => setState(() => t['logoAssetId'] = l['id']),
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(border: Border.all(color: t['logoAssetId'] == l['id'] ? brand : Colors.black12, width: 2), borderRadius: BorderRadius.circular(8)),
                child: Image.network(widget.api.logoUrl(l['id'] as String), headers: widget.api.authHeaders, width: 52, height: 52, fit: BoxFit.contain),
              ),
            ),
        ]),
        const SizedBox(height: 10),
        TextField(controller: footer, decoration: const InputDecoration(labelText: 'عبارة الختام (مثل: مع تمنياتنا لكم بالنجاح)')),
        const SizedBox(height: 16),
        const Text('حقول الترويسة', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final k in headerKeys)
          Row(children: [
            Checkbox(value: visible[k], onChanged: (v) => setState(() => visible[k] = v ?? false)),
            Expanded(child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: TextField(controller: values[k], enabled: visible[k] ?? false, decoration: InputDecoration(labelText: headerLabelsAr[k] ?? k, isDense: true, hintText: 'قيمة ثابتة (اختياري)')),
            )),
          ]),
        const SizedBox(height: 60),
      ]),
    );
  }
}

/// الشعارات: رفع (PNG/JPEG حتى 1MB) وحذف
class LogosPage extends StatefulWidget {
  const LogosPage({super.key, required this.api});
  final SualApi api;
  @override
  State<LogosPage> createState() => _LogosPageState();
}

class _LogosPageState extends State<LogosPage> {
  late Future<List<Map<String, dynamic>>> _f = widget.api.logos();
  void _reload() => setState(() => _f = widget.api.logos());

  Future<void> _upload() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 800, imageQuality: 90);
    if (x == null || !mounted) return;
    final bytes = await x.readAsBytes();
    if (!mounted) return;
    if (await guarded(context, () => widget.api.uploadLogo(bytes, x.name), ok: 'رُفع الشعار.')) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الشعارات')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _upload, icon: const Icon(Icons.upload), label: const Text('رفع شعار')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) return EmptyState(text: messageOf(s.error!), action: 'إعادة المحاولة', onTap: _reload);
          final l = s.data!;
          if (l.isEmpty) return const EmptyState(text: 'لا شعارات. ارفع شعار مدرستك (PNG أو JPEG).', icon: Icons.image_outlined);
          return GridView.count(
            padding: const EdgeInsets.all(16),
            crossAxisCount: 3, mainAxisSpacing: 12, crossAxisSpacing: 12,
            children: [
              for (final x in l)
                Card(child: Stack(children: [
                  Positioned.fill(child: Padding(padding: const EdgeInsets.all(10), child: Image.network(widget.api.logoUrl(x['id'] as String), headers: widget.api.authHeaders, fit: BoxFit.contain))),
                  Positioned(top: 0, left: 0, child: IconButton(icon: const Icon(Icons.delete_outline, size: 20), onPressed: () async {
                    if (await confirm(context, 'حذف الشعار؟', yes: 'حذف', danger: true) && context.mounted) {
                      if (await guarded(context, () => widget.api.deleteLogo(x['id'] as String))) _reload();
                    }
                  })),
                ])),
            ],
          );
        },
      ),
    );
  }
}
