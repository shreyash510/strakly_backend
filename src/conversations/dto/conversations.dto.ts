import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  botConversationId?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class SaveExchangeDto {
  @IsString()
  userMessage: string;

  @IsString()
  assistantMessage: string;

  @IsOptional()
  @IsString()
  botConversationId?: string;

  @IsOptional()
  @IsArray()
  toolsUsed?: string[];

  @IsOptional()
  @IsArray()
  suggestedQuestions?: string[];
}
