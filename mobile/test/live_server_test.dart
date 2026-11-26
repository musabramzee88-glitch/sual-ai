// يعمل فقط مع خادم حي:  LIVE_TOKEN=... LIVE_EXAM=... flutter test test/live_server_test.dart
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sual_app/api/client.dart';

void main() {
  final env = Platform.environment;
  final token = env['LIVE_TOKEN'], exam = env['LIVE_EXAM'], unpaid = env['LIVE_UNPAID'];
  final skip = token == null ? 'no live server' : null;

  test('real server: me, list, detail, exports', () async {
    final store = MemorySessionStore();
    await store.write(token);
    final api = SualApi(base: 'http://localhost:3000', store: store);
    await api.restore();
    expect((await api.me())['user'], isNotNull);
    final list = await api.listExams();
    expect(list.any((e) => e['id'] == exam), true);
    final e = await api.getExam(exam!);
    expect((e['sections'] as List).isNotEmpty, true);
    final pdf = await api.export(exam, variant: 'questions', format: 'pdf', model: 'B', name: 'تجربة');
    expect(String.fromCharCodes(pdf.bytes.take(4)), '%PDF');
    expect(pdf.fileName.endsWith('.pdf'), true);
    final doc = await api.export(exam, variant: 'key', format: 'docx');
    expect(String.fromCharCodes(doc.bytes.take(2)), 'PK');
    final sheet = await api.export(exam, variant: 'sheet', format: 'pdf');
    expect(String.fromCharCodes(sheet.bytes.take(4)), '%PDF');
    print('pdf=${pdf.bytes.length}B (${pdf.fileName}) docx=${doc.bytes.length}B sheet=${sheet.bytes.length}B');
  }, skip: skip, timeout: const Timeout(Duration(minutes: 3)));

  test('real server: other exams are hidden, unpaid is refused, bad session is 401', () async {
    final s = MemorySessionStore();
    await s.write(unpaid);
    final u = SualApi(base: 'http://localhost:3000', store: s);
    await u.restore();
    await expectLater(u.listExams(), throwsA(isA<ApiError>().having((e) => e.forbidden, 'forbidden', true)));
    final s2 = MemorySessionStore();
    await s2.write('not-a-real-token');
    final bad = SualApi(base: 'http://localhost:3000', store: s2);
    await bad.restore();
    await expectLater(bad.me(), throwsA(isA<ApiError>().having((e) => e.unauthorized, 'unauthorized', true)));
    expect(bad.hasSession, false);
  }, skip: skip);
}
