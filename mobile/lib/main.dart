import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api/client.dart';
import 'screens/exams.dart';
import 'screens/login.dart';

const brand = Color(0xFF0B6560);
const amber = Color(0xFFF5A524);

class SecureStore implements SessionStore {
  static const _s = FlutterSecureStorage();
  @override
  Future<String?> read() => _s.read(key: 'session');
  @override
  Future<void> write(String? token) => token == null ? _s.delete(key: 'session') : _s.write(key: 'session', value: token);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = SualApi(store: SecureStore());
  await api.restore();
  runApp(SualApp(api: api));
}

class SualApp extends StatefulWidget {
  const SualApp({super.key, required this.api});
  final SualApi api;
  @override
  State<SualApp> createState() => _SualAppState();
}

class _SualAppState extends State<SualApp> {
  late bool _in = widget.api.hasSession;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'سُؤال AI',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      builder: (c, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: brand, primary: brand, secondary: amber),
        scaffoldBackgroundColor: const Color(0xFFF6F3EC),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)))),
      ),
      home: _in
          ? ExamsPage(api: widget.api, onLogout: () => setState(() => _in = false))
          : LoginPage(api: widget.api, onDone: () => setState(() => _in = true)),
    );
  }
}
