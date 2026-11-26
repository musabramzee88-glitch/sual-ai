// يعمل فقط مع خادم حي (يتخطّى نفسه بدونه):
//   LIVE_TOKEN=… LIVE_EXAM=… LIVE_UNPAID=… flutter test test/live_server_test.dart
// يمرّ على كل عملية في التطبيق بالخادم الحقيقي. التوليد بالذكاء الاصطناعي يحتاج مفتاح Gemini؛ بدونه يُتحقق فقط أن الخطأ مفهوم.
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:sual_app/api/client.dart';
import 'package:sual_app/screens/errors.dart';

/// PNG حقيقي 1×1 (أحمر)
final png = Uint8List.fromList([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xDE,
  0, 0, 0, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0, 0, 0x03, 0x01, 0x01, 0, 0x18, 0xDD, 0x8D, 0xB0, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

Future<SualApi> as(String? token) async {
  final s = MemorySessionStore();
  await s.write(token);
  final api = SualApi(base: Platform.environment['LIVE_BASE'] ?? 'http://localhost:3000', store: s);
  await api.restore();
  return api;
}

List<Map<String, dynamic>> secs(Map<String, dynamic> e) => (e['sections'] as List).cast<Map<String, dynamic>>();
List<Map<String, dynamic>> br(Map<String, dynamic> s) => (s['branches'] as List).cast<Map<String, dynamic>>();

void main() {
  final env = Platform.environment;
  final token = env['LIVE_TOKEN'], examId = env['LIVE_EXAM'], unpaid = env['LIVE_UNPAID'];
  final skip = token == null ? 'no live server' : null;
  const t = Timeout(Duration(minutes: 4));

  test('account screens: me, subscription, security, channels, governorates, options, structures', () async {
    final api = await as(token);
    expect((await api.me())['user'], isNotNull);
    expect((await api.subscription())['access'], 'SUBSCRIPTION_ACTIVE');
    expect((await api.security())['loginSecurity'], isNotNull);
    expect((await api.channels())['email'], true);
    expect(await api.governorates(), isNotEmpty);
    expect(await api.examOptions(), isA<List>());
    expect(await api.structures(), isA<List>());
  }, skip: skip, timeout: t);

  test('editor: every edit the website offers', () async {
    final api = await as(token);
    var e = await api.getExam(examId!);
    final s1 = secs(e).first, q1 = br(s1).first;

    await api.questionPatch(q1['id'] as String, {'prompt': 'نص معدّل من التطبيق x^2'});
    e = await api.getExam(examId);
    expect(br(secs(e).first).first['prompt'], 'نص معدّل من التطبيق x^2');
    await api.questionAction(q1['id'] as String, 'undo');
    e = await api.getExam(examId);
    expect(br(secs(e).first).first['prompt'], isNot('نص معدّل من التطبيق x^2'));

    final before = br(secs(e).first).length;
    await api.questionAction(q1['id'] as String, 'duplicate');
    e = await api.getExam(examId);
    expect(br(secs(e).first).length, before + 1);
    final ids = br(secs(e).first).map((b) => b['id'] as String).toList().reversed.toList();
    await api.sectionAction(s1['id'] as String, {'action': 'reorder', 'ids': ids});
    e = await api.getExam(examId);
    expect(br(secs(e).first).first['id'], ids.first);
    await api.deleteQuestion(ids.first);

    await api.sectionAction(s1['id'] as String, {'action': 'addManual', 'prompt': 'سؤال يدوي', 'answer': 'جواب يدوي'});
    await api.sectionPatch(s1['id'] as String, {'instruction': 'تعليمة جديدة:', 'marks': 12});
    e = await api.getExam(examId);
    expect(secs(e).first['instruction'], 'تعليمة جديدة:');
    await api.sectionPatch(s1['id'] as String, {'answerCount': 2});
    e = await api.getExam(examId);
    expect(secs(e).first['answerCount'], 2);
    await api.sectionPatch(s1['id'] as String, {'answerCount': null});

    await api.sectionAction(s1['id'] as String, {'action': 'duplicate'});
    e = await api.getExam(examId);
    expect(secs(e).length, 2);
    final order = secs(e).map((s) => s['id'] as String).toList().reversed.toList();
    await api.examAction(examId, {'action': 'reorderSections', 'ids': order});
    await api.examAction(examId, {'action': 'meta', 'title': 'عنوان من التطبيق', 'durationMinutes': 90, 'sectionsToAnswer': 1, 'firstRequired': true});
    await api.examAction(examId, {'action': 'distribute', 'total': 40, 'mode': 'smart'});
    e = await api.getExam(examId);
    expect(e['title'], 'عنوان من التطبيق');
    expect(e['sectionsToAnswer'], 1);
    await api.deleteSection(secs(e).first['id'] as String);

    final q = br(secs(await api.getExam(examId)).first).first['id'] as String;
    await api.setTable(q, {'header': true, 'cells': [['س', 'ص'], ['1', '2']]});
    await api.uploadImage(q, png, 'dot.png');
    e = await api.getExam(examId);
    expect(br(secs(e).first).first['imageAssetId'], isNotNull);
    expect(br(secs(e).first).first['table'], isNotNull);
    await api.deleteImage(q);
    await api.setTable(q, null);

    await api.examAction(examId, {'action': 'header', 'templateId': 'preset:SCHOOL', 'values': {'school': 'إعدادية التطبيق', 'teacher': 'أ. مدرس'}});
  }, skip: skip, timeout: t);

  test('paper: PDF of every variant and model, Word, ZIP', () async {
    final api = await as(token);
    for (final v in ['questions', 'answers', 'key', 'sheet']) {
      final d = await api.export(examId!, variant: v, model: v == 'questions' ? 'C' : 'A', template: 'preset:CLASSIC');
      expect(String.fromCharCodes(d.bytes.take(4)), '%PDF', reason: v);
    }
    expect(String.fromCharCodes((await api.export(examId!, format: 'docx')).bytes.take(2)), 'PK');
    final z = await api.exportZip(examId, models: ['A', 'B'], variants: ['questions', 'key']);
    expect(String.fromCharCodes(z.bytes.take(2)), 'PK');
    expect(z.fileName.endsWith('.zip'), true);
  }, skip: skip, timeout: t);

  test('templates and logos: create, edit, set default, delete', () async {
    final api = await as(token);
    final presets = (await api.templates()).where((x) => x['preset'] == true).toList();
    expect(presets, isNotEmpty);
    final p = Map<String, dynamic>.from(presets.first)..remove('id')..remove('preset');
    final logo = await api.uploadLogo(png, 'logo.png') as Map<String, dynamic>;
    final created = await api.createTemplate({...p, 'name': 'قالب من التطبيق', 'isDefault': true, 'logoAssetId': logo['id'], 'accent': '#047857'}) as Map<String, dynamic>;
    final id = created['id'] as String;
    await api.updateTemplate(id, {...p, 'name': 'قالب معدّل', 'isDefault': true, 'logoAssetId': null, 'accent': null});
    expect((await api.templates()).firstWhere((x) => x['id'] == id)['name'], 'قالب معدّل');
    expect((await api.logos()).any((l) => l['id'] == logo['id']), true);
    await api.deleteTemplate(id);
    await api.deleteLogo(logo['id'] as String);
  }, skip: skip, timeout: t);

  test('generation endpoints answer with an understandable result', () async {
    final api = await as(token);
    final e = await api.getExam(examId!);
    final q = br(secs(e).first).first['id'] as String;
    try {
      await api.questionAction(q, 'regenerate');
    } on ApiError catch (err) {
      expect(messageOf(err), isNot(contains('HTTP_')));
    }
  }, skip: skip, timeout: t);

  test('security boundaries: unpaid refused, foreign exam hidden, bad session 401, account deletion', () async {
    final u = await as(unpaid);
    await expectLater(u.listExams(), throwsA(isA<ApiError>().having((e) => e.forbidden, 'forbidden', true)));
    await expectLater(u.getExam(examId!), throwsA(isA<ApiError>()));
    final bad = await as('not-a-real-token');
    await expectLater(bad.me(), throwsA(isA<ApiError>().having((e) => e.unauthorized, 'unauthorized', true)));
    // حذف حساب: كلمة مرور خاطئة تُرفض بلا أثر
    await expectLater(u.deleteAccount('wrong-password'), throwsA(isA<ApiError>().having((e) => e.code, 'code', 'INVALID_PASSWORD')));
    expect((await u.me())['user'], isNotNull);
  }, skip: skip, timeout: t);
}
