import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/client.dart';
import '../catalog.g.dart';
import 'ui.dart';

/// الحساب: الحالة والاشتراك (عرض فقط — لا دفع في التطبيق)، الأمان، حذف الحساب، الخروج، الشروط والخصوصية
class AccountPage extends StatefulWidget {
  const AccountPage({super.key, required this.api, required this.onLogout});
  final SualApi api;
  final VoidCallback onLogout;
  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> {
  late Future<List<Map<String, dynamic>>> _f = _load();

  Future<List<Map<String, dynamic>>> _load() async => [await widget.api.me(), await widget.api.subscription(), await widget.api.security()];
  void _reload() => setState(() => _f = _load());

  Future<void> _security(Map<String, dynamic> sec) async {
    final both = sec['loginSecurity'] == 'BOTH';
    if (!both && !(sec['emailVerified'] == true && sec['phoneVerified'] == true)) {
      toast(context, 'الأمان الإضافي يحتاج تأكيد البريد والهاتف كليهما (من الموقع).');
      return;
    }
    final pw = await promptText(context, both ? 'إيقاف الأمان الإضافي' : 'تفعيل الأمان الإضافي (رمزان عند الدخول)', hint: 'كلمة المرور');
    if (pw == null || pw.isEmpty || !mounted) return;
    if (await guarded(context, () => widget.api.setLoginSecurity(both ? 'SINGLE' : 'BOTH', pw), ok: 'تم الحفظ.')) _reload();
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'حذف الحساب نهائياً؟', body: 'تُحذف امتحاناتك وقوالبك وصورك وبياناتك الشخصية، ولا يمكن التراجع. سجلات الدفع تبقى كما يلزم القانون.', yes: 'متابعة', danger: true)) return;
    if (!mounted) return;
    final pw = await promptText(context, 'اكتب كلمة المرور للتأكيد');
    if (pw == null || pw.isEmpty || !mounted) return;
    if (await guarded(context, () => widget.api.deleteAccount(pw))) widget.onLogout();
  }

  Future<void> _logout() async {
    await widget.api.logout();
    widget.onLogout();
  }

  String _date(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    return d == null ? '' : '${ar(d.day)}/${ar(d.month)}/${ar(d.year)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الحساب', style: TextStyle(fontWeight: FontWeight.w900))),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) return EmptyState(text: 'تعذّر تحميل الحساب.', action: 'إعادة المحاولة', onTap: _reload, icon: Icons.cloud_off);
          final me = s.data![0], sub = s.data![1], sec = s.data![2];
          final user = me['user'] as Map<String, dynamic>;
          final access = (sub['access'] ?? me['access']) as String? ?? '';
          final current = sub['current'] as Map<String, dynamic>?;
          final active = access == 'SUBSCRIPTION_ACTIVE';
          return ListView(padding: const EdgeInsets.all(16), children: [
            Card(child: ListTile(
              leading: const CircleAvatar(backgroundColor: brand, child: Icon(Icons.person, color: Colors.white)),
              title: Text(user['fullName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('${user['email'] ?? ''}\n${user['phone'] ?? ''}', textDirection: TextDirection.ltr, textAlign: TextAlign.right),
              isThreeLine: true,
            )),
            const SizedBox(height: 10),
            Card(child: ListTile(
              leading: Icon(active ? Icons.verified : Icons.info_outline, color: active ? brand : amber),
              title: Text(active ? 'الحساب مفعّل' : access == 'UNVERIFIED' ? (accessStatesAr[access] ?? 'بانتظار التحقق') : 'الحساب غير مفعّل لهذه الخدمة', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: active && current != null
                  ? Text('${(current['plan'] as Map?)?['nameAr'] ?? ''}${current['endsAt'] != null ? ' · ينتهي ${_date(current['endsAt'] as String?)}' : ''}')
                  : null,
              trailing: !active && access != 'UNVERIFIED' && showPayLink
                  ? FilledButton(onPressed: () => launchUrl(Uri.parse('$apiBase/subscribe'), mode: LaunchMode.externalApplication), child: const Text('الاشتراك'))
                  : null,
            )),
            const SizedBox(height: 10),
            Card(child: Column(children: [
              SwitchListTile(
                value: sec['loginSecurity'] == 'BOTH',
                onChanged: (_) => _security(sec),
                title: const Text('الأمان الإضافي'),
                subtitle: const Text('رمز للبريد ورمز للهاتف معاً عند كل دخول'),
              ),
              const Divider(height: 1),
              ListTile(leading: const Icon(Icons.logout), title: const Text('تسجيل الخروج'), onTap: _logout),
            ])),
            const SizedBox(height: 10),
            Card(child: Column(children: [
              ListTile(leading: const Icon(Icons.description_outlined), title: const Text('الشروط'), onTap: () => launchUrl(Uri.parse('$apiBase/terms'))),
              ListTile(leading: const Icon(Icons.privacy_tip_outlined), title: const Text('الخصوصية'), onTap: () => launchUrl(Uri.parse('$apiBase/privacy'))),
              ListTile(leading: const Icon(Icons.support_agent), title: const Text('تواصل معنا'), onTap: () => launchUrl(Uri.parse('$apiBase/contact'))),
            ])),
            const SizedBox(height: 10),
            Card(child: ListTile(
              leading: Icon(Icons.delete_forever, color: Theme.of(context).colorScheme.error),
              title: Text('حذف الحساب', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              subtitle: const Text('يحذف امتحاناتك وبياناتك نهائياً'),
              onTap: _delete,
            )),
          ]);
        },
      ),
    );
  }
}
