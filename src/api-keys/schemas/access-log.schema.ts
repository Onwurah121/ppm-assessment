import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccessLogDocument = AccessLog & Document;

export enum AccessAction {
  GENERATED = 'generated',
  REVOKED = 'revoked',
  ROTATED = 'rotated',
  USED = 'used',
}

@Schema({ timestamps: true })
export class AccessLog {
  @Prop({ type: Types.ObjectId, ref: 'ApiKey', required: true, index: true })
  apiKeyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: AccessAction })
  action: AccessAction;

  @Prop({ default: null })
  ipAddress: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
