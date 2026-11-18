import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from '../scripts/tokens.mjs';

const tokens = JSON.parse(readFileSync('tokens/phosphene.tokens.json', 'utf8'));
const css: string = compile(tokens);
const v = (name: string) => css.match(new RegExp(`--ut-${name}: ([^;]+);`))?.[1];

// WCAG 2.x relative luminance and contrast ratio.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('phosphene tokens', () => {
  it('compile the piggy phosphene palette, value for value', () => {
    expect(v('surface-bg')).toBe('#04080c');
    expect(v('text-body')).toBe('#cfe6f2');
    expect(v('accent')).toBe('#36d2e6');
    expect(v('focus')).toBe('#e6a836');
  });

  it('fail loud on an unresolved reference', () => {
    const broken = structuredClone(tokens);
    broken.semantic.phosphene.accent = '{primitive.phosphene.nope}';
    expect(() => compile(broken)).toThrow(/unresolved token reference/);
  });

  for (const surface of ['surface-bg', 'surface-card', 'surface-raised']) {
    for (const text of ['text-body', 'text-secondary', 'text-label', 'text-meta', 'accent']) {
      it(`${text} on ${surface} meets WCAG AA 4.5:1`, () => {
        expect(ratio(v(text)!, v(surface)!)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`focus ring on ${surface} meets 3:1`, () => {
      expect(ratio(v('focus')!, v(surface)!)).toBeGreaterThanOrEqual(3);
    });
  }

  it('the contrast check itself rejects a failing pair', () => {
    expect(ratio('#173040', '#04080c')).toBeLessThan(4.5);
  });
});
