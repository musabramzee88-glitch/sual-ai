import 'package:flutter/material.dart';
import '../api/client.dart';
import 'errors.dart';
import 'exam_detail.dart';

class ExamsPage extends StatefulWidget {
  const ExamsPage({super.key, required this.api, required this.onLogout});
  final SualApi api;
  final VoidCallback onLogout;
  @override
  State<ExamsPage> createState() => _ExamsPageState();
}

class _ExamsPageState extends State<ExamsPage> {
  late Future<List<Map<String, dynamic>>> _f = widget.api.listExams();

  void _reload() => setState(() => _f = widget.api.listExams());

  Future<void> _logout() async {
    await widget.api.logout();
    widget.onLogout();
  }

  static const _status = {'READY': 'جاهز', 'GENERATING': 'قيد التوليد', 'FAILED': 'فشل', 'DRAFT': 'مسودة'};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('امتحاناتي', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [IconButton(tooltip: 'تسجيل الخروج', onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) {
            final e = s.error!;
            if (e is ApiError && e.unauthorized) WidgetsBinding.instance.addPostFrameCallback((_) => widget.onLogout());
            return _Message(text: messageOf(e), action: 'إعادة المحاولة', onTap: _reload);
          }
          final list = s.data!;
          if (list.isEmpty) return const _Message(text: 'ما عندك امتحانات بعد.\nأنشئ أول امتحان من الموقع، وسيظهر هنا.');
          return RefreshIndicator(
            onRefresh: () async { _reload(); await _f; },
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (c, i) {
                final x = list[i];
                final ready = x['status'] == 'READY';
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Text(x['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${(x['subject'] as Map?)?['nameAr'] ?? ''} · ${(x['grade'] as Map?)?['nameAr'] ?? ''}\n${_status[x['status']] ?? x['status']} · ${x['totalMarks']} درجة'),
                    isThreeLine: true,
                    trailing: const Icon(Icons.chevron_left),
                    enabled: ready,
                    onTap: ready ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ExamDetailPage(api: widget.api, id: x['id'] as String))) : null,
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

class _Message extends StatelessWidget {
  const _Message({required this.text, this.action, this.onTap});
  final String text;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (action != null) ...[const SizedBox(height: 14), FilledButton(onPressed: onTap, child: Text(action!))],
          ]),
        ),
      );
}
