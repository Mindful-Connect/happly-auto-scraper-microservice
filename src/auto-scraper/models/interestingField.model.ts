import { FieldPossibleTypes } from '@/extracted-opportunity/schemas/field.schema';

export class InterestingField {
  stringify: (fieldValue: FieldPossibleTypes) => string = f => f?.toString() || '';

  /**
   *  (optional)
   * The helper text to be used by chatGPT to help the chatGPT understand
   * the context of the field.
   * Example value:
   * "where `opportunitys_grant_types` is an array of strings, phrasing what types of grants this opportunity gives the applicants."
   */
  contextAwarenessHelper?: string;

  setToString(toString: (fieldValue: any) => string) {
    this.stringify = toString;
    return this;
  }

  constructor(contextAwarenessHelper?: string) {
    this.contextAwarenessHelper = contextAwarenessHelper;
  }
}
