import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../api/client.dart';
import 'errors.dart';

const _letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

class ExamDetailPage extends StatefulWidget {
  const ExamDetailPage({super.key, required this.api, required this.id});
  final SualApi api;
  final String id;
  @override
  State<ExamDetailPage> createState() => _ExamDetailPageState();
}

class _ExamDetailPageState extends State<ExamDetailPage> {
  late final Future<Map<String, dynamic>> _f = widget.api.getExam(widget.id);
  String _variant = 'questions', _format = 'pdf', _model = 'A';
  bool _busy = false;
  bool _answers = false;

  Future<void> _download(String title) async {
    setState(() => _busy = true);
    try {
      final d = await widget.api.export(widget.id, variant: _variant, format: _format, model: _model, name: title);
      final dir = await getTemporaryDirectory();
      final safe = d.fileName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final f = File('${dir.path}/$safe');
      await f.writeAsBytes(d.bytes, flush: true);
      await Share.shareXFiles([XFile(f.path)], subject: title);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(messageOf(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _sheet(String title) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('تنزيل الورقة', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 14),
            const Text('النسخة'),
            Wrap(spacing: 8, children: [
              for (final v in const {'questions': 'الأسئلة', 'answers': 'مع الإجابات', 'key': 'الإجابات النموذجية', 'sheet': 'ورقة الإجابة'}.entries)
                ChoiceChip(label: Text(v.value), selected: _variant == v.key, onSelected: (_) { set(() {}); setState(() => _variant = v.key); }),
            ]),
            const SizedBox(height: 12),
            const Text('الصيغة'),
            Wrap(spacing: 8, children: [
              for (final v in const {'pdf': 'PDF', 'docx': 'Word'}.entries)
                ChoiceChip(label: Text(v.value), selected: _format == v.key, onSelected: (_) { set(() {}); setState(() => _format = v.key); }),
            ]),
            const SizedBox(height: 12),
            const Text('النموذج'),
            Wrap(spacing: 8, children: [
              for (var i = 0; i < 4; i++)
                ChoiceChip(label: Text(['A', 'B', 'C', 'D'][i]), selected: _model == 'ABCD'[i], onSelected: (_) { set(() {}); setState(() => _model = 'ABCD'[i]); }),
            ]),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () { Navigator.pop(c); _download(title); },
              icon: const Icon(Icons.download),
              label: const Text('تنزيل ومشاركة'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _f,
      builder: (c, s) {
        final e = s.data;
        final title = (e?['title'] as String?) ?? '';
        return Scaffold(
          appBar: AppBar(
            title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
            actions: [
              if (e != null) IconButton(tooltip: _answers ? 'إخفاء الإجابات' : 'إظهار الإجابات', onPressed: () => setState(() => _answers = !_answers), icon: Icon(_answers ? Icons.visibility_off : Icons.visibility)),
            ],
          ),
          floatingActionButton: e == null ? null : FloatingActionButton.extended(
            onPressed: _busy ? null : () => _sheet(title),
            icon: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.download),
            label: Text(_busy ? 'جاري التجهيز…' : 'تنزيل'),
          ),
          body: s.connectionState != ConnectionState.done
              ? const Center(child: CircularProgressIndicator())
              : s.hasError
                  ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(messageOf(s.error!))))
                  : _Paper(exam: e!, showAnswers: _answers),
        );
      },
    );
  }
}

class _Paper extends StatelessWidget {
  const _Paper({required this.exam, required this.showAnswers});
  final Map<String, dynamic> exam;
  final bool showAnswers;

  @override
  Widget build(BuildContext context) {
    final sections = (exam['sections'] as List).cast<Map<String, dynamic>>();
    final t = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      children: [
        Text('${(exam['subject'] as Map?)?['nameAr'] ?? ''} · ${(exam['grade'] as Map?)?['nameAr'] ?? ''} · ${exam['totalMarks']} درجة', style: t.bodyMedium),
        const SizedBox(height: 8),
        for (var i = 0; i < sections.length; i++) ...[
          Card(
            margin: const EdgeInsets.only(top: 10),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('س${i + 1}/ ${sections[i]['prompt'] ?? sections[i]['instruction'] ?? ''}  (${sections[i]['marks']} درجة)', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                for (var j = 0; j < (sections[i]['branches'] as List).length; j++) _Branch(n: j + 1, q: (sections[i]['branches'] as List)[j] as Map<String, dynamic>, showAnswer: showAnswers),
              ]),
            ),
          ),
        ],
      ],
    );
  }
}

class _Branch extends StatelessWidget {
  const _Branch({required this.n, required this.q, required this.showAnswer});
  final int n;
  final Map<String, dynamic> q;
  final bool showAnswer;
  @override
  Widget build(BuildContext context) {
    final opts = (q['options'] as List?)?.cast<String>();
    final ans = (q['answer'] as String?) ?? '';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$n- ${q['prompt'] ?? ''}', style: const TextStyle(height: 1.7, fontSize: 16)),
        if (opts != null) Padding(padding: const EdgeInsets.only(right: 18, top: 2), child: Wrap(spacing: 18, children: [for (var i = 0; i < opts.length; i++) Text('${_letters[i % _letters.length]}- ${opts[i]}')])),
        if (showAnswer && ans.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4, right: 18),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: const Color(0xFFE3F1EF), borderRadius: BorderRadius.circular(8)),
            child: Text('الجواب: $ans', style: const TextStyle(color: Color(0xFF08504D))),
          ),
      ]),
    );
  }
}
