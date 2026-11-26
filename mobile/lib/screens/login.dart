import 'package:flutter/material.dart';
import '../api/client.dart';
import 'brand.dart';
import 'errors.dart';
import 'otp.dart';
import 'register.dart';
import 'ui.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.api, required this.onDone});
  final SualApi api;
  final VoidCallback onDone;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _id = TextEditingController(), _pw = TextEditingController();
  List<Map<String, dynamic>>? _challenges;
  bool _busy = false;
  String? _err;

  Future<void> _login() async {
    setState(() { _busy = true; _err = null; });
    try {
      final r = await widget.api.login(_id.text, _pw.text);
      if (r.needsOtp) {
        setState(() => _challenges = r.challenges);
      } else {
        widget.onDone();
      }
    } catch (e) {
      setState(() => _err = messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgot() async {
    final v = await promptText(context, 'نسيت كلمة المرور', initial: _id.text, hint: 'البريد أو رقم الهاتف');
    if (v == null || v.isEmpty || !mounted) return;
    await guarded(context, () => widget.api.forgotPassword(v), ok: 'إن كان الحساب موجوداً فسيصلك رابط لتعيين كلمة مرور جديدة.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Center(child: LogoMark(size: 84)),
                const SizedBox(height: 10),
                const Text('سُؤال AI', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
                const Text('امتحانات احترافية من منهجك', textAlign: TextAlign.center),
                const SizedBox(height: 28),
                if (_challenges != null)
                  OtpForm(api: widget.api, challenges: _challenges!, onDone: widget.onDone, onBack: () => setState(() => _challenges = null))
                else ...[
                  TextField(controller: _id, keyboardType: TextInputType.emailAddress, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'البريد أو رقم الهاتف')),
                  const SizedBox(height: 14),
                  TextField(controller: _pw, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور'), onSubmitted: (_) => _busy ? null : _login()),
                  if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _busy ? null : _login,
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('تسجيل الدخول'),
                  ),
                  Wrap(alignment: WrapAlignment.spaceBetween, children: [
                    TextButton(onPressed: _forgot, child: const Text('نسيت كلمة المرور؟')),
                    TextButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RegisterPage(api: widget.api, onDone: () { Navigator.of(context).pop(); widget.onDone(); }))),
                      child: const Text('إنشاء حساب'),
                    ),
                  ]),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
