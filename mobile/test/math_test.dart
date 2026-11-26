import 'package:flutter_test/flutter_test.dart';
import 'package:sual_app/screens/math.dart';

void main() {
  test('powers, subscripts, operators and chemistry read naturally', () {
    expect(prettyMath('x^2 - 5x + 6 = 0'), 'x² - 5x + 6 = 0');
    expect(prettyMath('10^-6'), '10⁻⁶');
    expect(prettyMath('q_1 + q_2'), 'q₁ + q₂');
    expect(prettyMath('H2O و CO2 و H2SO4'), 'H₂O و CO₂ و H₂SO₄');
    expect(prettyMath('a <= b, c >= d, e != f'), 'a ≤ b, c ≥ d, e ≠ f');
    expect(prettyMath('2*3'), '2 × 3');
    expect(prettyMath(r'$\frac$ \times theta'), r'\frac × θ');
    expect(prettyMath('A4 و q1 تبقى'), 'A4 و q1 تبقى');
  });
}
