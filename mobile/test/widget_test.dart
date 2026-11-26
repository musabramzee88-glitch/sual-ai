import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sual_app/api/client.dart';
import 'package:sual_app/main.dart';

http.Response j(Object b, {int s = 200, Map<String, String> h = const {}}) => http.Response(jsonEncode(b), s, headers: {'content-type': 'application/json', ...h});

final exam = {
  'id': 'e1', 'title': 'امتحان الرياضيات', 'status': 'READY', 'totalMarks': 20, 'durationMinutes': 60, 'sectionsToAnswer': null, 'firstRequired': true,
  'subject': {'nameAr': 'الرياضيات'}, 'grade': {'nameAr': 'الثالث المتوسط'},
  'sections': [
    {'id': 's1', 'type': 'MCQ', 'instruction': 'اختر الإجابة الصحيحة:', 'marks': 10, 'answerCount': null, 'branches': [
      {'id': 'q1', 'prompt': 'حل المعادلة x^2 = 4', 'options': ['2', '3'], 'answer': '2', 'marks': 5, 'imageAssetId': null, 'table': null},
      {'id': 'q2', 'prompt': 'ناتج 2*3', 'options': ['6', '5'], 'answer': '6', 'marks': 5, 'imageAssetId': null, 'table': {'header': true, 'cells': [['س', 'ص'], ['1', '2']]}},
    ]},
    {'id': 's2', 'type': 'COMPLETE_VERSE', 'instruction': 'أكمل الآيات:', 'marks': 10, 'answerCount': null, 'branches': [
      {'id': 'q3', 'prompt': 'إنا أعطيناك...', 'options': null, 'answer': 'الكوثر', 'marks': 10, 'imageAssetId': null, 'table': null},
    ]},
  ],
};

MockClient server(List<String> calls, {bool paid = true}) => MockClient((r) async {
      final p = r.url.path.replaceFirst('/api/v1', '');
      calls.add('${r.method} $p');
      if (p == '/auth/login') return j({'data': {'step': 'done'}}, h: {'set-cookie': 'sual_session=abc; Path=/'});
      if (!paid && p.startsWith('/exams')) return j({'error': {'code': 'SUBSCRIPTION_REQUIRED'}}, s: 402);
      if (p == '/exams' && r.method == 'GET') return j({'data': [exam]});
      if (p == '/exams/e1' && r.method == 'GET') return j({'data': exam});
      if (p == '/exams/options') return j({'data': []});
      if (p == '/exams/structures') return j({'data': []});
      if (p == '/templates') return j({'data': []});
      if (p == '/me') return j({'data': {'user': {'fullName': 'مدرس', 'email': 'a@b.co', 'phone': '+9647700000000'}, 'access': paid ? 'SUBSCRIPTION_ACTIVE' : 'AWAITING_PAYMENT'}});
      if (p == '/subscription') return j({'data': {'access': paid ? 'SUBSCRIPTION_ACTIVE' : 'AWAITING_PAYMENT', 'current': null, 'pending': null}});
      if (p == '/account/security') return j({'data': {'loginSecurity': 'SINGLE', 'emailVerified': true, 'phoneVerified': false}});
      return j({'data': {'ok': true}});
    });

Future<void> signIn(WidgetTester t, SualApi api) async {
  await t.pumpWidget(SualApp(api: api));
  await t.enterText(find.byType(TextField).first, 'a@b.co');
  await t.enterText(find.byType(TextField).last, 'password1');
  await t.tap(find.text('تسجيل الدخول'));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('login leads to the four tabs and the exam list', (t) async {
    final calls = <String>[];
    await signIn(t, SualApi(base: 'http://x', client: server(calls)));
    for (final tab in ['امتحاناتي', 'جديد', 'القوالب', 'الحساب']) {
      expect(find.text(tab), findsWidgets);
    }
    expect(find.text('امتحان الرياضيات'), findsOneWidget);
  });

  testWidgets('editor shows sections, pretty math, tables, verbatim warning, and answers on demand', (t) async {
    final calls = <String>[];
    await signIn(t, SualApi(base: 'http://x', client: server(calls)));
    await t.tap(find.text('امتحان الرياضيات'));
    await t.pumpAndSettle();
    expect(find.textContaining('س١/ اختر الإجابة الصحيحة:'), findsOneWidget);
    expect(find.textContaining('x² = 4'), findsOneWidget);
    expect(find.textContaining('2 × 3'), findsOneWidget);
    expect(find.text('س'), findsOneWidget); // خلية الجدول
    expect(find.textContaining('طابق النص بالكتاب'), findsOneWidget);
    expect(find.textContaining('الجواب:'), findsNothing);
    await t.tap(find.byIcon(Icons.visibility));
    await t.pump();
    expect(find.textContaining('الجواب:'), findsNWidgets(3));
  });

  testWidgets('editor actions call the right endpoints (delete branch after confirm, regenerate)', (t) async {
    final calls = <String>[];
    await signIn(t, SualApi(base: 'http://x', client: server(calls)));
    await t.tap(find.text('امتحان الرياضيات'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('خيارات الفرع').first);
    await t.pumpAndSettle();
    await t.tap(find.text('سؤال بديل'));
    await t.pumpAndSettle();
    expect(calls, contains('POST /exams/questions/q1'));
    await t.tap(find.byTooltip('خيارات الفرع').first);
    await t.pumpAndSettle();
    await t.tap(find.text('حذف').last);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(FilledButton, 'حذف'));
    await t.pumpAndSettle();
    expect(calls, contains('DELETE /exams/questions/q1'));
  });

  testWidgets('unsubscribed account sees a neutral message with no payment link anywhere', (t) async {
    final calls = <String>[];
    await signIn(t, SualApi(base: 'http://x', client: server(calls, paid: false)));
    expect(find.text('حسابك غير مفعّل لهذه الخدمة.'), findsWidgets);
    expect(find.textContaining('اشتراك'), findsNothing);
    await t.tap(find.text('الحساب').last);
    await t.pumpAndSettle();
    expect(find.textContaining('اشترك'), findsNothing);
    expect(find.textContaining('اشتراك'), findsNothing);
    expect(find.textContaining('دفع'), findsNothing);
    expect(find.textContaining('سعر'), findsNothing);
  });
}
