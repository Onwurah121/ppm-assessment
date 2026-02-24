import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeApiKeyDto {
  @ApiPropertyOptional({
    example: 'Key compromised',
    description: 'Optional reason for revocation',
    maxLength: 200,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}
