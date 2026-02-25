import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RevokeApiKeyDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}
