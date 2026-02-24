import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ required: true })
  keyHash: string;

  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

// Compound index: user + status for efficient active key queries
ApiKeySchema.index({ userId: 1, status: 1 });
