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
  // The term the listed entries are the search results for.
  const resultsTerm = useRef<string>(null);
  // Counts the field's leaves and the typing after them: a check started on leaving the field is dropped
  // when it is no longer the latest.
  const leaveCheck = useRef(0);
  const comboBoxActions = useRef(null);

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
            resultsTerm.current = searchTerm;
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

  /** Picks an entry as a click in the list does, whether or not it is listed. */
  const pickItem = (item: OpenmrsResource) => {
    lastSelectedItem.current = item;
    setItems((currentItems) =>
      currentItems.some((currentItem) => currentItem.uuid == item.uuid) ? currentItems : [item, ...currentItems],
    );
    if (getValues(field.id) == item.uuid) {
      setTextNotPickedFromList(field, undefined);
      setFieldValue(item.uuid);
    }
    // The combobox calls onChange for an entry other than the selected one, and shows the entry's text.
    comboBoxActions.current?.selectItem(item);
  };

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
              if (document.activeElement === document.getElementById(field.id)) {
                // Typed: a check started when the field was left no longer applies.
                leaveCheck.current++;
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
              const check = ++leaveCheck.current;
              if (!typedText) {
                setTextNotPickedFromList(field, undefined);
                setFieldValue(null);
                return;
              }
              if (selectedItem && typedText === getItemText(selectedItem)) {
                if (field.meta?.textNotPickedFromList) {
                  setTextNotPickedFromList(field, undefined);
                  setFieldValue(value);
                }
                return;
              }
              const pickedItem = selectedItem;
              // Text typed without picking an entry. It is settled against the entries found for it: the
              // one entry it names is picked; text that names no entry puts the picked entry back (in the
              // input too: the combobox does not on Tab); otherwise, or with no entry picked, the text is
              // flagged on the field, which is validated again: the error names it and blocks the save.
              const settle = (foundItems: Array<OpenmrsResource>) => {
                const namedItems = findItemsNamed(foundItems, typedText);
                if (namedItems.length === 1) {
                  pickItem(namedItems[0]);
                } else if (!namedItems.length && pickedItem) {
                  if (field.meta?.textNotPickedFromList) {
                    setTextNotPickedFromList(field, undefined);
                    setFieldValue(getValues(field.id));
                  }
                  comboBoxActions.current?.selectItem(pickedItem);
                } else {
                  setTextNotPickedFromList(field, typedText);
                  setFieldValue(getValues(field.id));
                }
              };
              if (!isSearchable || resultsTerm.current === typedText) {
                settle(items);
                return;
              }
              // The search for the text has not answered yet: the text blocks the save until it has.
              setTextNotPickedFromList(field, typedText);
              setFieldValue(value);
              const valueOnLeaving = value;
              dataSource
                ?.fetchData(typedText, config)
                .then((dataItems) => {
                  const isLatest =
                    check === leaveCheck.current &&
                    field.meta?.textNotPickedFromList === typedText &&
                    getValues(field.id) === valueOnLeaving;
                  if (isLatest) {
                    settle(dataItems.map((item) => dataSource.toUuidAndDisplay(item, config)));
                  }
                })
                .catch((error) => console.error(error));
            }}
            downshiftActions={comboBoxActions}
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

/**
 * The entries a text names, ignoring case and repeated spaces: by their text in the list, their display,
 * or, for an entry with an identifier whose display is « identifier - name » (a provider), by that name or
 * that identifier.
 */
export function findItemsNamed<T extends { uuid?: string; code?: string; display?: string; identifier?: string }>(
  items: Array<T>,
  text: string,
): Array<T> {
  const wanted = normalizeName(text);
  if (!wanted) {
    return [];
  }
  const named = items.filter((item) => item && getItemNames(item).some((name) => normalizeName(name) === wanted));
  return named.filter((item, index) => named.findIndex((other) => other.uuid == item.uuid) === index);
}

function getItemNames(item: { code?: string; display?: string; identifier?: string }): Array<string> {
  const names = [getItemText(item), item.display];
  const identifierPrefix = item.identifier ? `${item.identifier} - ` : null;
  if (identifierPrefix && item.display?.startsWith(identifierPrefix)) {
    names.push(item.display.slice(identifierPrefix.length), item.identifier);
  }
  return names.filter(Boolean);
}

function normalizeName(text: string): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function getItemText(item?: { code?: string; display?: string }): string {
  return item?.code ? `${item.code} ${item.display}` : item?.display ?? '';
}
