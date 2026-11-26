import 'package:flutter/material.dart';
import '../api/client.dart';
import 'editor.dart';
import 'errors.dart';
import 'ui.dart';

class ExamsPage extends StatefulWidget {
  const ExamsPage({super.key, required this.api, required this.onLogout, required this.onNew});
  final SualApi api;
  final VoidCallback onLogout;
  final VoidCallback onNew;
  @override
  State<ExamsPage> createState() => ExamsPageState();
}

class ExamsPageState extends State<ExamsPage> {
  late Future<List<Map<String, dynamic>>> _f = widget.api.listExams();

  void reload() => setState(() => _f = widget.api.listExams());

  Future<void> open(String id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ExamEditorPage(api: widget.api, id: id)));
    reload();
  }

  Future<void> _delete(Map<String, dynamic> x) async {
    if (!await confirm(context, 'حذف «${x['title']}»؟', body: 'لا يمكن التراجع.', yes: 'حذف', danger: true)) return;
    if (!mounted) return;
    if (await guarded(context, () => widget.api.deleteExam(x['id'] as String), ok: 'حُذف الامتحان.')) reload();
  }

  static const _status = {'READY': 'جاهز', 'GENERATING': 'قيد التوليد…', 'FAILED': 'فشل التوليد', 'DRAFT': 'مسودة', 'ARCHIVED': 'مؤرشف'};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('امتحاناتي', style: TextStyle(fontWeight: FontWeight.w900)), actions: [IconButton(tooltip: 'تحديث', onPressed: reload, icon: const Icon(Icons.refresh))]),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) {
            final e = s.error!;
            if (e is ApiError && e.unauthorized) WidgetsBinding.instance.addPostFrameCallback((_) => widget.onLogout());
            return EmptyState(text: messageOf(e), action: 'إعادة المحاولة', onTap: reload, icon: Icons.cloud_off);
          }
          final list = s.data!;
          if (list.isEmpty) return EmptyState(text: 'ما عندك امتحانات بعد.', action: 'أنشئ أول امتحان', onTap: widget.onNew, icon: Icons.quiz_outlined);
          return RefreshIndicator(
            onRefresh: () async { reload(); await _f; },
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (c, i) {
                final x = list[i];
                final ready = x['status'] == 'READY';
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
                    title: Text(x['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${(x['subject'] as Map?)?['nameAr'] ?? ''} · ${(x['grade'] as Map?)?['nameAr'] ?? ''}\n${_status[x['status']] ?? x['status']} · ${ar(x['totalMarks'] as num? ?? 0)} درجة'),
                    isThreeLine: true,
                    leading: Icon(ready ? Icons.description : x['status'] == 'FAILED' ? Icons.error_outline : Icons.hourglass_top, color: ready ? brand : x['status'] == 'FAILED' ? Theme.of(context).colorScheme.error : amber),
                    trailing: PopupMenuButton<String>(
                      onSelected: (v) => v == 'delete' ? _delete(x) : null,
                      itemBuilder: (_) => const [PopupMenuItem(value: 'delete', child: Text('حذف'))],
                    ),
                    onTap: ready ? () => open(x['id'] as String) : null,
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
