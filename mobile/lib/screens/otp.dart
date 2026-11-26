import 'package:flutter/material.dart';
import '../api/client.dart';
import 'errors.dart';

/// إدخال رمز التحقق: رمز واحد عادةً، أو رمزان (بريد + هاتف) حين يكون «الأمان الإضافي» مفعّلاً
class OtpForm extends StatefulWidget {
  const OtpForm({super.key, required this.api, required this.challenges, required this.onDone, required this.onBack});
  final SualApi api;
  final List<Map<String, dynamic>> challenges;
  final VoidCallback onDone;
  final VoidCallback onBack;
  @override
  State<OtpForm> createState() => _OtpFormState();
}

class _OtpFormState extends State<OtpForm> {
  late final _codes = [for (final _ in widget.challenges) TextEditingController()];
  bool _busy = false, _remember = true;
  String? _err;

  Future<void> _verify() async {
    setState(() { _busy = true; _err = null; });
    try {
      await widget.api.verifyOtp([
        for (var i = 0; i < widget.challenges.length; i++) {'challengeId': widget.challenges[i]['challengeId'] as String, 'code': _codes[i].text.trim()},
      ], remember: _remember);
      widget.onDone();
    } catch (e) {
      setState(() => _err = messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend(String id) async {
    try {
      await widget.api.resendOtp(id);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('أُرسل رمز جديد.')));
    } catch (e) {
      if (mounted) setState(() => _err = messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final two = widget.challenges.length > 1;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(two ? 'الأمان الإضافي مفعّل: أدخل الرمزين معاً.' : 'أدخل الرمز المكوّن من 6 أرقام.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
      const SizedBox(height: 12),
      for (var i = 0; i < widget.challenges.length; i++) ...[
        Text('${widget.challenges[i]['channel'] == 'PHONE' ? 'رمز الهاتف' : 'رمز البريد'} — أُرسل إلى ${widget.challenges[i]['masked'] ?? ''}', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 6),
        TextField(
          controller: _codes[i],
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          textDirection: TextDirection.ltr,
          style: const TextStyle(fontSize: 24, letterSpacing: 8),
          decoration: InputDecoration(counterText: '', suffixIcon: IconButton(tooltip: 'إعادة الإرسال', icon: const Icon(Icons.refresh), onPressed: () => _resend(widget.challenges[i]['challengeId'] as String))),
        ),
        const SizedBox(height: 10),
      ],
      if (!two) CheckboxListTile(value: _remember, onChanged: (v) => setState(() => _remember = v ?? true), title: const Text('تذكّر هذا الجهاز'), contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading),
      if (_err != null) Text(_err!, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      const SizedBox(height: 10),
      FilledButton(
        onPressed: _busy ? null : _verify,
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('تأكيد'),
      ),
      TextButton(onPressed: _busy ? null : widget.onBack, child: const Text('رجوع')),
    ]);
  }
}
