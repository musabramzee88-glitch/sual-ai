import 'package:flutter/material.dart';
import '../api/client.dart';
import 'errors.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.api, required this.onDone});
  final SualApi api;
  final VoidCallback onDone;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _id = TextEditingController(), _pw = TextEditingController(), _code = TextEditingController();
  List<Map<String, dynamic>>? _challenges;
  bool _busy = false;
  String? _err;

  Future<void> _run(Future<void> Function() f) async {
    setState(() { _busy = true; _err = null; });
    try {
      await f();
    } catch (e) {
      if (mounted) setState(() => _err = messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _login() => _run(() async {
        final r = await widget.api.login(_id.text, _pw.text);
        if (r.needsOtp) {
          setState(() => _challenges = r.challenges);
        } else {
          widget.onDone();
        }
      });

  Future<void> _verify() => _run(() async {
        // رمز واحد عادةً؛ إن طُلب رمزان (بريد وهاتف) نقبل الرمز نفسه للأول فقط ونطلب الثاني
        final ch = _challenges!;
        await widget.api.verifyOtp([for (final c in ch.take(1)) {'challengeId': c['challengeId'] as String, 'code': _code.text.trim()}]);
        widget.onDone();
      });

  @override
  Widget build(BuildContext context) {
    final otp = _challenges != null;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Icon(Icons.quiz_rounded, size: 64, color: Color(0xFF0B6560)),
                const SizedBox(height: 8),
                const Text('سُؤال AI', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
                const SizedBox(height: 28),
                if (!otp) ...[
                  TextField(controller: _id, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'البريد أو رقم الهاتف'), textDirection: TextDirection.ltr),
                  const SizedBox(height: 14),
                  TextField(controller: _pw, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور'), onSubmitted: (_) => _busy ? null : _login()),
                ] else ...[
                  Text('أدخل الرمز المكوّن من 6 أرقام الذي وصلك.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 14),
                  TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, letterSpacing: 8), decoration: const InputDecoration(labelText: 'الرمز'), textDirection: TextDirection.ltr),
                ],
                if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center)),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy ? null : (otp ? _verify : _login),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(otp ? 'تأكيد' : 'تسجيل الدخول'),
                ),
                if (otp) TextButton(onPressed: _busy ? null : () => setState(() { _challenges = null; _code.clear(); _err = null; }), child: const Text('رجوع')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
