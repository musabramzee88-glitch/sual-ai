import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sual_app/api/client.dart';
import 'package:sual_app/main.dart';

http.Response j(Object b, {int s = 200}) => http.Response(jsonEncode(b), s, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('without a session the login screen shows; after login the exams list shows', (t) async {
    final api = SualApi(base: 'http://x', client: MockClient((r) async {
      if (r.url.path.endsWith('/auth/login')) return http.Response(jsonEncode({'data': {'step': 'done'}}), 200, headers: {'set-cookie': 'sual_session=abc; Path=/'});
      if (r.url.path.endsWith('/exams')) {
        return j({'data': [{'id': 'e1', 'title': 'امتحان الرياضيات', 'status': 'READY', 'totalMarks': 100, 'subject': {'nameAr': 'الرياضيات'}, 'grade': {'nameAr': 'الثالث المتوسط'}}]});
      }
      return j({'error': {'code': 'NOT_FOUND'}}, s: 404);
    }));
    await t.pumpWidget(SualApp(api: api));
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    await t.enterText(find.byType(TextField).first, 'a@b.co');
    await t.enterText(find.byType(TextField).last, 'password1');
    await t.tap(find.text('تسجيل الدخول'));
    await t.pumpAndSettle();
    expect(find.text('امتحاناتي'), findsOneWidget);
    expect(find.text('امتحان الرياضيات'), findsOneWidget);
  });

  testWidgets('unsubscribed account sees a neutral message with no payment link', (t) async {
    final api = SualApi(base: 'http://x', client: MockClient((r) async {
      if (r.url.path.endsWith('/auth/login')) return http.Response(jsonEncode({'data': {'step': 'done'}}), 200, headers: {'set-cookie': 'sual_session=abc; Path=/'});
      return j({'error': {'code': 'SUBSCRIPTION_REQUIRED'}}, s: 402);
    }));
    await t.pumpWidget(SualApp(api: api));
    await t.enterText(find.byType(TextField).first, 'a@b.co');
    await t.enterText(find.byType(TextField).last, 'password1');
    await t.tap(find.text('تسجيل الدخول'));
    await t.pumpAndSettle();
    expect(find.text('حسابك غير مفعّل لهذه الخدمة.'), findsOneWidget);
    expect(find.textContaining('اشترك'), findsNothing);
    expect(find.textContaining('http'), findsNothing);
  });
}
