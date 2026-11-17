/**
 * The decimal mark of a language: "," in French, "." in English. Read from `Intl`; "." when the
 * language is unknown to it.
 */
export function getDecimalSeparator(locale: string = window.i18next?.language): string {
  try {
    return (
      new Intl.NumberFormat(locale?.replace('_', '-')).formatToParts(1.5).find((part) => part.type === 'decimal')
        ?.value ?? '.'
    );
  } catch {
    return '.';
  }
}

/**
 * A number as the session's language writes it, "36,4" in French, so a value shown matches what the
 * number field takes as typed (UVL-EMR #723). The digits are those of `String(value)`: nothing is
 * rounded or grouped.
 */
export function formatDecimal(value: number, locale?: string): string {
  return String(value).replace('.', getDecimalSeparator(locale));
}
