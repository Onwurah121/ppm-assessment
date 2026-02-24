import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiKeysService } from './api-keys.service';
import { ApiKey, ApiKeyStatus } from './schemas/api-key.schema';
import { AccessLog } from './schemas/access-log.schema';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let apiKeyModel: any;
  let accessLogModel: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const keyId = new Types.ObjectId();

  const mockApiKey = {
    _id: keyId,
    keyHash: '$2b$10$hashed',
    keyPrefix: 'ppm_abc12345',
    name: 'Test Key',
    userId: new Types.ObjectId(userId),
    status: ApiKeyStatus.ACTIVE,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
  };

  const mockApiKeyModel = {
    countDocuments: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  };

  const mockAccessLogModel = {
    create: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: getModelToken(ApiKey.name), useValue: mockApiKeyModel },
        { provide: getModelToken(AccessLog.name), useValue: mockAccessLogModel },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    apiKeyModel = module.get(getModelToken(ApiKey.name));
    accessLogModel = module.get(getModelToken(AccessLog.name));

    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate a new API key successfully', async () => {
      mockApiKeyModel.countDocuments.mockResolvedValue(0);
      mockApiKeyModel.create.mockResolvedValue({ ...mockApiKey });

      const result = await service.generate(userId, { name: 'Test Key' });

      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('rawKey');
      expect(result.rawKey).toMatch(/^ppm_/);
      expect(mockApiKeyModel.countDocuments).toHaveBeenCalled();
      expect(mockApiKeyModel.create).toHaveBeenCalled();
      expect(mockAccessLogModel.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when max active keys reached', async () => {
      mockApiKeyModel.countDocuments.mockResolvedValue(3);

      await expect(
        service.generate(userId, { name: 'Too Many Keys' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockApiKeyModel.create).not.toHaveBeenCalled();
    });

    it('should allow generating key when user has fewer than 3 active keys', async () => {
      mockApiKeyModel.countDocuments.mockResolvedValue(2);
      mockApiKeyModel.create.mockResolvedValue({ ...mockApiKey });

      const result = await service.generate(userId, { name: 'Key 3' });

      expect(result).toHaveProperty('rawKey');
    });
  });

  describe('list', () => {
    it('should return list of user keys without hash', async () => {
      const execMock = jest.fn().mockResolvedValue([mockApiKey]);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      const selectMock = jest.fn().mockReturnValue({ sort: sortMock });
      mockApiKeyModel.find.mockReturnValue({ select: selectMock });

      const result = await service.list(userId);

      expect(result).toEqual([mockApiKey]);
      expect(selectMock).toHaveBeenCalledWith('-keyHash');
    });
  });

  describe('revoke', () => {
    it('should revoke an active key successfully', async () => {
      const activeKey = {
        ...mockApiKey,
        status: ApiKeyStatus.ACTIVE,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      mockApiKeyModel.findById.mockResolvedValue(activeKey);

      const result = await service.revoke(userId, keyId.toString(), { reason: 'Testing' });

      expect(activeKey.save).toHaveBeenCalled();
      expect(activeKey.status).toBe(ApiKeyStatus.REVOKED);
      expect(activeKey.revokedAt).toBeInstanceOf(Date);
      expect(mockAccessLogModel.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException for already revoked key', async () => {
      const revokedKey = {
        ...mockApiKey,
        status: ApiKeyStatus.REVOKED,
      };
      mockApiKeyModel.findById.mockResolvedValue(revokedKey);

      await expect(
        service.revoke(userId, keyId.toString(), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent key', async () => {
      const fakeId = new Types.ObjectId().toString();
      mockApiKeyModel.findById.mockResolvedValue(null);

      await expect(
        service.revoke(userId, fakeId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the key', async () => {
      const otherUserKey = {
        ...mockApiKey,
        userId: new Types.ObjectId(otherUserId),
      };
      mockApiKeyModel.findById.mockResolvedValue(otherUserKey);

      await expect(
        service.revoke(userId, keyId.toString(), {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid key ID format', async () => {
      await expect(
        service.revoke(userId, 'not-a-valid-id', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rotate', () => {
    it('should rotate an active key successfully', async () => {
      const activeKey = {
        ...mockApiKey,
        status: ApiKeyStatus.ACTIVE,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      mockApiKeyModel.findById.mockResolvedValue(activeKey);
      // For the generate call inside rotate: count = 1 (the old key counts, but we're about to revoke it)
      mockApiKeyModel.countDocuments.mockResolvedValue(1);
      const newKeyId = new Types.ObjectId();
      mockApiKeyModel.create.mockResolvedValue({
        ...mockApiKey,
        _id: newKeyId,
        name: 'Rotated Key',
      });

      const result = await service.rotate(userId, keyId.toString(), { name: 'Rotated Key' });

      expect(result).toHaveProperty('newApiKey');
      expect(result).toHaveProperty('rawKey');
      expect(result).toHaveProperty('oldApiKey');
      expect(activeKey.status).toBe(ApiKeyStatus.REVOKED);
      expect(activeKey.revokedAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException when rotating a revoked key', async () => {
      const revokedKey = {
        ...mockApiKey,
        status: ApiKeyStatus.REVOKED,
      };
      mockApiKeyModel.findById.mockResolvedValue(revokedKey);

      await expect(
        service.rotate(userId, keyId.toString(), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use default name when none provided during rotation', async () => {
      const activeKey = {
        ...mockApiKey,
        name: 'Original Key',
        status: ApiKeyStatus.ACTIVE,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      mockApiKeyModel.findById.mockResolvedValue(activeKey);
      mockApiKeyModel.countDocuments.mockResolvedValue(1);
      mockApiKeyModel.create.mockResolvedValue({
        ...mockApiKey,
        name: 'Original Key (rotated)',
      });

      const result = await service.rotate(userId, keyId.toString(), {});

      expect(result.newApiKey.name).toBe('Original Key (rotated)');
    });
  });
});
