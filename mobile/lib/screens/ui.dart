import 'package:flutter/material.dart';
import 'errors.dart';

const brand = Color(0xFF0B6560);
const amber = Color(0xFFF5A524);
const paper = Color(0xFFF6F3EC);

/// أرقام عربية-هندية (١٢٣) كما في الورقة
String ar(num n) {
  final s = n == n.roundToDouble() ? n.toInt().toString() : n.toString();
  const d = '٠١٢٣٤٥٦٧٨٩';
  return s.split('').map((c) => RegExp(r'\d').hasMatch(c) ? d[int.parse(c)] : (c == '.' ? '٫' : c)).join();
}

void toast(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(msg)));

/// ينفّذ طلباً ويعرض الخطأ إن فشل. يعيد true عند النجاح.
Future<bool> guarded(BuildContext context, Future<void> Function() f, {String? ok}) async {
  try {
    await f();
    if (ok != null && context.mounted) toast(context, ok);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, messageOf(e));
    return false;
  }
}

Future<bool> confirm(BuildContext context, String title, {String? body, String yes = 'تأكيد', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(yes),
        ),
      ],
    ),
  );
  return r ?? false;
}

/// نافذة إدخال نص واحد (أو رقم)
Future<String?> promptText(BuildContext context, String title, {String initial = '', String? hint, bool number = false, int maxLines = 1}) async {
  final c = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: c,
        autofocus: true,
        maxLines: maxLines,
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.multiline,
        decoration: InputDecoration(hintText: hint),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: const Text('حفظ')),
      ],
    ),
  );
}

/// مؤشر انتظار يغطي الشاشة أثناء عملية طويلة (التوليد قد يأخذ دقيقة)
Future<T?> withBusy<T>(BuildContext context, String label, Future<T> Function() f) async {
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => PopScope(
      canPop: false,
      child: AlertDialog(content: Row(children: [const CircularProgressIndicator(), const SizedBox(width: 20), Expanded(child: Text(label))])),
    ),
  );
  try {
    return await f();
  } finally {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text, this.action, this.onTap, this.icon = Icons.info_outline});
  final String text;
  final String? action;
  final VoidCallback? onTap;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 48, color: brand.withValues(alpha: .5)),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (action != null) ...[const SizedBox(height: 14), FilledButton(onPressed: onTap, child: Text(action!))],
          ]),
        ),
      );
}
