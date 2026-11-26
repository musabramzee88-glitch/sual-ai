import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sual_app/api/client.dart';

http.Response json(Object body, {int status = 200, Map<String, String> headers = const {}}) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...headers});

void main() {
  test('login keeps session cookie and sends it afterwards', () async {
    final seen = <String?>[];
    final c = MockClient((req) async {
      seen.add(req.headers['cookie']);
      if (req.url.path.endsWith('/auth/login')) {
        return json({'data': {'step': 'done'}}, headers: {'set-cookie': 'sual_session=tok123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly; SameSite=lax, sual_device=dev9; Path=/; Max-Age=2592000'});
      }
      return json({'data': {'user': {'id': 'u1'}, 'access': 'ACTIVE_SUBSCRIPTION'}});
    });
    final store = MemorySessionStore();
    final api = SualApi(client: c, store: store, base: 'http://x/');
    expect((await api.login('a@b.co', 'secret')).needsOtp, false);
    expect(api.hasSession, true);
    expect(await store.read(), 'tok123');
    await api.me();
    expect(seen.last, 'sual_session=tok123; sual_device=dev9');
  });

  test('otp step returns challenges, errors carry the server code', () async {
    final c = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return json({'data': {'step': 'otp', 'purpose': 'LOGIN', 'challenges': [{'challengeId': 'E_abc'}]}});
      }
      return json({'error': {'code': 'INVALID_CODE', 'message': 'x'}}, status: 400);
    });
    final api = SualApi(client: c, base: 'http://x');
    final r = await api.login('a@b.co', 'secret');
    expect(r.needsOtp, true);
    expect(r.challenges.first['challengeId'], 'E_abc');
    expect(() => api.verifyOtp([{'challengeId': 'E_abc', 'code': '000000'}]), throwsA(isA<ApiError>().having((e) => e.code, 'code', 'INVALID_CODE')));
  });

  test('401 clears the stored session; 402/403 are reported as forbidden', () async {
    final c = MockClient((req) async => req.url.path.endsWith('/me') ? json({'error': {'code': 'UNAUTHORIZED'}}, status: 401) : json({'error': {'code': 'SUBSCRIPTION_REQUIRED'}}, status: 402));
    final store = MemorySessionStore();
    await store.write('old');
    final api = SualApi(client: c, store: store, base: 'http://x');
    await api.restore();
    await expectLater(api.me(), throwsA(isA<ApiError>().having((e) => e.unauthorized, 'unauthorized', true)));
    expect(await store.read(), null);
    await expectLater(api.listExams(), throwsA(isA<ApiError>().having((e) => e.forbidden, 'forbidden', true)));
  });

  test('export returns bytes with the UTF-8 file name from Content-Disposition', () async {
    final c = MockClient((req) async {
      expect(req.url.queryParameters, containsPair('variant', 'key'));
      expect(req.url.queryParameters, containsPair('format', 'docx'));
      return http.Response.bytes([1, 2, 3], 200, headers: {'content-type': 'application/octet-stream', 'content-disposition': "attachment; filename=\"exam.docx\"; filename*=UTF-8''%D8%A7%D9%85%D8%AA%D8%AD%D8%A7%D9%86.docx"});
    });
    final d = await SualApi(client: c, base: 'http://x').export('e1', variant: 'key', format: 'docx');
    expect(d.bytes, [1, 2, 3]);
    expect(d.fileName, 'امتحان.docx');
  });
}
