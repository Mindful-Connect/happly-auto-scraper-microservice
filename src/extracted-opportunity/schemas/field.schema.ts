import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';

/**
 * The possible types of the data extracted by chatGPT. This is used to
 * tell chatGPT what type of data to expect. (e.g. string, number, etc.)
 */
export type FieldPossibleTypes = string | string[] | number | number[] | boolean | null;

export type FieldPossibleTypesString = 'string' | 'string[]' | 'number' | 'number[]' | 'date' | 'boolean';

export type FieldDocument = HydratedDocument<Field>;

/**
 * The schema for the fields extracted by chatGPT.
 */
@Schema({ _id: false }) // Disable _id generation for the base schema
export class Field<TData extends FieldPossibleTypes = null> {
  constructor(fieldType: FieldPossibleTypesString = 'string') {
    this.fieldType = fieldType;
  }

  /**
   * For chatGPT to be able to understand the context without having to describe
   * it all the time.
   * Examples include: "opportunity_provider_name"
   */
  @Prop()
  contextSlug: string;

  /**
   * For chatGPT to understand the type of the field and how to respond to it.
   * Examples include: "string", "string[]", "number", "number[]"
   * being used in a prompt: "opportunity_provider_name": Value<string>.
   */
  @Prop({ type: SchemaMongoose.Types.String, required: true })
  fieldType: FieldPossibleTypesString;

  /**
   * The actual data extracted by chatGPT
   */
  @Prop({ type: SchemaMongoose.Types.Mixed, default: null })
  data: TData;

  /**
   * The link to the relevant page on the website possibly containing
   * more information about the field.
   */
  @Prop({ default: null })
  relevantLink: string | null;
}

export const FieldSchema = SchemaFactory.createForClass(Field);
