import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RotateApiKeyDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;
}
