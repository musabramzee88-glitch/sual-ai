import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sual_app/api/client.dart';
import 'package:sual_app/main.dart';
import 'package:sual_app/screens/register.dart';
import 'package:sual_app/screens/templates.dart';
import 'widget_test.dart' show exam;

http.Response j(Object b) => http.Response(jsonEncode(b), 200, headers: {'content-type': 'application/json'});

final cur = {
  'id': 'c1', 'title': 'الرياضيات', 'kind': 'TEXTBOOK', 'part': 1, 'language': 'AR', 'pageCount': 220,
  'grade': {'code': 'G9', 'nameAr': 'الثالث المتوسط'}, 'subject': {'code': 'MATH', 'nameAr': 'الرياضيات', 'questionTypes': ['MCQ', 'COMPUTE', 'PROBLEM', 'TRUE_FALSE']},
  'track': {'code': 'GEN', 'nameAr': 'عام'}, 'chapters': [for (var i = 1; i <= 6; i++) {'id': 'ch$i', 'title': 'الفصل $i: عنوان طويل نسبياً لاختبار الالتفاف على الشاشات الصغيرة', 'pageStart': i * 10, 'pageEnd': i * 10 + 9}],
};
final tpl = {'id': 't1', 'preset': false, 'name': 'قالب مدرستي', 'layout': 'SCHOOL', 'pageSize': 'A4', 'orientation': 'PORTRAIT', 'fontFamily': 'Traditional Arabic', 'fontSizePt': 14, 'lineSpacing': 1.65, 'margins': {'top': 12, 'right': 14, 'bottom': 12, 'left': 14}, 'showPageNumbers': true, 'visible': {}, 'values': {}, 'answerLines': 0, 'footerNote': 'مع تمنياتنا لكم بالنجاح', 'signLine': true, 'accent': null, 'maxPages': 2, 'logoAssetId': null, 'isDefault': true};

Future<http.Response> handle(http.Request r) async {
      final p = r.url.path.replaceFirst('/api/v1', '');
      if (p == '/auth/login') return http.Response(jsonEncode({'data': {'step': 'done'}}), 200, headers: {'set-cookie': 'sual_session=abc; Path=/'});
      if (p == '/exams') return j({'data': [exam]});
      if (p == '/exams/e1') return j({'data': exam});
      if (p == '/exams/options') return j({'data': [cur]});
      if (p == '/exams/structures') return j({'data': [{'id': 'e0', 'title': 'امتحان سابق', 'curriculumId': 'c1', 'kind': 'MONTHLY', 'difficulty': 'MIXED', 'durationMinutes': 60, 'totalMarks': 100, 'sections': [{'type': 'MCQ', 'count': 5}]}]});
      if (p == '/templates') return j({'data': [tpl, {...tpl, 'id': 'preset:CLASSIC', 'preset': true, 'name': 'كلاسيكي'}]});
      if (p == '/templates/logos') return j({'data': []});
      if (p == '/geo/governorates') return j({'data': [{'code': 'BGD', 'nameAr': 'بغداد', 'directorates': [{'code': 'R1', 'nameAr': 'مديرية تربية بغداد الرصافة الأولى'}]}]});
      if (p == '/auth/channels') return j({'data': {'email': true, 'phone': true}});
      if (p == '/me') return j({'data': {'user': {'fullName': 'مدرس باسم طويل جداً لاختبار العرض', 'email': 'teacher.with.long.email@example.com', 'phone': '+9647700000000'}, 'access': 'SUBSCRIPTION_ACTIVE'}});
      if (p == '/subscription') return j({'data': {'access': 'SUBSCRIPTION_ACTIVE', 'current': {'plan': {'nameAr': 'باقة سنوية'}, 'endsAt': '2027-06-30T00:00:00Z'}}});
      if (p == '/account/security') return j({'data': {'loginSecurity': 'SINGLE', 'emailVerified': true, 'phoneVerified': true}});
      return j({'data': {'ok': true}});
}

MockClient server() => MockClient(handle);

