import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../api/client.dart';
import '../catalog.g.dart';
import 'errors.dart';
import 'math.dart';
import 'paper.dart';
import 'ui.dart';

const _letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

/// مراجعة الامتحان وتعديله (كل ما في محرر الموقع): العنوان والمدة والأسئلة الاختيارية، توزيع الدرجات،
/// الأقسام (تعليمة، درجة، فروع يجاب عنها، إضافة يدوية، توليد المزيد، نسخ، ترتيب، حذف)،
/// والفروع (تعديل، سؤال بديل، تراجع، نسخ، صورة، جدول، ترتيب، حذف)، ثم الورقة والتنزيل.
class ExamEditorPage extends StatefulWidget {
  const ExamEditorPage({super.key, required this.api, required this.id});
  final SualApi api;
  final String id;
  @override
  State<ExamEditorPage> createState() => _ExamEditorPageState();
}

class _ExamEditorPageState extends State<ExamEditorPage> {
  Map<String, dynamic>? _exam;
  Object? _err;
  bool _answers = false;
  int _imgV = 0; // يجدّد الصور بعد رفع صورة جديدة

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final e = await widget.api.getExam(widget.id);
      if (mounted) setState(() { _exam = e; _err = null; });
    } catch (e) {
      if (mounted) setState(() => _err = e);
    }
  }

  /// كل تعديل: ينفّذ ثم يعيد تحميل الامتحان (الدرجات الكلية يعيد الخادم حسابها)
  Future<void> _do(Future<void> Function() f, {String? ok, String? busy}) async {
    final run = busy == null ? f : () async => withBusy(context, busy, f);
    if (await guarded(context, run, ok: ok)) await _load();
  }

  List<Map<String, dynamic>> get _sections => ((_exam?['sections'] as List?) ?? const []).cast<Map<String, dynamic>>();

  // ───── الامتحان ─────
  Future<void> _rename() async {
    final v = await promptText(context, 'عنوان الامتحان', initial: _exam!['title'] as String? ?? '');
    if (v != null && v.isNotEmpty) await _do(() => widget.api.examAction(widget.id, {'action': 'meta', 'title': v}));
  }

  Future<void> _settings() async {
    final e = _exam!;
    final dur = TextEditingController(text: '${e['durationMinutes'] ?? ''}');
    int? answer = e['sectionsToAnswer'] as int?;
    bool first = e['firstRequired'] as bool? ?? true;
    final n = _sections.length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
        title: const Text('إعدادات الامتحان'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: dur, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'المدة بالدقائق')),
          const SizedBox(height: 12),
          DropdownButtonFormField<int?>(
            initialValue: answer, isExpanded: true,
            decoration: const InputDecoration(labelText: 'عدد الأسئلة التي يجيب عنها الطالب'),
            items: [const DropdownMenuItem(value: null, child: Text('كل الأسئلة')), for (var k = 1; k < n; k++) DropdownMenuItem(value: k, child: Text('${ar(k)} من ${ar(n)}'))],
            onChanged: (v) => set(() => answer = v),
          ),
          if (answer != null) CheckboxListTile(contentPadding: EdgeInsets.zero, value: first, onChanged: (v) => set(() => first = v ?? true), title: const Text('السؤال الأول إجباري')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('حفظ'))],
      )),
    );
    if (ok != true) return;
    final d = int.tryParse(dur.text);
    await _do(() => widget.api.examAction(widget.id, {'action': 'meta', 'durationMinutes': d, 'sectionsToAnswer': answer, 'firstRequired': first}), ok: 'حُفظت الإعدادات.');
  }

  Future<void> _distribute() async {
    final total = TextEditingController(text: '${_n(_exam!['totalMarks']).round()}');
    String mode = 'smart';
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
        title: const Text('توزيع الدرجات'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: total, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الدرجة الكلية')),
          const SizedBox(height: 12),
          SegmentedButton<String>(segments: const [ButtonSegment(value: 'smart', label: Text('ذكي')), ButtonSegment(value: 'equal', label: Text('متساوٍ'))], selected: {mode}, onSelectionChanged: (s) => set(() => mode = s.first)),
          const SizedBox(height: 8),
          Text(mode == 'smart' ? 'حسب نوع السؤال وصعوبته (مضاعفات ٥ حين يمكن).' : 'كل سؤال رئيس بالدرجة نفسها.', style: const TextStyle(fontSize: 13)),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('وزّع'))],
      )),
    );
    final t = int.tryParse(total.text);
    if (ok == true && t != null) await _do(() => widget.api.examAction(widget.id, {'action': 'distribute', 'total': t, 'mode': mode}), ok: 'وُزّعت الدرجات.');
  }

  Future<void> _addSection() async {
    final used = _sections.map((s) => s['type']).toSet();
    final free = generatableTypes.where((t) => !used.contains(t)).toList();
    String type = free.first;
    final count = TextEditingController(text: '3'), marks = TextEditingController(text: '2');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
        title: const Text('سؤال رئيس جديد'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(initialValue: type, isExpanded: true, decoration: const InputDecoration(labelText: 'النوع'), items: [for (final t in free) DropdownMenuItem(value: t, child: Text(qTypes[t]?.ar ?? t))], onChanged: (v) => set(() => type = v!)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: count, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'عدد الفروع'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: marks, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'درجة الفرع'))),
          ]),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('ولّد'))],
      )),
    );
    if (ok != true) return;
    await _do(() => widget.api.examAction(widget.id, {'action': 'addSection', 'type': type, 'count': (int.tryParse(count.text) ?? 3).clamp(1, 20), 'marksEach': (int.tryParse(marks.text) ?? 2).clamp(1, 50)}),
        busy: 'جاري توليد الأسئلة…', ok: 'أُضيف السؤال.');
  }

  Future<void> _moveSection(int i, int d) async {
    final ids = _sections.map((s) => s['id'] as String).toList();
    final j = i + d;
    if (j < 0 || j >= ids.length) return;
    ids.insert(j, ids.removeAt(i));
    await _do(() => widget.api.examAction(widget.id, {'action': 'reorderSections', 'ids': ids}));
  }

  // ───── القسم ─────
  Future<void> _sectionMenu(int i, String v) async {
    final s = _sections[i];
    final id = s['id'] as String;
    final branches = (s['branches'] as List).length;
    switch (v) {
      case 'instruction':
        final t = await promptText(context, 'نص التعليمة', initial: s['instruction'] as String? ?? s['prompt'] as String? ?? '', maxLines: 3);
        if (t != null && t.isNotEmpty) await _do(() => widget.api.sectionPatch(id, {'instruction': t}));
      case 'passage':
        final t = await promptText(context, 'القطعة الخارجية', initial: s['passage'] as String? ?? '', maxLines: 12);
        if (t != null && t.trim().length >= 40) await _do(() => widget.api.sectionPatch(id, {'passage': t.trim()}));
      case 'marks':
        final t = await promptText(context, 'درجة السؤال (تُقسم على فروعه)', initial: '${_n(s['marks'])}', number: true);
        final m = num.tryParse(t ?? '');
        if (m != null) await _do(() => widget.api.sectionPatch(id, {'marks': m}));
      case 'answerCount':
        final r = await showDialog<int>(context: context, builder: (c) => SimpleDialog(title: const Text('كم فرعاً يجيب عنه الطالب؟'), children: [
          SimpleDialogOption(onPressed: () => Navigator.pop(c, 0), child: const Text('كل الفروع')),
          for (var k = 1; k < branches; k++) SimpleDialogOption(onPressed: () => Navigator.pop(c, k), child: Text('${ar(k)} من ${ar(branches)}')),
        ]));
        if (r != null) await _do(() => widget.api.sectionPatch(id, {'answerCount': r == 0 ? null : r}));
      case 'manual':
        await _editQuestion(null, sectionId: id, mcq: s['type'] == 'MCQ');
      case 'more':
        final t = await promptText(context, 'كم فرعاً إضافياً؟', initial: '2', number: true);
        final k = int.tryParse(t ?? '');
        if (k != null) await _do(() => widget.api.sectionAction(id, {'action': 'generateMore', 'count': k.clamp(1, 10)}), busy: 'جاري توليد فروع إضافية…', ok: 'أُضيفت فروع.');
      case 'duplicate':
        await _do(() => widget.api.sectionAction(id, {'action': 'duplicate'}), ok: 'نُسخ السؤال.');
      case 'up':
        await _moveSection(i, -1);
      case 'down':
        await _moveSection(i, 1);
      case 'delete':
        if (await confirm(context, 'حذف السؤال الرئيس بكل فروعه؟', yes: 'حذف', danger: true)) await _do(() => widget.api.deleteSection(id));
    }
  }

  // ───── الفرع ─────
  Future<void> _editQuestion(Map<String, dynamic>? q, {String? sectionId, bool mcq = false}) async {
    final prompt = TextEditingController(text: q?['prompt'] as String? ?? '');
    final answer = TextEditingController(text: q?['answer'] as String? ?? '');
    final opts = TextEditingController(text: ((q?['options'] as List?)?.cast<String>() ?? const []).join('\n'));
    final marks = TextEditingController(text: q == null ? '' : '${_n(q['marks'])}');
    final hasOptions = mcq || (q?['options'] as List?) != null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(q == null ? 'فرع جديد' : 'تعديل الفرع'),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: prompt, maxLines: 4, minLines: 2, decoration: const InputDecoration(labelText: 'نص السؤال')),
          if (hasOptions) ...[const SizedBox(height: 10), TextField(controller: opts, maxLines: 6, minLines: 3, decoration: const InputDecoration(labelText: 'الخيارات (كل خيار بسطر)'))],
          const SizedBox(height: 10),
          TextField(controller: answer, maxLines: 4, minLines: 1, decoration: InputDecoration(labelText: 'الإجابة', helperText: hasOptions ? 'يجب أن تطابق أحد الخيارات' : null)),
          const SizedBox(height: 10),
          TextField(controller: marks, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'الدرجة (اختياري)')),
          const SizedBox(height: 6),
          const Text('للرياضيات: x^2 للأس، q_1 للدليل، sqrt(x) للجذر', style: TextStyle(fontSize: 12)),
        ])),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('حفظ'))],
      ),
    );
    if (ok != true) return;
    final options = hasOptions ? opts.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList() : null;
    final m = num.tryParse(marks.text);
    if (q == null) {
      await _do(() => widget.api.sectionAction(sectionId!, {'action': 'addManual', 'prompt': prompt.text.trim(), 'answer': answer.text.trim(), 'options': options, if (m != null) 'marks': m}), ok: 'أُضيف الفرع.');
    } else {
      await _do(() => widget.api.questionPatch(q['id'] as String, {'prompt': prompt.text.trim(), 'answer': answer.text.trim(), if (hasOptions) 'options': options, if (m != null) 'marks': m}), ok: 'حُفظ.');
    }
  }

  Future<void> _editTable(Map<String, dynamic> q) async {
    final t = q['table'] as Map<String, dynamic>?;
    var cells = ((t?['cells'] as List?) ?? [['', ''], ['', '']]).map((r) => (r as List).map((c) => '$c').toList()).toList();
    bool header = t?['header'] as bool? ?? true;
    String style = t?['style'] as String? ?? 'GRID';
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) {
        final cols = cells.first.length;
        return AlertDialog(
          title: const Text('جدول السؤال'),
          content: SizedBox(width: double.maxFinite, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            CheckboxListTile(contentPadding: EdgeInsets.zero, value: header, onChanged: (v) => set(() => header = v ?? true), title: const Text('الصف الأول عناوين')),
            const Align(alignment: AlignmentDirectional.centerStart, child: Text('شكل العرض')),
            Wrap(spacing: 6, children: [for (final e in tableStyles.entries) ChoiceChip(label: Text(e.value), selected: style == e.key, onSelected: (_) => set(() => style = e.key))]),
            for (var r = 0; r < cells.length; r++)
              Row(children: [for (var k = 0; k < cols; k++) Expanded(child: Padding(padding: const EdgeInsets.all(2), child: TextFormField(initialValue: cells[r][k], style: TextStyle(fontWeight: header && r == 0 ? FontWeight.bold : null), decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.all(8)), onChanged: (v) => cells[r][k] = v)))]),
            Wrap(spacing: 6, children: [
              if (cells.length < 12) TextButton(onPressed: () => set(() => cells.add(List.filled(cols, ''))), child: const Text('+ صف')),
              if (cols < 8) TextButton(onPressed: () => set(() { for (final r in cells) { r.add(''); } }), child: const Text('+ عمود')),
              if (cells.length > 1) TextButton(onPressed: () => set(() => cells.removeLast()), child: const Text('− صف')),
              if (cols > 1) TextButton(onPressed: () => set(() { for (final r in cells) { r.removeLast(); } }), child: const Text('− عمود')),
            ]),
          ]))),
          actions: [
            if (t != null) TextButton(onPressed: () => Navigator.pop(c, null), child: const Text('إزالة الجدول')),
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('حفظ')),
          ],
        );
      }),
    );
    if (ok == false) return;
    await _do(() => widget.api.setTable(q['id'] as String, ok == null ? null : {'header': header, 'cells': cells, if (style != 'GRID') 'style': style}), ok: ok == null ? 'أُزيل الجدول.' : 'حُفظ الجدول.');
  }

  Future<void> _pickImage(Map<String, dynamic> q) async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    await _do(() => widget.api.uploadImage(q['id'] as String, bytes, x.name), ok: 'أُضيفت الصورة.');
    setState(() => _imgV++);
  }

  Future<void> _moveBranch(Map<String, dynamic> s, int i, int d) async {
    final ids = (s['branches'] as List).map((b) => (b as Map)['id'] as String).toList();
    final j = i + d;
    if (j < 0 || j >= ids.length) return;
    ids.insert(j, ids.removeAt(i));
    await _do(() => widget.api.sectionAction(s['id'] as String, {'action': 'reorder', 'ids': ids}));
  }

  Future<void> _branchMenu(Map<String, dynamic> s, int i, String v) async {
    final q = (s['branches'] as List)[i] as Map<String, dynamic>;
    final id = q['id'] as String;
    switch (v) {
      case 'edit':
        await _editQuestion(q, mcq: s['type'] == 'MCQ');
      case 'regenerate':
        await _do(() => widget.api.questionAction(id, 'regenerate'), busy: 'جاري توليد سؤال بديل…', ok: 'استُبدل السؤال.');
      case 'undo':
        await _do(() => widget.api.questionAction(id, 'undo'), ok: 'تم التراجع.');
      case 'duplicate':
        await _do(() => widget.api.questionAction(id, 'duplicate'), ok: 'نُسخ الفرع.');
      case 'image':
        await _pickImage(q);
      case 'noimage':
        await _do(() => widget.api.deleteImage(id), ok: 'أُزيلت الصورة.');
      case 'table':
        await _editTable(q);
      case 'up':
        await _moveBranch(s, i, -1);
      case 'down':
        await _moveBranch(s, i, 1);
      case 'delete':
        if (await confirm(context, 'حذف هذا الفرع؟', yes: 'حذف', danger: true)) await _do(() => widget.api.deleteQuestion(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _exam;
    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(onTap: e == null ? null : _rename, child: Text(e?['title'] as String? ?? '', maxLines: 1, overflow: TextOverflow.ellipsis)),
        actions: e == null ? null : [
          IconButton(tooltip: _answers ? 'إخفاء الإجابات' : 'إظهار الإجابات', onPressed: () => setState(() => _answers = !_answers), icon: Icon(_answers ? Icons.visibility_off : Icons.visibility)),
          PopupMenuButton<String>(
            onSelected: (v) => switch (v) { 'rename' => _rename(), 'settings' => _settings(), 'distribute' => _distribute(), 'add' => _addSection(), _ => null },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'rename', child: Text('تعديل العنوان')),
              PopupMenuItem(value: 'settings', child: Text('المدة والأسئلة الاختيارية')),
              PopupMenuItem(value: 'distribute', child: Text('توزيع الدرجات')),
              PopupMenuItem(value: 'add', child: Text('سؤال رئيس جديد')),
            ],
          ),
        ],
      ),
      floatingActionButton: e == null ? null : FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaperPage(api: widget.api, exam: e))).then((_) => _load()),
        icon: const Icon(Icons.print),
        label: const Text('الورقة والتنزيل'),
      ),
      body: _err != null
          ? EmptyState(text: messageOf(_err!), action: 'إعادة المحاولة', onTap: _load, icon: Icons.cloud_off)
          : e == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 110), children: [
                  _statusBar(e),
                  for (var i = 0; i < _sections.length; i++) _sectionCard(i),
                  if (_sections.isEmpty) const EmptyState(text: 'لا أسئلة. أضف سؤالاً رئيساً من القائمة.'),
                ])),
    );
  }

  Widget _statusBar(Map<String, dynamic> e) {
    final branches = _sections.fold<int>(0, (n, s) => n + (s['branches'] as List).length);
    final answer = e['sectionsToAnswer'] as int?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Wrap(spacing: 8, runSpacing: 6, children: [
        Chip(label: Text('${(e['subject'] as Map?)?['nameAr'] ?? ''} · ${(e['grade'] as Map?)?['nameAr'] ?? ''}')),
        Chip(label: Text('المجموع ${ar(_n(e['totalMarks']))} درجة'), backgroundColor: const Color(0xFFE3F1EF)),
        Chip(label: Text('${ar(_sections.length)} أسئلة · ${ar(branches)} فرعاً')),
        if (e['durationMinutes'] != null) Chip(label: Text('${ar(_n(e['durationMinutes']))} دقيقة')),
        if (answer != null) Chip(label: Text('يجيب عن ${ar(answer)}${(e['firstRequired'] as bool? ?? true) ? '، الأول إجباري' : ''}'), backgroundColor: const Color(0xFFFFF3D6)),
      ]),
    );
  }

  Widget _sectionCard(int i) {
    final s = _sections[i];
    final branches = (s['branches'] as List).cast<Map<String, dynamic>>();
    final type = s['type'] as String?;
    final ac = s['answerCount'] as int?;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 4, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('س${ar(i + 1)}/ ${prettyMath(s['instruction'] as String? ?? s['prompt'] as String? ?? '')}  (${ar(_n(s['marks']))} درجة)', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, height: 1.6)),
            )),
            PopupMenuButton<String>(
              tooltip: 'خيارات السؤال',
              onSelected: (v) => _sectionMenu(i, v),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'instruction', child: Text('تعديل التعليمة')),
                if (type == 'UNSEEN_PASSAGE' && s['passage'] != null) const PopupMenuItem(value: 'passage', child: Text('تعديل القطعة')),
                const PopupMenuItem(value: 'marks', child: Text('درجة السؤال')),
                if (branches.length > 1) const PopupMenuItem(value: 'answerCount', child: Text('فروع اختيارية')),
                const PopupMenuItem(value: 'manual', child: Text('إضافة فرع يدوياً')),
                if (type != null && generatableTypes.contains(type)) const PopupMenuItem(value: 'more', child: Text('توليد فروع إضافية')),
                const PopupMenuItem(value: 'duplicate', child: Text('نسخ السؤال')),
                if (i > 0) const PopupMenuItem(value: 'up', child: Text('تحريك للأعلى')),
                if (i < _sections.length - 1) const PopupMenuItem(value: 'down', child: Text('تحريك للأسفل')),
                const PopupMenuItem(value: 'delete', child: Text('حذف')),
              ],
            ),
          ]),
          if (type == 'UNSEEN_PASSAGE' && s['passage'] != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 6, bottom: 6, right: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: paper, border: Border.all(color: const Color(0xFFE5E0D4)), borderRadius: BorderRadius.circular(10)),
              child: Text(s['passage'] as String, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 14, height: 1.7)),
            ),
          if (ac != null) Text('أجب عن (${ar(ac)}) فروع فقط', style: const TextStyle(color: Color(0xFF8A6A1F))),
          if (type != null && verbatimTypes.contains(type))
            Container(
              margin: const EdgeInsets.only(top: 4, left: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: const Color(0xFFFFF3D6), borderRadius: BorderRadius.circular(8)),
              child: const Text('⚠ طابق النص بالكتاب حرفياً قبل الطباعة', style: TextStyle(fontSize: 13)),
            ),
          for (var j = 0; j < branches.length; j++) _branch(s, j, branches[j]),
        ]),
      ),
    );
  }

  Widget _branch(Map<String, dynamic> s, int j, Map<String, dynamic> q) {
    final opts = (q['options'] as List?)?.cast<String>();
    final ans = q['answer'] as String? ?? '';
    final table = q['table'] as Map<String, dynamic>?;
    final hasImage = q['imageAssetId'] != null;
    final n = (s['branches'] as List).length;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Padding(
          padding: const EdgeInsets.only(top: 8, right: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${ar(j + 1)}- ${prettyMath(q['prompt'] as String? ?? '')}  (${ar(_n(q['marks']))})', style: const TextStyle(fontSize: 15.5, height: 1.7)),
            if (opts != null) Padding(padding: const EdgeInsets.only(right: 16), child: Wrap(spacing: 16, children: [for (var k = 0; k < opts.length; k++) Text('${_letters[k % 6]}- ${prettyMath(opts[k])}')])),
            if (hasImage)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network('${widget.api.imageUrl(q['id'] as String)}?v=$_imgV', headers: widget.api.authHeaders, height: 140, fit: BoxFit.contain, errorBuilder: (_, _, _) => const Text('تعذّر عرض الصورة'))),
              ),
            if (table != null) _tableView(table),
            if (_answers && ans.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFE3F1EF), borderRadius: BorderRadius.circular(8)),
                child: Text('الجواب: ${prettyMath(ans)}', style: const TextStyle(color: Color(0xFF08504D))),
              ),
          ]),
        )),
        PopupMenuButton<String>(
          tooltip: 'خيارات الفرع',
          icon: const Icon(Icons.more_vert, size: 20),
          onSelected: (v) => _branchMenu(s, j, v),
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit', child: Text('تعديل')),
            const PopupMenuItem(value: 'regenerate', child: Text('سؤال بديل')),
            const PopupMenuItem(value: 'undo', child: Text('تراجع عن آخر تغيير')),
            const PopupMenuItem(value: 'duplicate', child: Text('نسخ الفرع')),
            PopupMenuItem(value: 'image', child: Text(hasImage ? 'تغيير الصورة' : 'إضافة صورة')),
            if (hasImage) const PopupMenuItem(value: 'noimage', child: Text('إزالة الصورة')),
            PopupMenuItem(value: 'table', child: Text(table == null ? 'إضافة جدول' : 'تعديل الجدول')),
            if (j > 0) const PopupMenuItem(value: 'up', child: Text('تحريك للأعلى')),
            if (j < n - 1) const PopupMenuItem(value: 'down', child: Text('تحريك للأسفل')),
            const PopupMenuItem(value: 'delete', child: Text('حذف')),
          ],
        ),
      ]),
    );
  }

  Widget _tableView(Map<String, dynamic> t) {
    final cells = (t['cells'] as List).map((r) => (r as List).map((c) => '$c').toList()).toList();
    final header = t['header'] as bool? ?? false;
    final style = t['style'] as String? ?? 'GRID';
    final grid = style == 'GRID';
    final last = cells.first.length - 1;
    String shown(int r, int c) => style == 'BLANKS' && c == last && cells[r][c].trim().isNotEmpty && !(header && r == 0) ? '(      ) ${cells[r][c]}' : cells[r][c];
    return Padding(
      padding: const EdgeInsets.only(top: 6, left: 8),
      child: Table(
        border: grid ? TableBorder.all(color: Colors.black54) : null,
        defaultColumnWidth: const IntrinsicColumnWidth(),
        children: [
          for (var r = 0; r < cells.length; r++)
            TableRow(
              decoration: header && r == 0 ? BoxDecoration(color: grid ? const Color(0xFFF0F0F0) : null, border: grid ? null : const Border(bottom: BorderSide(color: Colors.black54))) : null,
              children: [for (var c = 0; c < cells[r].length; c++) Padding(padding: EdgeInsets.symmetric(horizontal: grid ? 6 : 12, vertical: grid ? 6 : 3), child: Text(prettyMath(shown(r, c)), textAlign: grid ? TextAlign.center : TextAlign.start, style: TextStyle(fontWeight: header && r == 0 ? FontWeight.bold : null)))],
            ),
        ],
      ),
    );
  }
}
