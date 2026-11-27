import 'package:flutter/material.dart';
// بادئة loc: في بعض نسخ Flutter تصدّر مكتبات المواد (material_ui) الأسماء نفسها فيحدث غموض عند الاستيراد المباشر
import 'package:flutter_localizations/flutter_localizations.dart' as loc;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api/client.dart';
import 'screens/account.dart';
import 'screens/exams.dart';
import 'screens/login.dart';
import 'screens/templates.dart';
import 'screens/ui.dart';
import 'screens/wizard.dart';

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
      localizationsDelegates: [loc.GlobalMaterialLocalizations.delegate, loc.GlobalWidgetsLocalizations.delegate, loc.GlobalCupertinoLocalizations.delegate],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: brand, primary: brand, secondary: amber, surface: Colors.white),
        scaffoldBackgroundColor: paper,
        appBarTheme: const AppBarTheme(backgroundColor: paper, centerTitle: false),
        cardTheme: const CardThemeData(color: Colors.white, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16)), side: BorderSide(color: Color(0xFFE5E0D4)))),
        inputDecorationTheme: const InputDecorationTheme(filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)))),
      ),
      home: _in
          ? HomeShell(api: widget.api, onLogout: () => setState(() => _in = false))
          : LoginPage(api: widget.api, onDone: () => setState(() => _in = true)),
    );
  }
}

/// التبويبات الأربعة (نفس تنقل الموقع): امتحاناتي، جديد، القوالب، الحساب
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.api, required this.onLogout});
  final SualApi api;
  final VoidCallback onLogout;
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  final _examsKey = GlobalKey<ExamsPageState>();

  void _created(String id) {
    setState(() => _tab = 0);
    _examsKey.currentState?.reload();
    _examsKey.currentState?.open(id);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      ExamsPage(key: _examsKey, api: widget.api, onLogout: widget.onLogout, onNew: () => setState(() => _tab = 1)),
      WizardPage(api: widget.api, onCreated: _created),
      TemplatesPage(api: widget.api),
      AccountPage(api: widget.api, onLogout: widget.onLogout),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.description_outlined), selectedIcon: Icon(Icons.description), label: 'امتحاناتي'),
          NavigationDestination(icon: Icon(Icons.add_circle_outline), selectedIcon: Icon(Icons.add_circle), label: 'جديد'),
          NavigationDestination(icon: Icon(Icons.dashboard_customize_outlined), selectedIcon: Icon(Icons.dashboard_customize), label: 'القوالب'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'الحساب'),
        ],
      ),
    );
  }
}