void main() {
  setUp(() {
    final v = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    v.physicalSize = const Size(360 * 3, 640 * 3);
    v.devicePixelRatio = 3;
  });

  Future<SualApi> signedIn(WidgetTester t) async {
    final api = SualApi(base: 'http://x', client: server());
    await t.pumpWidget(SualApp(api: api));
    await t.enterText(find.byType(TextField).first, 'a@b.co');
    await t.enterText(find.byType(TextField).last, 'password1');
    await t.tap(find.text('تسجيل الدخول'));
    await t.pumpAndSettle();
    return api;
  }

  testWidgets('all tabs and the editor fit a 360px phone', (t) async {
    await signedIn(t);
    for (final tab in ['جديد', 'القوالب', 'الحساب', 'امتحاناتي']) {
      await t.tap(find.text(tab).last);
      await t.pumpAndSettle();
    }
    await t.tap(find.text('امتحان الرياضيات'));
    await t.pumpAndSettle();
    await t.tap(find.byIcon(Icons.visibility));
    await t.pumpAndSettle();
  });

  testWidgets('wizard with a curriculum, chapters, sections and structure fits', (t) async {
    await signedIn(t);
    await t.tap(find.text('جديد').last);
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('بنفس هيكل امتحان سابق'));
    await t.pumpAndSettle();
    await t.tap(find.text('امتحان سابق').last);
    await t.pumpAndSettle();
    expect(find.textContaining('الفصل 1'), findsOneWidget);
    await t.scrollUntilVisible(find.text('٤ الإعدادات'), 300, scrollable: find.byType(Scrollable).first);
    await t.pumpAndSettle();
  });

  wizardTyping();
  noChapters();

  testWidgets('register and template editor fit', (t) async {
    final api = SualApi(base: 'http://x', client: server());
    await t.pumpWidget(MaterialApp(home: RegisterPage(api: api, onDone: () {})));
    await t.pumpAndSettle();
    await t.pumpWidget(MaterialApp(home: TemplateEditor(api: api, initial: tpl)));
    await t.pumpAndSettle();
  });
}

void wizardTyping() {
  testWidgets('typing the total marks keeps the field focused for all digits', (t) async {
    final api = SualApi(base: 'http://x', client: server());
    await t.pumpWidget(SualApp(api: api));
    await t.enterText(find.byType(TextField).first, 'a@b.co');
    await t.enterText(find.byType(TextField).last, 'password1');
    await t.tap(find.text('تسجيل الدخول'));
    await t.pumpAndSettle();
    await t.tap(find.text('جديد').last);
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('بنفس هيكل امتحان سابق'));
    await t.pumpAndSettle();
    await t.tap(find.text('امتحان سابق').last);
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.text('٤ الإعدادات'), 300, scrollable: find.byType(Scrollable).first);
    await t.pumpAndSettle();
    final total = find.widgetWithText(TextField, 'الدرجة الكلية');
    await t.tap(total);
    await t.pumpAndSettle();
    final focus = FocusManager.instance.primaryFocus;
    for (final text in ['1', '10', '100']) {
      await t.enterText(total, text);
      await t.pump();
      expect(FocusManager.instance.primaryFocus, same(focus), reason: 'focus must survive typing "$text"');
      expect((t.widget(total) as TextField).controller!.text, text);
    }
  });
}

void noChapters() {
  testWidgets('a book without usable chapters switches to a page range with an explanation', (t) async {
    final api = SualApi(base: 'http://x', client: MockClient((r) async {
      if (r.url.path.endsWith('/exams/options')) return j({'data': [{...cur, 'chapters': [{'id': 'x', 'title': 'فصل بلا صفحات', 'pageStart': null, 'pageEnd': null}]}]});
      return handle(r);
    }));
    await t.pumpWidget(SualApp(api: api));
    await t.enterText(find.byType(TextField).first, 'a@b.co');
    await t.enterText(find.byType(TextField).last, 'password1');
    await t.tap(find.text('تسجيل الدخول'));
    await t.pumpAndSettle();
    await t.tap(find.text('جديد').last);
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).first);
    await t.pumpAndSettle();
    await t.tap(find.text('الثالث المتوسط').last);
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await t.pumpAndSettle();
    await t.tap(find.text('الرياضيات').last);
    await t.pumpAndSettle();
    expect(find.textContaining('لم تُحدَّد له فصول بعد'), findsOneWidget);
    expect(find.text('فصل بلا صفحات'), findsNothing);
    expect(find.widgetWithText(TextField, 'من صفحة'), findsOneWidget);
  });
}
