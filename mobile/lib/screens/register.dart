import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/client.dart';
import 'errors.dart';
import 'otp.dart';

/// إنشاء حساب مدرس (نفس حقول الموقع)، ثم التحقق بالرمز
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key, required this.api, required this.onDone});
  final SualApi api;
  final VoidCallback onDone;
  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _phone = TextEditingController(), _email = TextEditingController();
  final _pw = TextEditingController(), _pw2 = TextEditingController(), _school = TextEditingController(), _spec = TextEditingController();
  List<Map<String, dynamic>> _govs = [];
  String? _gov, _dir;
  bool _phoneOk = false, _busy = false;
  String _channel = 'EMAIL';
  String? _err;
  List<Map<String, dynamic>>? _challenges;

  @override
  void initState() {
    super.initState();
    widget.api.governorates().then((g) => mounted ? setState(() => _govs = g) : null).catchError((_) {});
    widget.api.channels().then((c) => mounted ? setState(() => _phoneOk = c['phone'] == true) : null).catchError((_) {});
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _err = null; });
    try {
      final r = await widget.api.register({
        'fullName': _name.text.trim(), 'phone': _phone.text.trim(), 'email': _email.text.trim(),
        'password': _pw.text, 'passwordConfirm': _pw2.text, 'schoolName': _school.text.trim(),
        'governorateCode': _gov, 'directorateCode': _dir, 'specialization': _spec.text.trim(), 'verificationChannel': _channel,
      });
      setState(() => _challenges = r.challenges);
    } catch (e) {
      setState(() => _err = messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _req(String? v) => (v == null || v.trim().length < 2) ? 'مطلوب' : null;

  @override
  Widget build(BuildContext context) {
    final dirs = (_govs.firstWhere((g) => g['code'] == _gov, orElse: () => {'directorates': []})['directorates'] as List).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: const Text('إنشاء حساب')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _challenges != null
              ? OtpForm(api: widget.api, challenges: _challenges!, onDone: widget.onDone, onBack: () => setState(() => _challenges = null))
              : Form(
                  key: _form,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'الاسم الكامل'), validator: (v) => (v ?? '').trim().length < 3 ? 'اكتب اسمك الكامل' : null),
                    const SizedBox(height: 12),
                    TextFormField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم الهاتف', hintText: '07XXXXXXXXX'), validator: _req),
                    const SizedBox(height: 12),
                    TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'البريد الإلكتروني'), validator: (v) => (v ?? '').contains('@') ? null : 'بريد غير صالح'),
                    const SizedBox(height: 12),
                    TextFormField(controller: _pw, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور', helperText: '10 أحرف على الأقل مع حرف ورقم'), validator: (v) => (v ?? '').length < 10 ? 'قصيرة' : null),
                    const SizedBox(height: 12),
                    TextFormField(controller: _pw2, obscureText: true, decoration: const InputDecoration(labelText: 'تأكيد كلمة المرور'), validator: (v) => v != _pw.text ? 'غير متطابقة' : null),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _gov,
                      decoration: const InputDecoration(labelText: 'المحافظة'),
                      items: [for (final g in _govs) DropdownMenuItem(value: g['code'] as String, child: Text(g['nameAr'] as String))],
                      onChanged: (v) => setState(() { _gov = v; _dir = null; }),
                      validator: (v) => v == null ? 'اختر المحافظة' : null,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      key: ValueKey(_gov),
                      initialValue: _dir,
                      decoration: const InputDecoration(labelText: 'المديرية'),
                      items: [for (final d in dirs) DropdownMenuItem(value: d['code'] as String, child: Text(d['nameAr'] as String, overflow: TextOverflow.ellipsis))],
                      onChanged: (v) => setState(() => _dir = v),
                      validator: (v) => v == null ? 'اختر المديرية' : null,
                      isExpanded: true,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(controller: _school, decoration: const InputDecoration(labelText: 'اسم المدرسة'), validator: _req),
                    const SizedBox(height: 12),
                    TextFormField(controller: _spec, decoration: const InputDecoration(labelText: 'الاختصاص'), validator: _req),
                    const SizedBox(height: 12),
                    if (_phoneOk)
                      SegmentedButton<String>(
                        segments: const [ButtonSegment(value: 'EMAIL', label: Text('التحقق بالبريد')), ButtonSegment(value: 'PHONE', label: Text('برسالة SMS'))],
                        selected: {_channel},
                        onSelectionChanged: (s) => setState(() => _channel = s.first),
                      ),
                    if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('إنشاء الحساب'),
                    ),
                    const SizedBox(height: 8),
                    Wrap(alignment: WrapAlignment.center, children: [
                      const Text('بإنشاء حساب فإنك توافق على '),
                      InkWell(onTap: () => launchUrl(Uri.parse('$apiBase/terms')), child: const Text('الشروط', style: TextStyle(decoration: TextDecoration.underline))),
                      const Text(' و'),
                      InkWell(onTap: () => launchUrl(Uri.parse('$apiBase/privacy')), child: const Text('الخصوصية', style: TextStyle(decoration: TextDecoration.underline))),
                    ]),
                  ]),
                ),
        ),
      ),
    );
  }
}
