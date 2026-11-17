import React, { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Layer, TextInput } from '@carbon/react';
import { isEmpty } from '../../../validators/form-validator';
import { isTrue } from '../../../utils/boolean-utils';
import { type FormFieldInputProps } from '../../../types';
import { shouldUseInlineLayout } from '../../../utils/form-helper';
import { useFormProviderContext } from '../../../provider/form-provider';
import FieldLabel from '../../field-label/field-label.component';
import FieldValueView from '../../value/view/field-value-view.component';
import { formatDecimal } from '../../../utils/decimal-format';
import styles from './number.scss';

/** What a number field accepts as it is typed: digits, an optional leading minus, at most one dot or comma. */
const decimalTextPattern = /^-?\d*([.,]\d*)?$/;

/**
 * The number a field's text means, a comma read as the decimal point; undefined when it holds no digit.
 * A French-locale browser empties an `<input type="number">` on a typed dot ("36.4" was saved as 4), so
 * the field is a text input that reads "36.4" and "36,4" alike (UVL-EMR #719).
 */
export function parseDecimalText(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/\d/.test(normalized)) {
    return undefined;
  }
  const number = Number(normalized);
  return isNaN(number) ? undefined : number;
}

const NumberField: React.FC<FormFieldInputProps> = ({ field, value, errors, warnings, setFieldValue }) => {
  const { t } = useTranslation();
  const { layoutType, sessionMode, workspaceLayout } = useFormProviderContext();

  const getNumericValue = useCallback(
    (value: string | number) =>
      typeof value === 'undefined' || value === null || value === '' || isNaN(Number(value))
        ? undefined
        : Number(value),
    [],
  );

  // What is typed, kept as typed ("36," on the way to "36,4"); the field's value is the number it means.
  // A value not typed here is written with the session's decimal mark, "36,4" in French (UVL-EMR #723)
  const [text, setText] = useState(() => {
    const number = getNumericValue(value);
    return number === undefined ? '' : formatDecimal(number);
  });

  // The value changed from elsewhere (an encounter loaded, a calculated field): show it, unless the text
  // already means it
  useEffect(() => {
    setText((current) => {
      const number = getNumericValue(value);
      if (parseDecimalText(current) === number) {
        return current;
      }
      return number === undefined ? '' : formatDecimal(number);
    });
  }, [value, getNumericValue]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextText = event.target.value;
      if (!decimalTextPattern.test(nextText.trim())) {
        return;
      }
      setText(nextText);
      setFieldValue(parseDecimalText(nextText));
    },
    [setFieldValue],
  );

  const isInline = useMemo(() => {
    if (['view', 'embedded-view'].includes(sessionMode) || isTrue(field.readonly)) {
      return shouldUseInlineLayout(field.inlineRendering, layoutType, workspaceLayout, sessionMode);
    }
    return false;
  }, [sessionMode, field.readonly, field.inlineRendering, layoutType, workspaceLayout]);

  const numericValue = getNumericValue(value);
  const max = getNumericValue(field.questionOptions.max);
  const min = getNumericValue(field.questionOptions.min);

  return sessionMode == 'view' || sessionMode == 'embedded-view' ? (
    <div className={styles.formField}>
      <FieldValueView
        label={t(field.label)}
        value={numericValue === undefined ? value : formatDecimal(numericValue)}
        conceptName={field.meta?.concept?.display}
        isInline={isInline}
      />
    </div>
  ) : (
    !field.isHidden && (
      <Layer>
        <TextInput
          id={field.id}
          invalid={errors.length > 0}
          invalidText={errors[0]?.message}
          labelText={<FieldLabel field={field} />}
          max={max}
          min={min}
          name={field.id}
          value={text}
          onChange={handleChange}
          inputMode="decimal"
          autoComplete="off"
          size="lg"
          disabled={field.isDisabled}
          readOnly={isTrue(field.readonly)}
          className={classNames(styles.controlWidthConstrained, styles.boldedLabel)}
          warn={warnings.length > 0}
          warnText={warnings[0]?.message}
        />
      </Layer>
    )
  );
};

export default NumberField;
