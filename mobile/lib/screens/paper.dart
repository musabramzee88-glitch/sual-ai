import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import '../api/client.dart';
import '../catalog.g.dart';
import 'errors.dart';
import 'ui.dart';

const _variants = {'questions': 'الأسئلة', 'answers': 'مع الإجابات', 'key': 'الإجابات النموذجية', 'sheet': 'ورقة إجابة الطالب'};
const _models = ['A', 'B', 'C', 'D'];

/// الورقة والتنزيل: معاينة PDF الحقيقية (نفس محرّك الموقع)، طباعة مباشرة، مشاركة، Word، ZIP، والترويسة والقالب
class PaperPage extends StatefulWidget {
  const PaperPage({super.key, required this.api, required this.exam});
  final SualApi api;
  final Map<String, dynamic> exam;
  @override
  State<PaperPage> createState() => _PaperPageState();
}

class _PaperPageState extends State<PaperPage> {
  String _variant = 'questions', _model = 'A';
  String? _template;
  List<Map<String, dynamic>> _templates = [];
  int _rev = 0;
  late Map<String, dynamic> _header = Map<String, dynamic>.from((widget.exam['headerConfig'] as Map?)?['values'] as Map? ?? const {});

  String get _id => widget.exam['id'] as String;
  String get _title => widget.exam['title'] as String? ?? 'امتحان';

  @override
  void initState() {
    super.initState();
    _template = widget.exam['templateId'] as String? ?? (widget.exam['headerConfig'] as Map?)?['preset'] as String?;
    widget.api.templates().then((t) => mounted ? setState(() => _templates = t) : null).catchError((_) {});
  }

  Future<Uint8List> _pdf() async {
    final d = await widget.api.export(_id, variant: _variant, format: 'pdf', model: _model, template: _template);
    return Uint8List.fromList(d.bytes);
  }

