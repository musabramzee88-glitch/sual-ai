import 'package:flutter/material.dart';

/// شعار «سُؤال AI» (نفس رسم brand/icon.svg): علامة استفهام عربية تنبت من كتاب مفتوح
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: CustomPaint(painter: _LogoPainter()));
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 100;
    canvas.scale(k, k);
    final r = RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 100, 100), const Radius.circular(23));
    canvas.drawRRect(r, Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF0F7F78), Color(0xFF0A5853)]).createShader(const Rect.fromLTWH(0, 0, 100, 100)));
    canvas.translate(9, 11);
    canvas.scale(.82, .82);
    final left = Path()..moveTo(50, 82)..cubicTo(40, 76, 27, 75, 13, 78)..lineTo(13, 52)..cubicTo(27, 49, 40, 50, 50, 56)..close();
    final right = Path()..moveTo(50, 82)..cubicTo(60, 76, 73, 75, 87, 78)..lineTo(87, 52)..cubicTo(73, 49, 60, 50, 50, 56)..close();
    canvas.drawPath(left, Paint()..color = Colors.white);
    canvas.drawPath(right, Paint()..color = Colors.white.withValues(alpha: .78));
    // علامة الاستفهام العربية (مرآة الإنكليزية)
    canvas.save();
    canvas.translate(100, 0);
    canvas.scale(-1, 1);
    final q = Path()
      ..moveTo(37, 23)..cubicTo(37, 14, 43.5, 9, 50.5, 9)..cubicTo(58, 9, 63.5, 14, 63.5, 21.5)
      ..cubicTo(63.5, 28.5, 58, 31, 54, 34)..cubicTo(51, 36.3, 50, 38.5, 50, 43)..lineTo(50, 47);
    canvas.drawPath(q, Paint()..color = const Color(0xFFF5A524)..style = PaintingStyle.stroke..strokeWidth = 9.5..strokeCap = StrokeCap.round);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
