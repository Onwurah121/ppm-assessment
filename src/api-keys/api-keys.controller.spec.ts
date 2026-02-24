import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyStatus } from './schemas/api-key.schema';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: ApiKeysService;

  const userId = new Types.ObjectId();
  const keyId = new Types.ObjectId();

  const mockUser = { _id: userId, email: 'test@example.com' };
  const mockReq = { ip: '127.0.0.1' } as any;

  const mockApiKey = {
    _id: keyId,
    keyPrefix: 'ppm_abc12345',
    name: 'Test Key',
    userId,
    status: ApiKeyStatus.ACTIVE,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
  };

  const mockService = {
    generate: jest.fn(),
    list: jest.fn(),
    revoke: jest.fn(),
    rotate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    service = module.get<ApiKeysService>(ApiKeysService);

    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate a new API key', async () => {
      mockService.generate.mockResolvedValue({
        apiKey: mockApiKey,
        rawKey: 'ppm_abc12345def67890',
      });

      const result = await controller.generate(mockUser, { name: 'Test Key' }, mockReq);

      expect(result.message).toContain('generated successfully');
      expect(result.data).toHaveProperty('key', 'ppm_abc12345def67890');
      expect(result.data).toHaveProperty('keyPrefix');
      expect(mockService.generate).toHaveBeenCalledWith(
        userId.toString(),
        { name: 'Test Key' },
        '127.0.0.1',
      );
    });
  });

  describe('list', () => {
    it('should list user API keys', async () => {
      mockService.list.mockResolvedValue([mockApiKey]);

      const result = await controller.list(mockUser);

      expect(result.message).toContain('retrieved successfully');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('name', 'Test Key');
      expect(result.data[0]).not.toHaveProperty('keyHash');
    });

    it('should return empty list when user has no keys', async () => {
      mockService.list.mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('revoke', () => {
    it('should revoke an API key', async () => {
      const revokedKey = {
        ...mockApiKey,
        status: ApiKeyStatus.REVOKED,
        revokedAt: new Date(),
      };
      mockService.revoke.mockResolvedValue(revokedKey);

      const result = await controller.revoke(
        mockUser,
        keyId.toString(),
        { reason: 'Testing' },
        mockReq,
      );

      expect(result.message).toContain('revoked successfully');
      expect(result.data.status).toBe(ApiKeyStatus.REVOKED);
    });
  });

  describe('rotate', () => {
    it('should rotate an API key', async () => {
      const newKeyId = new Types.ObjectId();
      mockService.rotate.mockResolvedValue({
        newApiKey: {
          ...mockApiKey,
          _id: newKeyId,
          name: 'Rotated Key',
          createdAt: new Date(),
        },
        rawKey: 'ppm_newkey12345',
        oldApiKey: {
          ...mockApiKey,
          status: ApiKeyStatus.REVOKED,
          revokedAt: new Date(),
        },
      });

      const result = await controller.rotate(
        mockUser,
        keyId.toString(),
        { name: 'Rotated Key' },
        mockReq,
      );

      expect(result.message).toContain('rotated successfully');
      expect(result.data).toHaveProperty('newKey');
      expect(result.data).toHaveProperty('oldKey');
      expect(result.data.newKey.key).toBe('ppm_newkey12345');
      expect(result.data.oldKey.status).toBe(ApiKeyStatus.REVOKED);
    });
  });
});
