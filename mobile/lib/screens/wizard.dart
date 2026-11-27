import 'package:flutter/material.dart';
import '../api/client.dart';
import '../catalog.g.dart';
import 'errors.dart';
import 'ui.dart';

/// معالج امتحان جديد (مثل الموقع): المنهج ← المصدر (فصول أو صفحات) ← أنواع الأسئلة ← الإعدادات ← توليد
class WizardPage extends StatefulWidget {
  const WizardPage({super.key, required this.api, required this.onCreated});
  final SualApi api;
  final void Function(String examId) onCreated;
  @override
  State<WizardPage> createState() => _WizardPageState();
}

class _Sec {
  _Sec(this.type, {this.count = 5, this.marksEach = 2});
  String type;
  int count;
  int marksEach;
}

class _WizardPageState extends State<WizardPage> {
  List<Map<String, dynamic>>? _opts;
  List<Map<String, dynamic>> _structures = [];
  Object? _loadErr;
  String? _grade, _subject, _curId;
  bool _byPages = false;
  final Set<String> _chapters = {};
  final _from = TextEditingController(), _to = TextEditingController(), _title = TextEditingController();
  // متحكّمان ثابتان: حقل بمفتاح يتغير مع كل حرف يُعاد بناؤه فيفقد التركيز ويُغلق الكيبورد
  final _durationCtl = TextEditingController(text: '60'), _totalCtl = TextEditingController();
  final List<_Sec> _secs = [];
  String _kind = 'MONTHLY', _difficulty = 'MIXED', _distribution = 'smart';
  int? _duration = 60, _total;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loadErr = null);
    try {
      final o = await widget.api.examOptions();
      final st = await widget.api.structures().catchError((_) => <Map<String, dynamic>>[]);
      if (mounted) setState(() { _opts = o; _structures = st; });
    } catch (e) {
      if (mounted) setState(() => _loadErr = e);
    }
  }

  List<Map<String, dynamic>> get _all => _opts ?? [];
  /// الفصول التي لها نطاق صفحات (الخادم يرفض غيرها)؛ إن لم يوجد منها شيء يُستعمل نطاق الصفحات تلقائياً مثل الموقع
  List<Map<String, dynamic>> get _usable => ((_cur?['chapters'] as List?) ?? const []).cast<Map<String, dynamic>>().where((c) => c['pageStart'] != null && c['pageEnd'] != null).toList();
  bool get _effByPages => _byPages || _usable.isEmpty;
  Map<String, dynamic>? get _cur => _all.where((c) => c['id'] == _curId).firstOrNull;
  List<String> get _allowed {
    final t = ((_cur?['subject'] as Map?)?['questionTypes'] as List?)?.cast<String>() ?? const [];
    return (t.isEmpty ? generatableTypes : t.where(generatableTypes.contains)).toList();
  }

  String _gradeName(String code) => ((_all.firstWhere((c) => (c['grade'] as Map)['code'] == code)['grade'] as Map)['nameAr']) as String;
  String _bookName(Map<String, dynamic> c) {
    final kind = const {'TEXTBOOK': '', 'EXERCISES': ' (تمارين)', 'ACTIVITY': ' (نشاط)'}[c['kind']] ?? '';
    final part = (c['part'] as int? ?? 0) > 0 ? ' — الجزء ${ar(c['part'] as int)}' : '';
    final track = (c['track'] as Map?)?['nameAr'] ?? '';
    return '${c['title']}$kind$part${track.toString().isEmpty ? '' : ' · $track'}';
  }

  void _pickCurriculum(String? id) {
    setState(() {
      _curId = id;
      _chapters.clear();
      _secs.removeWhere((s) => !_allowed.contains(s.type));
      if (_secs.isEmpty && _allowed.isNotEmpty) _secs.add(_Sec(_allowed.first));
    });
  }

  void _applyStructure(Map<String, dynamic> st) {
    final c = _all.where((x) => x['id'] == st['curriculumId']).firstOrNull;
    if (c == null) {
      toast(context, 'منهج ذلك الامتحان غير متاح الآن.');
      return;
    }
    setState(() {
      _grade = (c['grade'] as Map)['code'] as String;
      _subject = (c['subject'] as Map)['code'] as String;
      _curId = c['id'] as String;
      _chapters.clear();
      _secs
        ..clear()
        ..addAll([for (final s in (st['sections'] as List).cast<Map<String, dynamic>>()) if (_allowed.contains(s['type'])) _Sec(s['type'] as String, count: (s['count'] as int).clamp(1, 20), marksEach: 2)]);
      _kind = st['kind'] as String? ?? _kind;
      _difficulty = st['difficulty'] as String? ?? _difficulty;
      _duration = st['durationMinutes'] as int?;
      _total = st['totalMarks'] as int?;
      _durationCtl.text = _duration?.toString() ?? '';
      _totalCtl.text = _total?.toString() ?? '';
    });
    toast(context, 'طُبّق الهيكل. اختر الفصول ثم ولّد.');
  }

  int get _questionCount => _secs.fold(0, (n, s) => n + s.count);

  String? _problem() {
    if (_cur == null) return 'اختر المنهج.';
    if (_effByPages) {
      final a = int.tryParse(_from.text), b = int.tryParse(_to.text);
      if (a == null || b == null || b < a) return 'حدّد نطاق صفحات صحيح.';
      if (b > (_cur!['pageCount'] as int? ?? 0)) return 'الصفحات خارج نطاق الكتاب.';
    } else if (_chapters.isEmpty) {
      return 'اختر فصلاً واحداً على الأقل (أو استعمل نطاق صفحات).';
    }
    if (_secs.isEmpty) return 'أضف نوع سؤال واحداً على الأقل.';
    if (_secs.map((s) => s.type).toSet().length != _secs.length) return errorsAr['DUPLICATE_SECTION'];
    if (_questionCount > 40) return errorsAr['TOO_MANY_QUESTIONS'];
    return null;
  }

  Future<void> _generate() async {
    final p = _problem();
    if (p != null) {
      toast(context, p);
      return;
    }
    final input = <String, dynamic>{
      'curriculumId': _curId,
      if (_effByPages) ...{'pageFrom': int.parse(_from.text), 'pageTo': int.parse(_to.text)} else 'chapterIds': _chapters.toList(),
      if (_title.text.trim().isNotEmpty) 'title': _title.text.trim(),
      'kind': _kind,
      'difficulty': _difficulty,
      if (_duration != null) 'durationMinutes': _duration,
      'sections': [for (final s in _secs) {'type': s.type, 'count': s.count, 'marksEach': s.marksEach}],
      if (_total != null) ...{'totalMarks': _total, 'distribution': _distribution},
    };
    try {
      final id = await withBusy(context, 'جاري توليد الأسئلة من الكتاب…\nقد يستغرق دقيقة.', () => widget.api.createExam(input));
      if (id != null && mounted) {
        toast(context, 'الامتحان جاهز. راجعه قبل الطباعة.');
        widget.onCreated(id);
      }
    } catch (e) {
      if (mounted) toast(context, messageOf(e));
    }
  }

  Widget _card(String title, List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)), const SizedBox(height: 10), ...children])),
      );

  @override
  Widget build(BuildContext context) {
    if (_loadErr != null) return Scaffold(appBar: AppBar(title: const Text('امتحان جديد')), body: EmptyState(text: messageOf(_loadErr!), action: 'إعادة المحاولة', onTap: _load, icon: Icons.cloud_off));
    if (_opts == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_all.isEmpty) return Scaffold(appBar: AppBar(title: const Text('امتحان جديد')), body: const EmptyState(text: 'لا توجد مناهج جاهزة للتوليد بعد.', icon: Icons.menu_book_outlined));

    final grades = <String>{for (final c in _all) (c['grade'] as Map)['code'] as String}.toList();
    final subjects = <String, String>{for (final c in _all.where((c) => (c['grade'] as Map)['code'] == _grade)) (c['subject'] as Map)['code'] as String: (c['subject'] as Map)['nameAr'] as String};
    final books = _all.where((c) => (c['grade'] as Map)['code'] == _grade && (c['subject'] as Map)['code'] == _subject).toList();
    final chapters = _usable;

    return Scaffold(
      appBar: AppBar(
        title: const Text('امتحان جديد', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          if (_structures.isNotEmpty)
            PopupMenuButton<Map<String, dynamic>>(
              tooltip: 'بنفس هيكل امتحان سابق',
              icon: const Icon(Icons.copy_all),
              onSelected: _applyStructure,
              itemBuilder: (_) => [for (final s in _structures) PopupMenuItem(value: s, child: Text(s['title'] as String? ?? ''))],
            ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 120), children: [
        _card('١ المنهج', [
          DropdownButtonFormField<String>(
            initialValue: _grade, isExpanded: true,
            decoration: const InputDecoration(labelText: 'الصف'),
            items: [for (final g in grades) DropdownMenuItem(value: g, child: Text(_gradeName(g)))],
            onChanged: (v) => setState(() { _grade = v; _subject = null; _pickCurriculum(null); }),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            key: ValueKey('s$_grade'), initialValue: _subject, isExpanded: true,
            decoration: const InputDecoration(labelText: 'المادة'),
            items: [for (final e in subjects.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) {
              setState(() => _subject = v);
              final b = _all.where((c) => (c['grade'] as Map)['code'] == _grade && (c['subject'] as Map)['code'] == v).toList();
              _pickCurriculum(b.length == 1 ? b.first['id'] as String : null);
            },
          ),
          if (books.length > 1) ...[
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              key: ValueKey('b$_grade$_subject'), initialValue: _curId, isExpanded: true,
              decoration: const InputDecoration(labelText: 'الكتاب'),
              items: [for (final b in books) DropdownMenuItem(value: b['id'] as String, child: Text(_bookName(b), overflow: TextOverflow.ellipsis))],
              onChanged: _pickCurriculum,
            ),
          ],
          if (_cur != null && _cur!['kind'] == 'TEXTBOOK' && ((_cur!['subject'] as Map?)?['questionTypes'] as List? ?? const []).contains('UNSEEN_PASSAGE'))
            const Padding(padding: EdgeInsets.only(top: 8), child: Text('في الإنكليزي تُؤخذ الأسئلة من كتاب الطالب وكتاب النشاط معاً (إن رُفع كتاب النشاط لهذا الصف).', style: TextStyle(fontSize: 13, color: Colors.black54))),
        ]),
        if (_cur != null)
          _card('٢ المصدر', [
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('فصول')), ButtonSegment(value: true, label: Text('نطاق صفحات'))],
              selected: {_effByPages},
              onSelectionChanged: chapters.isEmpty ? null : (s) => setState(() => _byPages = s.first),
            ),
            const SizedBox(height: 10),
            if (chapters.isEmpty) const Padding(padding: EdgeInsets.only(bottom: 6), child: Text('هذا الكتاب لم تُحدَّد له فصول بعد (تُحدَّد من لوحة الإدارة)، فاكتب نطاق الصفحات التي تريد الأسئلة منها.', style: TextStyle(height: 1.6))),
            if (!_effByPages)
              for (final ch in chapters)
                CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _chapters.contains(ch['id']),
                  onChanged: (v) => setState(() => v == true ? _chapters.add(ch['id'] as String) : _chapters.remove(ch['id'])),
                  title: Text(ch['title'] as String? ?? ''),
                  subtitle: ch['pageStart'] == null ? null : Text('ص ${ar(ch['pageStart'] as int)}–${ar(ch['pageEnd'] as int? ?? 0)}'),
                ),
            if (_effByPages)
              Row(children: [
                Expanded(child: TextField(controller: _from, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'من صفحة'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: _to, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'إلى صفحة (من ${ar(_cur!['pageCount'] as int? ?? 0)})'))),
              ]),
          ]),
        if (_cur != null)
          _card('٣ الأسئلة (${ar(_questionCount)} من ٤٠)', [
            for (var i = 0; i < _secs.length; i++) _secRow(i),
            if (_secs.length < 8)
              OutlinedButton.icon(
                onPressed: () {
                  final free = _allowed.where((t) => !_secs.any((s) => s.type == t)).toList();
                  if (free.isNotEmpty) setState(() => _secs.add(_Sec(free.first)));
                },
                icon: const Icon(Icons.add),
                label: const Text('نوع آخر'),
              ),
            if (_secs.any((s) => verbatimTypes.contains(s.type)))
              const Padding(padding: EdgeInsets.only(top: 8), child: Text('⚠ النصوص المنقولة حرفياً (الآيات، الأحاديث، الأبيات) يُتحقق منها مع الكتاب، وطابقها بنفسك قبل الطباعة.', style: TextStyle(fontSize: 13))),
          ]),
        if (_cur != null)
          _card('٤ الإعدادات', [
            TextField(controller: _title, decoration: const InputDecoration(labelText: 'عنوان الامتحان (اختياري)')),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: DropdownButtonFormField<String>(initialValue: _kind, isExpanded: true, decoration: const InputDecoration(labelText: 'النوع'), items: [for (final e in examKinds.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => _kind = v!))),
              const SizedBox(width: 10),
              Expanded(child: DropdownButtonFormField<String>(initialValue: _difficulty, isExpanded: true, decoration: const InputDecoration(labelText: 'الصعوبة'), items: [for (final e in difficulties.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => _difficulty = v!))),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: TextField(controller: _durationCtl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'المدة (دقيقة)'), onChanged: (v) => _duration = int.tryParse(v))),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: _totalCtl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الدرجة الكلية', helperText: 'فارغ = درجة لكل سؤال'), onChanged: (v) => setState(() => _total = int.tryParse(v)))),
            ]),
            if (_total != null) ...[
              const SizedBox(height: 10),
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'smart', label: Text('توزيع ذكي')), ButtonSegment(value: 'equal', label: Text('أسئلة متساوية'))],
                selected: {_distribution},
                onSelectionChanged: (s) => setState(() => _distribution = s.first),
              ),
            ],
          ]),
      ]),
      floatingActionButton: _cur == null ? null : FloatingActionButton.extended(onPressed: _generate, icon: const Icon(Icons.auto_awesome), label: const Text('ولّد الامتحان')),
    );
  }

  Widget _secRow(int i) {
    final s = _secs[i];
    final options = _allowed.where((t) => t == s.type || !_secs.any((x) => x.type == t)).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Expanded(flex: 5, child: DropdownButtonFormField<String>(
          initialValue: s.type, isExpanded: true,
          decoration: const InputDecoration(labelText: 'النوع', isDense: true),
          items: [for (final t in options) DropdownMenuItem(value: t, child: Text(qTypes[t]?.ar ?? t, overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => s.type = v!),
        )),
        const SizedBox(width: 6),
        Expanded(flex: 2, child: TextFormField(initialValue: '${s.count}', keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'العدد', isDense: true), onChanged: (v) => setState(() => s.count = (int.tryParse(v) ?? 1).clamp(1, 20)))),
        if (_total == null) ...[
          const SizedBox(width: 6),
          Expanded(flex: 2, child: TextFormField(initialValue: '${s.marksEach}', keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'درجة', isDense: true), onChanged: (v) => s.marksEach = (int.tryParse(v) ?? 1).clamp(1, 50))),
        ],
        IconButton(tooltip: 'حذف', onPressed: () => setState(() => _secs.removeAt(i)), icon: const Icon(Icons.close)),
      ]),
    );
  }
}
