import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RevokeApiKeyDto } from './dto/revoke-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new API key' })
  @ApiResponse({ status: 201, description: 'API key generated successfully' })
  @ApiResponse({ status: 400, description: 'Max active keys reached or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generate(
    @CurrentUser() user: any,
    @Body() dto: CreateApiKeyDto,
    @Req() req: Request,
  ) {
    const { apiKey, rawKey } = await this.apiKeysService.generate(
      user._id.toString(),
      dto,
      req.ip,
    );

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

  @Get()
  @ApiOperation({ summary: 'List all API keys for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of API keys' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@CurrentUser() user: any) {
    const keys = await this.apiKeysService.list(user._id.toString());

    return {
      message: 'API keys retrieved successfully',
      data: keys.map((key) => ({
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

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  @ApiResponse({ status: 400, description: 'Key already revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your key' })
  async revoke(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RevokeApiKeyDto,
    @Req() req: Request,
  ) {
    const apiKey = await this.apiKeysService.revoke(
      user._id.toString(),
      id,
      dto,
      req.ip,
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

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key — creates a new key and revokes the old one' })
  @ApiResponse({ status: 201, description: 'API key rotated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot rotate revoked key or max keys reached' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your key' })
  async rotate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RotateApiKeyDto,
    @Req() req: Request,
  ) {
    const { newApiKey, rawKey, oldApiKey } = await this.apiKeysService.rotate(
      user._id.toString(),
      id,
      dto,
      req.ip,
    );

    return {
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
  }
}
