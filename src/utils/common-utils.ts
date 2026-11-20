import { type FormSchema, type FormField, type OpenmrsObs, type RenderType } from '../types';
import { isEmpty } from '../validators/form-validator';
import { formatDate, parseDate, type FormatDateOptions, type Visit } from '@openmrs/esm-framework';
import { type TFunction } from 'i18next';

export function flattenObsList(obsList: OpenmrsObs[]): OpenmrsObs[] {
  const flattenedList: OpenmrsObs[] = [];

  function flatten(obs: OpenmrsObs): void {
    flattenedList.push(obs);
    if (obs.groupMembers?.length) {
      obs.groupMembers.forEach((groupMember) => {
        flatten(groupMember);
      });
    }
  }
  obsList.forEach((obs) => {
    flatten(obs);
  });

  return flattenedList;
}

export function hasRendering(field: FormField, rendering: RenderType) {
  return field.questionOptions.rendering === rendering;
}

export function clearSubmission(field: FormField) {
  if (!field.meta?.submission) {
    field.meta = { ...(field.meta || {}), submission: {} };
  }
  field.meta.submission = {
    ...field.meta.submission,
    voidedValue: null,
    newValue: null,
  };
}

export function gracefullySetSubmission(field: FormField, newValue: any, voidedValue: any) {
  if (!field.meta?.submission) {
    field.meta = { ...(field.meta || {}), submission: {} };
  }
  if (!isEmpty(newValue)) {
    field.meta.submission.newValue = newValue;
  }
  if (!isEmpty(voidedValue)) {
    field.meta.submission.voidedValue = voidedValue;
  }
  return field.meta.submission.newValue;
}

export function hasSubmission(field: FormField) {
  return !!field.meta.submission?.newValue || !!field.meta.submission?.voidedValue;
}

export function isViewMode(sessionMode: string) {
  return sessionMode === 'view' || sessionMode === 'embedded-view';
}

/**
 * Translates the answer label, or each label of a multi-answer value, that a coded field's adapter
 * returns for display. The edit mode renders every answer as `t(answer.label)`, so the form's
 * translations (else the concept's name in the session locale, which the label falls back to)
 * apply; the view mode shows the same text this way instead of the label as written in the form.
 */
export function translateAnswerLabels(t: TFunction, displayValue: any) {
  if (Array.isArray(displayValue)) {
    return displayValue.map((label) => translateAnswerLabels(t, label));
  }
  return typeof displayValue === 'string' && displayValue ? t(displayValue) : displayValue;
}

export function parseToLocalDateTime(dateString: string): Date {
  return parseDate(dateString);
}

/**
 * Reads a Time obs value. The backend returns Time obs as a datetime in its own timezone
 * (e.g. `1970-01-01T22:00:00.000+0000`), but the value is a clock time, so the offset does not apply.
 * Returns 1970-01-01 at that clock time in local time, without seconds, or an Invalid Date
 * if the string has no `THH:mm` part.
 */
export function parseClockTime(dateString: string): Date {
  const [, hours, minutes] = /T(\d{2}):(\d{2})/.exec(dateString) ?? [];
  return hours ? new Date(1970, 0, 1, Number(hours), Number(minutes)) : new Date(NaN);
}

/**
 * Returns `date` if it falls within the visit's start/stop window, otherwise the
 * nearest end of the window: the visit's start for a date before it, its stop for a
 * date after it. This keeps default encounter datetimes valid when filling forms
 * against a past (stopped) visit via retrospective data entry; the backend rejects
 * encounters dated outside the visit window (the bounds themselves are accepted).
 */
export function getDateWithinVisitWindow(date: Date, visit?: Visit): Date {
  if (!visit) {
    return date;
  }
  const visitStart = visit.startDatetime ? new Date(visit.startDatetime) : null;
  const visitStop = visit.stopDatetime ? new Date(visit.stopDatetime) : null;
  if (visitStart && date < visitStart) {
    return visitStart;
  }
  if (visitStop && date > visitStop) {
    return visitStop;
  }
  return date;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The encounter date a form's own date question gives, brought into the visit's window when it only
 * misses it on the visit's first day (before the visit started: a date-only picker gives 00:00) or
 * on the day the visit stopped (after it stopped). A date on another day is the user's choice and is
 * kept: the server refuses it and the message says why.
 */
export function getEncounterDateWithinVisit(date: Date, visit?: Visit): Date {
  const visitStart = visit?.startDatetime ? new Date(visit.startDatetime) : null;
  const visitStop = visit?.stopDatetime ? new Date(visit.stopDatetime) : null;
  if (visitStart && date < visitStart && isSameLocalDay(date, visitStart)) {
    return visitStart;
  }
  if (visitStop && date > visitStop && isSameLocalDay(date, visitStop)) {
    return visitStop;
  }
  return date;
}

export function formatDateAsDisplayString(field: FormField, date: Date) {
  const options: Partial<FormatDateOptions> = { noToday: true };
  if (field.datePickerFormat === 'calendar') {
    options.time = false;
  } else {
    options.time = true;
  }
  return formatDate(date, options);
}

/**
 * Creates a new copy of `formJson` with updated references at the page and section levels.
 * This ensures React re-renders properly by providing new references for nested arrays.
 */
export function updateFormSectionReferences(formJson: FormSchema) {
  formJson.pages = formJson.pages.map((page) => {
    page.sections = Array.from(page.sections);
    return page;
  });
  return { ...formJson };
}

/**
 * Converts a px value to a rem value
 * @param px - The px value to convert
 * @param fontSize - The font size to use for the conversion
 * @returns The rem value
 */
export function pxToRem(px: number, fontSize: number = 16) {
  return px / fontSize;
}
