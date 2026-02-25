import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
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
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Generate a new API key for the user.
   * Returns the raw key only once — it is stored as a bcrypt hash.
   */
  async generate(
    userId: string,
    dto: CreateApiKeyDto,
    ipAddress?: string,
  ): Promise<any> {
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
    const rawKey = `ppm_${crypto.randomUUID().replace(/-/g, '')}`;
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

    return {
      message: 'API key generated successfully. Store the key securely — it will not be shown again.',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        key: rawKey,
        status: apiKey.status,
        expiresAt: apiKey.expiresAt,
        createdAt: (apiKey as any).createdAt,
      },
    };
  }

  /**
   * List all API keys for the authenticated user.
   * Never returns the key hash.
   */
  async list(userId: string): Promise<any> {
    let data = await this.apiKeyModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .exec();

    return {
      message: 'API keys retrieved successfully',
      data: data.map((key) => ({
        id: key._id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        status: key.status,
        expiresAt: key.expiresAt,
        createdAt: (key as any).createdAt,
        revokedAt: key.revokedAt,
      })),
    };
  }

  /**
   * Revoke an active API key.
   */
  async revoke(
    userId: string,
    keyId: string,
    dto: RevokeApiKeyDto,
    ipAddress?: string,
  ): Promise<any> {
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

    return {
      message: 'API key revoked successfully',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        status: apiKey.status,
        revokedAt: apiKey.revokedAt,
      },
    };
  }

  /**
   * Rotate an API key: revoke the old one and generate a new one.
   * Both operations are wrapped in a MongoDB transaction — if anything
   * fails, both the revocation and the new key creation are rolled back.
   */
  async rotate(
    userId: string,
    keyId: string,
    dto: RotateApiKeyDto,
    ipAddress?: string,
  ): Promise<any> {
    const oldApiKey = await this.findKeyOrFail(keyId, userId);

    if (oldApiKey.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException('Cannot rotate a revoked API key');
    }

    const session = await this.connection.startSession();

    try {
      let result: any;

      await session.withTransaction(async () => {
        // Step 1: Revoke the old key
        oldApiKey.status = ApiKeyStatus.REVOKED;
        oldApiKey.revokedAt = new Date();
        await oldApiKey.save({ session });

        // Step 2: Generate a new key inside the same session
        const newKeyName = dto.name || `${oldApiKey.name} (rotated)`;
        const rawKey = `ppm_${crypto.randomUUID().replace(/-/g, '')}`;
        const keyPrefix = rawKey.substring(0, 12);
        const keyHash = await bcrypt.hash(rawKey, 10);

        const [newApiKey] = await this.apiKeyModel.create(
          [
            {
              keyHash,
              keyPrefix,
              name: newKeyName,
              userId: new Types.ObjectId(userId),
              status: ApiKeyStatus.ACTIVE,
              expiresAt: null,
            },
          ],
          { session },
        );

        // Step 3: Audit log for the rotation
        await this.accessLogModel.create(
          [
            {
              apiKeyId: oldApiKey._id,
              userId: new Types.ObjectId(userId),
              action: AccessAction.ROTATED,
              ipAddress: ipAddress || undefined,
              metadata: { newKeyId: (newApiKey._id as Types.ObjectId).toString() },
            },
          ],
          { session },
        );

        result = {
          message: 'API key rotated successfully. Store the new key securely — it will not be shown again.',
          data: {
            newKey: {
              id: newApiKey._id,
              name: newApiKey.name,
              keyPrefix: newApiKey.keyPrefix,
              key: rawKey,
              status: newApiKey.status,
              expiresAt: newApiKey.expiresAt,
              createdAt: (newApiKey as any).createdAt,
            },
            oldKey: {
              id: oldApiKey._id,
              name: oldApiKey.name,
              keyPrefix: oldApiKey.keyPrefix,
              status: oldApiKey.status,
              revokedAt: oldApiKey.revokedAt,
            },
          },
        };
      });

      return result;
    } finally {
      await session.endSession();
    }
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
