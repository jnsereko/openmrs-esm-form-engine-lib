import { describe, expect, it } from 'vitest';
import { formatDecimal, getDecimalSeparator } from './decimal-format';

describe('getDecimalSeparator', () => {
  it('is a comma in French and a dot in English', () => {
    expect(getDecimalSeparator('fr')).toBe(',');
    expect(getDecimalSeparator('fr-BI')).toBe(',');
    expect(getDecimalSeparator('fr_FR')).toBe(',');
    expect(getDecimalSeparator('en')).toBe('.');
  });

  it("follows the session's language when none is given", () => {
    const language = window.i18next.language;
    try {
      window.i18next.language = 'fr';
      expect(getDecimalSeparator()).toBe(',');
      window.i18next.language = 'en';
      expect(getDecimalSeparator()).toBe('.');
    } finally {
      window.i18next.language = language;
    }
  });

  it('falls back to a dot for a language Intl cannot read', () => {
    expect(getDecimalSeparator('not a locale!')).toBe('.');
  });
});

describe('formatDecimal', () => {
  it('writes a decimal with the language’s mark, keeping every digit and no grouping', () => {
    expect(formatDecimal(36.4, 'fr')).toBe('36,4');
    expect(formatDecimal(-0.125, 'fr')).toBe('-0,125');
    expect(formatDecimal(2450.5, 'fr')).toBe('2450,5');
    expect(formatDecimal(36.4, 'en')).toBe('36.4');
  });

  it('leaves whole numbers as they are', () => {
    expect(formatDecimal(72, 'fr')).toBe('72');
    expect(formatDecimal(0, 'fr')).toBe('0');
  });
});
