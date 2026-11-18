import React, { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash-es';
import { ComboBox, DropdownSkeleton, Layer, InlineLoading } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';
import { type OpenmrsResource } from '@openmrs/esm-framework';
import { getControlTemplate } from '../../../registry/inbuilt-components/control-templates';
import { getRegisteredDataSource } from '../../../registry/registry';
import { isEmpty } from '../../../validators/form-validator';
import { isTrue } from '../../../utils/boolean-utils';
import { isViewMode } from '../../../utils/common-utils';
import { shouldUseInlineLayout } from '../../../utils/form-helper';
import { type DataSource, type FormField, type FormFieldInputProps } from '../../../types';
import { useFormProviderContext } from '../../../provider/form-provider';
import useDataSourceDependentValue from '../../../hooks/useDataSourceDependentValue';
import FieldLabel from '../../field-label/field-label.component';
import FieldValueView from '../../value/view/field-value-view.component';
import styles from './ui-select-extended.scss';

const UiSelectExtended: React.FC<FormFieldInputProps> = ({ field, errors, warnings, setFieldValue }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const isProcessingSelection = useRef(false);
  const [dataSource, setDataSource] = useState(null);
  const [config, setConfig] = useState({});
  const dataSourceDependentValue = useDataSourceDependentValue(field);
  const isSearchable = isTrue(field.questionOptions.isSearchable);
  const {
    layoutType,
    sessionMode,
    workspaceLayout,
    methods: { control, getFieldState, getValues },
  } = useFormProviderContext();

  const value = useWatch({ control, name: field.id, exact: true });
  const { isDirty } = getFieldState(field.id);

  const isInline = useMemo(() => {
    if (isViewMode(sessionMode) || isTrue(field.readonly)) {
      return shouldUseInlineLayout(field.inlineRendering, layoutType, workspaceLayout, sessionMode);
    }
    return false;
  }, [sessionMode, field.readonly, field.inlineRendering, layoutType, workspaceLayout]);

  // The selected entry is remembered apart from the list: a search that does not return it (or returns
  // nothing) empties the list without unselecting it.
  const lastSelectedItem = useRef(null);
  const selectedItem = useMemo(() => {
    const item = items.find((item) => item.uuid == value);
    if (item) {
      lastSelectedItem.current = item;
      return item;
    }
    return value && lastSelectedItem.current?.uuid == value ? lastSelectedItem.current : null;
  }, [items, value]);

  const searchGeneration = useRef(0);

  const debouncedSearch = useMemo(
    () =>
      debounce((searchTerm: string, dataSource: DataSource<OpenmrsResource>) => {
        const generation = searchGeneration.current;
        setIsSearching(true);

        dataSource
          .fetchData(searchTerm, config)
          .then((dataItems) => {
            if (generation !== searchGeneration.current) {
              return;
            }
            if (dataItems.length) {
              setItems((currentItems) => {
                const currentValue = getValues(field.id);
                const currentSelectedItem = currentItems.find((item) => item.uuid == currentValue);
                const newItems = dataItems.map((item) => dataSource.toUuidAndDisplay(item, config));
                if (currentSelectedItem && !newItems.some((item) => item.uuid == currentSelectedItem.uuid)) {
                  newItems.unshift(currentSelectedItem);
                }
                return newItems;
              });
            } else {
              // Nothing matches: an empty list, not the previous search's results to pick by mistake.
              setItems([]);
            }
            setIsSearching(false);
          })
          .catch((err) => {
            if (generation !== searchGeneration.current) {
              return;
            }
            console.error(err);
            setIsSearching(false);
          });
      }, 300),
    [config, field.id, getValues],
  );

  useEffect(() => {
    const dataSource = field.questionOptions?.datasource?.name;
    setConfig(
      dataSource
        ? field.questionOptions.datasource?.config
        : getControlTemplate(field.questionOptions.rendering)?.datasource?.config,
    );
    getRegisteredDataSource(dataSource ? dataSource : field.questionOptions.rendering).then((ds) => setDataSource(ds));
  }, [field.questionOptions?.datasource]);

  useEffect(() => {
    let ignore = false;

    // If not searchable, preload the items
    if (dataSource && !isTrue(field.questionOptions.isSearchable)) {
      setItems([]);
      setIsLoading(true);

      dataSource
        .fetchData(null, { ...config, referencedValue: dataSourceDependentValue })
        .then((dataItems) => {
          if (!ignore) {
            setItems(dataItems.map((item) => dataSource.toUuidAndDisplay(item, config)));
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error(err);
            setIsLoading(false);
            setItems([]);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [dataSource, config, dataSourceDependentValue]);

  useEffect(() => {
    // Every typed term goes to the server: a loaded entry that contains it (the selected one, the
    // previous results) is not every entry that does.
    if (dataSource && isSearchable && !isEmpty(searchTerm)) {
      debouncedSearch(searchTerm, dataSource);
    } else {
      setIsSearching(false);
    }
    return () => {
      debouncedSearch.cancel();
      searchGeneration.current++;
    };
  }, [dataSource, searchTerm, isSearchable, debouncedSearch]);

  useEffect(() => {
    let ignore = false;
    if (value && !isDirty && dataSource && isSearchable && !selectedItem) {
      // For search-based instances, fetch the initial item to resolve its display property
      setIsLoading(true);
      dataSource
        .fetchSingleItem(value, config)
        .then((item) => {
          if (!ignore) {
            setItems([dataSource.toUuidAndDisplay(item, config)]);
            setIsLoading(false);
          }
        })
        .catch((error) => {
          if (!ignore) {
            console.error(error);
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [value, isDirty, dataSource, isSearchable, selectedItem, config]);

  if (isLoading) {
    return <DropdownSkeleton />;
  }

  return isViewMode(sessionMode) || isTrue(field.readonly) ? (
    <FieldValueView
      label={t(field.label)}
      value={value ? getItemText(selectedItem) : value}
      conceptName={field.meta?.concept?.display}
      isInline={isInline}
    />
  ) : (
    !field.isHidden && (
      <div className={styles.boldedLabel}>
        <Layer>
          <ComboBox
            id={field.id}
            titleText={<FieldLabel field={field} />}
            items={items}
            itemToElement={(item) => (
              <span className={styles.item}>
                {item?.code && <span className={styles.code}>{item.code}</span>}
                <span className={styles.label}>{item?.display}</span>
              </span>
            )}
            itemToString={getItemText}
            selectedItem={selectedItem}
            placeholder={isSearchable ? t('search', 'Search') + '...' : null}
            onChange={({ selectedItem }) => {
              debouncedSearch.cancel();
              searchGeneration.current++;
              setIsSearching(false);
              isProcessingSelection.current = true;
              setTextNotPickedFromList(field, undefined);
              setFieldValue(selectedItem?.uuid);
            }}
            disabled={field.isDisabled}
            readOnly={isTrue(field.readonly)}
            invalid={errors.length > 0}
            invalidText={errors.length && errors[0].message}
            onInputChange={(value) => {
              if (isProcessingSelection.current) {
                // Notes:
                // When the user selects a value, both the onChange and onInputChange functions are invoked sequentially.
                // Issue: onInputChange modifies the search term, unnecessarily triggering a search.
                isProcessingSelection.current = false;
                return;
              }
              if (field.questionOptions.isSearchable) {
                // The input showing the selected entry's text (set by the combobox, not typed) is no search.
                setSearchTerm(selectedItem && value === getItemText(selectedItem) ? '' : value);
              }
            }}
            onBlur={(event) => {
              // Notes:
              // There is an issue with the onBlur event where the value is not persistently set to null when the user clears the input field.
              // This is a workaround to ensure that the value is set to null when the user clears the input field.
              const typedText = event.target.value;
              // The combobox puts the selected entry's text back in place of typed text that is no entry's
              // label: nothing is left unpicked then, the field shows its value again.
              const restoresSelectedItem =
                Boolean(selectedItem) && !items.some((item) => getItemText(item) === typedText);
              if (!typedText) {
                setTextNotPickedFromList(field, undefined);
                setFieldValue(null);
              } else if (typedText !== getItemText(selectedItem) && !restoresSelectedItem) {
                // Text typed without picking an entry: the field keeps its value (none, or the entry picked
                // before) and the combobox empties the input after this handler, or keeps an entry's full
                // label typed. Flag the text, and set the value again so the field is validated: the error
                // names the text and blocks the save.
                setTextNotPickedFromList(field, typedText);
                setFieldValue(value);
              } else if (field.meta?.textNotPickedFromList) {
                setTextNotPickedFromList(field, undefined);
                setFieldValue(value);
              }
            }}
          />
          {isSearching && <InlineLoading className={styles.loader} description={t('searching', 'Searching') + '...'} />}
        </Layer>
      </div>
    )
  );
};

export default UiSelectExtended;

/**
 * Records on the field the text typed in it that was not picked from the list, or clears it. The
 * `form_field` validator fails the field while it is set.
 */
export function setTextNotPickedFromList(field: FormField, text: string | undefined) {
  if (!field.meta) {
    field.meta = {};
  }
  field.meta.textNotPickedFromList = text || undefined;
}

export function getItemText(item?: { code?: string; display?: string }): string {
  return item?.code ? `${item.code} ${item.display}` : item?.display ?? '';
}
