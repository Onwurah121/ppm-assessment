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
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RevokeApiKeyDto } from './dto/revoke-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  async generate(
    @CurrentUser() user: any,
    @Body() dto: CreateApiKeyDto,
    @Req() req: Request,
  ) {
    const response = await this.apiKeysService.generate(
      user._id.toString(),
      dto,
      req.ip,
    );

    return response;
  }

  @Get()
  async list(@CurrentUser() user: any) {
    const keys = await this.apiKeysService.list(user._id.toString());

    return keys;
  }

  @Patch(':id/revoke')
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

    return apiKey;
  }

  @Post(':id/rotate')
  async rotate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RotateApiKeyDto,
    @Req() req: Request,
  ) {
    const response = await this.apiKeysService.rotate(
      user._id.toString(),
      id,
      dto,
      req.ip,
    );

    return response;
  }
}
