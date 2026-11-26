/// عرض مقروء للتعابير الرياضية في التطبيق (الورقة نفسها تُرسم على الخادم بدقة):
/// x^2 ← x²، q_1 ← q₁، H2O ← H₂O، <= ← ≤، * ← ×، sqrt( ← √(، وأسماء يونانية.
String prettyMath(String s) {
  const sup = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', 'n': 'ⁿ', 'x': 'ˣ'};
  const sub = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'};
  var t = s
      .replaceAll(RegExp(r'\$'), '')
      .replaceAll(r'\times', '×').replaceAll(r'\div', '÷').replaceAll(r'\pm', '±')
      .replaceAll(r'\leq', '≤').replaceAll(r'\le', '≤').replaceAll(r'\geq', '≥').replaceAll(r'\ge', '≥').replaceAll(r'\neq', '≠')
      .replaceAll('<=', '≤').replaceAll('>=', '≥').replaceAll('!=', '≠').replaceAll('+-', '±').replaceAll('<->', '⇌').replaceAll('->', '→')
      .replaceAll(RegExp(r'\bsqrt\s*\('), '√(');
  t = t.replaceAllMapped(RegExp(r'(?<=[A-Za-z0-9)])\*(?=[A-Za-z0-9(])'), (_) => ' × ');
  const greek = {'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'theta': 'θ', 'lambda': 'λ', 'mu': 'μ', 'pi': 'π', 'sigma': 'σ', 'omega': 'ω', 'Delta': 'Δ', 'Omega': 'Ω'};
  t = t.replaceAllMapped(RegExp(r'\\?\b(alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Omega)\b'), (m) => greek[m[1]]!);
  t = t.replaceAllMapped(RegExp(r'\^\{([-+0-9nx]+)\}|\^([-+]?[0-9]+|[nx])'), (m) => (m[1] ?? m[2]!).split('').map((c) => sup[c] ?? c).join());
  t = t.replaceAllMapped(RegExp(r'_\{?([0-9]+)\}?'), (m) => m[1]!.split('').map((c) => sub[c] ?? c).join());
  // صيغ كيميائية بسيطة: حرف كبير (وصغير اختياري) يليه رقم ← دليل سفلي (H2O، CO2، H2SO4)
  t = t.replaceAllMapped(RegExp(r'\b(?:[A-Z][a-z]?\d*){2,}\b'), (m) => m[0]!.replaceAllMapped(RegExp(r'(?<=[A-Za-z)])(\d+)'), (d) => d[1]!.split('').map((c) => sub[c]!).join()));
  return t;
}