  Future<void> _shareFile(Download d) async {
    final dir = await getTemporaryDirectory();
    final f = File('${dir.path}/${d.fileName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_')}');
    await f.writeAsBytes(d.bytes, flush: true);
    await SharePlus.instance.share(ShareParams(files: [XFile(f.path)], subject: _title));
  }

  String get _suffix => '$_title - ${_variants[_variant]}${_model == 'A' ? '' : ' - نموذج $_model'}';

  Future<void> _word() async {
    try {
      final d = await withBusy(context, 'جاري تجهيز ملف Word…', () => widget.api.export(_id, variant: _variant, format: 'docx', model: _model, template: _template, name: _suffix));
      if (d != null) await _shareFile(d);
    } catch (e) {
      if (mounted) toast(context, messageOf(e));
    }
  }

  Future<void> _zip() async {
    final models = <String>{'A'}, variants = <String>{'questions', 'key'};
    String format = 'pdf';
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
        title: const Text('ملف مضغوط (ZIP)'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('النماذج'),
          Wrap(spacing: 6, children: [for (final m in _models) FilterChip(label: Text(m), selected: models.contains(m), onSelected: (v) => set(() => v ? models.add(m) : models.remove(m)))]),
          const SizedBox(height: 8),
          const Text('النسخ'),
          Wrap(spacing: 6, children: [for (final e in _variants.entries) FilterChip(label: Text(e.value), selected: variants.contains(e.key), onSelected: (v) => set(() => v ? variants.add(e.key) : variants.remove(e.key)))]),
          const SizedBox(height: 8),
          SegmentedButton<String>(segments: const [ButtonSegment(value: 'pdf', label: Text('PDF')), ButtonSegment(value: 'docx', label: Text('Word'))], selected: {format}, onSelectionChanged: (s) => set(() => format = s.first)),
          const SizedBox(height: 6),
          Text('${ar(models.length * variants.length)} ملفات (الحد ١٦)', style: const TextStyle(fontSize: 13)),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: models.isEmpty || variants.isEmpty ? null : () => Navigator.pop(c, true), child: const Text('تجهيز'))],
      )),
    );
    if (ok != true || !mounted) return;
    try {
      final d = await withBusy(context, 'جاري تجهيز الملفات…', () => widget.api.exportZip(_id, models: models.toList(), variants: variants.toList(), format: format, template: _template, name: _title));
      if (d != null) await _shareFile(d);
    } catch (e) {
      if (mounted) toast(context, messageOf(e));
    }
  }

  Future<void> _editHeader() async {
    final ctrl = {for (final k in headerKeys) k: TextEditingController(text: '${_header[k] ?? ''}')};
    String? tpl = _template;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
        title: const Text('الترويسة والقالب'),
        content: SizedBox(width: double.maxFinite, child: ListView(shrinkWrap: true, children: [
          DropdownButtonFormField<String?>(
            initialValue: _templates.any((t) => t['id'] == tpl) ? tpl : null, isExpanded: true,
            decoration: const InputDecoration(labelText: 'القالب'),
            items: [const DropdownMenuItem(value: null, child: Text('القالب الافتراضي')), for (final t in _templates) DropdownMenuItem(value: t['id'] as String, child: Text('${t['name']}${t['preset'] == true ? ' (جاهز)' : ''}'))],
            onChanged: (v) => set(() => tpl = v),
          ),
          const SizedBox(height: 8),
          const Text('قيم هذا الامتحان (ما تكتبه يظهر في الترويسة حتى لو كان الحقل مخفياً في القالب):', style: TextStyle(fontSize: 13)),
          for (final k in headerKeys.where((k) => !const ['title', 'subject', 'grade', 'total', 'model'].contains(k)))
            Padding(padding: const EdgeInsets.only(top: 8), child: TextField(controller: ctrl[k], decoration: InputDecoration(labelText: headerLabelsAr[k] ?? k, isDense: true))),
        ])),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('حفظ'))],
      )),
    );
    if (ok != true || !mounted) return;
    final values = {for (final e in ctrl.entries) if (e.value.text.trim().isNotEmpty) e.key: e.value.text.trim()};
    final saved = await guarded(context, () => widget.api.examAction(_id, {'action': 'header', 'templateId': tpl, 'values': values}), ok: 'حُفظت الترويسة.');
    if (saved) setState(() { _header = values; _template = tpl; _rev++; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الورقة والتنزيل'), actions: [
        IconButton(tooltip: 'الترويسة والقالب', onPressed: _editHeader, icon: const Icon(Icons.edit_note)),
        PopupMenuButton<String>(
          onSelected: (v) => v == 'word' ? _word() : _zip(),
          itemBuilder: (_) => const [PopupMenuItem(value: 'word', child: Text('تنزيل Word')), PopupMenuItem(value: 'zip', child: Text('ملف ZIP لعدة نماذج'))],
        ),
      ]),
      body: Column(children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          child: Row(children: [
            for (final e in _variants.entries) Padding(padding: const EdgeInsets.only(left: 6), child: ChoiceChip(label: Text(e.value), selected: _variant == e.key, onSelected: (_) => setState(() { _variant = e.key; _rev++; }))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            const Text('النموذج: '),
            for (final m in _models) Padding(padding: const EdgeInsets.only(left: 6), child: ChoiceChip(label: Text(m), selected: _model == m, onSelected: (_) => setState(() { _model = m; _rev++; }))),
          ]),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: PdfPreview(
            key: ValueKey('$_variant$_model$_template$_rev'),
            build: (_) => _pdf(),
            canChangePageFormat: false,
            canChangeOrientation: false,
            canDebug: false,
            allowPrinting: true,
            allowSharing: true,
            pdfFileName: '$_suffix.pdf',
            loadingWidget: const Column(mainAxisSize: MainAxisSize.min, children: [CircularProgressIndicator(), SizedBox(height: 12), Text('جاري تجهيز الورقة…')]),
            onError: (c, e) => EmptyState(text: messageOf(e), icon: Icons.error_outline),
          ),
        ),
      ]),
    );
  }
}
