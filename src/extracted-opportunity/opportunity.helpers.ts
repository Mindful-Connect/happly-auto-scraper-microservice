import { FieldPossibleTypes, FieldPossibleTypesString } from '@/extracted-opportunity/schemas/field.schema';

export function isFieldEmpty(fieldType: FieldPossibleTypesString, data: FieldPossibleTypes) {
  if (data === null || data === undefined) {
    return true;
  }

  switch (fieldType) {
    case 'string':
      return typeof data === 'string' ? data.length < 1 : true;
    case 'string[]':
      return Array.isArray(data) ? (data as Array<unknown>).filter(d => (typeof d === 'string' ? d.length > 0 : false)).length < 1 : true;
    case 'number':
      return typeof data === 'number' ? isNaN(data) : true;
    case 'number[]':
      return Array.isArray(data) ? (data as Array<unknown>).filter(d => (typeof d === 'number' ? !isNaN(d) : false)).length < 1 : true;
    case 'date':
      return typeof data !== 'string' || data.length < 1;
    case 'boolean':
      return typeof data !== 'boolean';
    default:
      return true;
  }
}
