import 'dart:convert';
import 'package:http/http.dart' as http;

/// عنوان الخادم: يُمرَّر عند البناء  --dart-define=API_BASE=https://النطاق
const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:3000');

class ApiError implements Exception {
  ApiError(this.status, this.code, [this.detail]);
  final int status;
  final String code;
  final String? detail;
  bool get unauthorized => status == 401;
  bool get forbidden => status == 402 || status == 403;
  @override
  String toString() => 'ApiError($status, $code)';
}

/// مخزن جلسة بسيط (التطبيق يحفظ رمز الجلسة في التخزين الآمن)
abstract class SessionStore {
  Future<String?> read();
  Future<void> write(String? token);
}

class MemorySessionStore implements SessionStore {
  String? _v;
  @override
  Future<String?> read() async => _v;
  @override
  Future<void> write(String? token) async => _v = token;
}

class LoginResult {
  LoginResult.done() : challenges = const [], purpose = null;
  LoginResult.otp(this.purpose, this.challenges);
  final String? purpose;
  final List<Map<String, dynamic>> challenges;
  bool get needsOtp => purpose != null;
}

class Download {
  Download(this.bytes, this.fileName, this.contentType);
  final List<int> bytes;
  final String fileName;
  final String contentType;
}

/// عميل واجهة الخادم (/api/v1). الجلسة ملف ارتباط «sual_session» يحفظه العميل ويرسله بنفسه
/// (التطبيق ليس متصفحاً). الخادم يقبل طلبات بلا Origin من العملاء الأصليين ويحمي الباقي من CSRF.
class SualApi {
  SualApi({http.Client? client, SessionStore? store, String? base})
      : _http = client ?? http.Client(),
        _store = store ?? MemorySessionStore(),
        _base = (base ?? apiBase).replaceAll(RegExp(r'/+$'), '');

  final http.Client _http;
  final SessionStore _store;
  final String _base;
  String? _session;
  String? _device;

  Future<void> restore() async => _session = await _store.read();
  bool get hasSession => _session != null;

  Map<String, String> _headers({bool json = false}) => {
        if (json) 'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': 'SualApp/1.0',
        if (_session != null || _device != null)
          'cookie': [if (_session != null) 'sual_session=$_session', if (_device != null) 'sual_device=$_device'].join('; '),
      };

  Future<void> _capture(http.BaseResponse r) async {
    final raw = r.headers['set-cookie'];
    if (raw == null) return;
    // عدة ملفات ارتباط مدموجة بفاصلة؛ تواريخ Expires فيها فاصلة أيضاً، فنفصل فقط قبل «اسم=»
    for (final part in raw.split(RegExp(r',\s*(?=[A-Za-z0-9_\-]+=)'))) {
      final eq = part.indexOf('=');
      if (eq < 0) continue;
      final name = part.substring(0, eq).trim();
      if (name != 'sual_session' && name != 'sual_device') continue;
      final semi = part.indexOf(';');
      final value = part.substring(eq + 1, semi < 0 ? part.length : semi).trim();
      final attrs = semi < 0 ? '' : part.substring(semi);
      final expired = value.isEmpty || RegExp(r'max-age=0\b', caseSensitive: false).hasMatch(attrs);
      if (name == 'sual_session') {
        _session = expired ? null : value;
        await _store.write(_session);
      } else {
        _device = expired ? null : value;
      }
    }
  }

  Future<dynamic> _decode(http.Response r) async {
    await _capture(r);
    Map<String, dynamic>? body;
    try {
      body = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {}
    if (r.statusCode >= 200 && r.statusCode < 300) return body?['data'];
    final err = body?['error'] as Map<String, dynamic>?;
    if (r.statusCode == 401) {
      _session = null;
      await _store.write(null);
    }
    throw ApiError(r.statusCode, (err?['code'] as String?) ?? 'HTTP_${r.statusCode}', err?['detail'] as String?);
  }

  Future<dynamic> _get(String path) async => _decode(await _http.get(Uri.parse('$_base/api/v1$path'), headers: _headers()).timeout(const Duration(seconds: 30)));
  Future<dynamic> _post(String path, Map<String, dynamic> body, {Duration timeout = const Duration(seconds: 30)}) async =>
      _decode(await _http.post(Uri.parse('$_base/api/v1$path'), headers: _headers(json: true), body: jsonEncode(body)).timeout(timeout));

  Future<LoginResult> login(String identifier, String password) async {
    final d = await _post('/auth/login', {'identifier': identifier.trim(), 'password': password}) as Map<String, dynamic>;
    if (d['step'] == 'done') return LoginResult.done();
    return LoginResult.otp(d['purpose'] as String?, (d['challenges'] as List).cast<Map<String, dynamic>>());
  }

  Future<void> verifyOtp(List<Map<String, String>> challenges, {bool remember = true}) async {
    await _post('/auth/otp/verify', {'challenges': challenges, 'rememberDevice': remember});
  }

  Future<void> resendOtp(String challengeId) async => _post('/auth/otp/resend', {'challengeId': challengeId});

  Future<Map<String, dynamic>> me() async => await _get('/me') as Map<String, dynamic>;

  Future<List<Map<String, dynamic>>> listExams() async => (await _get('/exams') as List).cast<Map<String, dynamic>>();

  Future<Map<String, dynamic>> getExam(String id) async => await _get('/exams/$id') as Map<String, dynamic>;

  Future<void> logout() async {
    try {
      await _post('/auth/logout', {});
    } catch (_) {}
    _session = null;
    _device = null;
    await _store.write(null);
  }

  /// تنزيل ورقة الامتحان (pdf|docx) بنسخة (questions|answers|key|sheet) ونموذج (A–D)
  Future<Download> export(String id, {String variant = 'questions', String format = 'pdf', String model = 'A', String? name}) async {
    final uri = Uri.parse('$_base/api/v1/exams/$id/export').replace(queryParameters: {'variant': variant, 'format': format, 'model': model, if (name != null) 'name': name});
    final r = await _http.get(uri, headers: _headers()).timeout(const Duration(minutes: 3));
    await _capture(r);
    if (r.statusCode != 200) {
      String code = 'HTTP_${r.statusCode}';
      try {
        code = ((jsonDecode(utf8.decode(r.bodyBytes)) as Map)['error'] as Map)['code'] as String;
      } catch (_) {}
      throw ApiError(r.statusCode, code);
    }
    final cd = r.headers['content-disposition'] ?? '';
    final star = RegExp(r"filename\*=UTF-8''([^;]+)").firstMatch(cd)?.group(1);
    final plain = RegExp(r'filename="?([^";]+)"?').firstMatch(cd)?.group(1);
    final fileName = star != null ? Uri.decodeComponent(star) : (plain ?? 'exam.$format');
    return Download(r.bodyBytes, fileName, r.headers['content-type'] ?? 'application/octet-stream');
  }
}
