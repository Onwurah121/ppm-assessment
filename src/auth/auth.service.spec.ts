import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let jwtService: JwtService;

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    passwordHash: '$2b$12$hash',
    save: jest.fn(),
  };

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userModel = module.get(getModelToken(User.name));
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return a token', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@example.com',
        password: 'securePassword123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUserModel.create).toHaveBeenCalled();
      expect(mockJwtService.sign).toHaveBeenCalled();
    });

    it('should throw ConflictException if email is already registered', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({ email: 'test@example.com', password: 'securePassword123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully and return a token', async () => {
      const hashedPassword = await bcrypt.hash('securePassword123', 12);
      const userWithHash = { ...mockUser, passwordHash: hashedPassword };
      mockUserModel.findOne.mockResolvedValue(userWithHash);

      const result = await service.login({
        email: 'test@example.com',
        password: 'securePassword123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock-jwt-token');
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user without password hash', async () => {
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      mockUserModel.findById.mockReturnValue({ select: selectMock });

      const result = await service.validateUser('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockUser);
      expect(selectMock).toHaveBeenCalledWith('-passwordHash');
    });

    it('should return null for non-existent user', async () => {
      const selectMock = jest.fn().mockResolvedValue(null);
      mockUserModel.findById.mockReturnValue({ select: selectMock });

      const result = await service.validateUser('nonexistentid');

      expect(result).toBeNull();
    });
  });
});
