import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RotateApiKeyDto {
  @ApiPropertyOptional({
    example: 'Rotated Production Key',
    description: 'Optional new name for the rotated key',
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;
}
