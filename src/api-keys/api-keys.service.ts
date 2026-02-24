import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument, ApiKeyStatus } from './schemas/api-key.schema';
import { AccessLog, AccessLogDocument, AccessAction } from './schemas/access-log.schema';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RevokeApiKeyDto } from './dto/revoke-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

const MAX_ACTIVE_KEYS = 3;

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(AccessLog.name) private accessLogModel: Model<AccessLogDocument>,
  ) {}

  /**
   * Generate a new API key for the user.
   * Returns the raw key only once — it is stored as a bcrypt hash.
   */
  async generate(
    userId: string,
    dto: CreateApiKeyDto,
    ipAddress?: string,
  ): Promise<{ apiKey: ApiKeyDocument; rawKey: string }> {
    // Enforce max active keys
    const activeCount = await this.apiKeyModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: ApiKeyStatus.ACTIVE,
    });

    if (activeCount >= MAX_ACTIVE_KEYS) {
      throw new BadRequestException(
        `Maximum of ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke an existing key first.`,
      );
    }

    // Generate a unique key
    const rawKey = `ppm_${uuidv4().replace(/-/g, '')}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await this.apiKeyModel.create({
      keyHash,
      keyPrefix,
      name: dto.name,
      userId: new Types.ObjectId(userId),
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
    });

    // Audit log
    await this.logAccess(apiKey._id as Types.ObjectId, userId, AccessAction.GENERATED, ipAddress);

    return { apiKey, rawKey };
  }

  /**
   * List all API keys for the authenticated user.
   * Never returns the key hash.
   */
  async list(userId: string): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Revoke an active API key.
   */
  async revoke(
    userId: string,
    keyId: string,
    dto: RevokeApiKeyDto,
    ipAddress?: string,
  ): Promise<ApiKeyDocument> {
    const apiKey = await this.findKeyOrFail(keyId, userId);

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException('API key is already revoked');
    }

    apiKey.status = ApiKeyStatus.REVOKED;
    apiKey.revokedAt = new Date();
    await apiKey.save();

    // Audit log
    await this.logAccess(
      apiKey._id as Types.ObjectId,
      userId,
      AccessAction.REVOKED,
      ipAddress,
      { reason: dto.reason },
    );

    return apiKey;
  }

  /**
   * Rotate an API key: generate a new key and revoke the old one.
   */
  async rotate(
    userId: string,
    keyId: string,
    dto: RotateApiKeyDto,
    ipAddress?: string,
  ): Promise<{ newApiKey: ApiKeyDocument; rawKey: string; oldApiKey: ApiKeyDocument }> {
    const oldApiKey = await this.findKeyOrFail(keyId, userId);

    if (oldApiKey.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException('Cannot rotate a revoked API key');
    }

    // Generate a new key (uses the old key's name if no new name provided)
    const newKeyName = dto.name || `${oldApiKey.name} (rotated)`;
    const { apiKey: newApiKey, rawKey } = await this.generate(
      userId,
      { name: newKeyName },
      ipAddress,
    );

    // Revoke the old key
    oldApiKey.status = ApiKeyStatus.REVOKED;
    oldApiKey.revokedAt = new Date();
    await oldApiKey.save();

    // Audit log for rotation
    await this.logAccess(
      oldApiKey._id as Types.ObjectId,
      userId,
      AccessAction.ROTATED,
      ipAddress,
      { newKeyId: (newApiKey._id as Types.ObjectId).toString() },
    );

    return { newApiKey, rawKey, oldApiKey };
  }

  /**
   * Find a key by ID and verify ownership.
   */
  private async findKeyOrFail(keyId: string, userId: string): Promise<ApiKeyDocument> {
    if (!Types.ObjectId.isValid(keyId)) {
      throw new BadRequestException('Invalid API key ID');
    }

    const apiKey = await this.apiKeyModel.findById(keyId);

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this API key');
    }

    return apiKey;
  }

  /**
   * Write an access/audit log entry.
   */
  private async logAccess(
    apiKeyId: Types.ObjectId,
    userId: string,
    action: AccessAction,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.accessLogModel.create({
      apiKeyId,
      userId: new Types.ObjectId(userId),
      action,
      ipAddress: ipAddress || undefined,
      metadata: metadata || {},
    });
  }
}
