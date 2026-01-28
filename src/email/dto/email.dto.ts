import { IsString, IsEmail, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentDto {
  @ApiProperty({ description: 'Base64 encoded content of the attachment' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Filename of the attachment' })
  @IsString()
  filename: string;

  @ApiPropertyOptional({ description: 'MIME type of the attachment' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Content disposition (attachment or inline)' })
  @IsOptional()
  @IsString()
  disposition?: string;
}

export class SendEmailDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({ description: 'Recipient name' })
  @IsOptional()
  @IsString()
  toName?: string;

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: 'Plain text content' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'HTML content' })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({ description: 'Sender email address (defaults to configured from address)' })
  @IsOptional()
  @IsEmail()
  from?: string;

  @ApiPropertyOptional({ description: 'Sender name' })
  @IsOptional()
  @IsString()
  fromName?: string;

  @ApiPropertyOptional({ description: 'Reply-to email address' })
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiPropertyOptional({ description: 'CC recipients', type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({ description: 'BCC recipients', type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiPropertyOptional({ description: 'Email attachments', type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class SendBulkEmailDto {
  @ApiProperty({ description: 'Recipient email addresses', type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  to: string[];

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: 'Plain text content' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'HTML content' })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({ description: 'Sender email address' })
  @IsOptional()
  @IsEmail()
  from?: string;

  @ApiPropertyOptional({ description: 'Sender name' })
  @IsOptional()
  @IsString()
  fromName?: string;
}

export class SendTemplateEmailDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  to: string;

  @ApiProperty({ description: 'SendGrid template ID' })
  @IsString()
  templateId: string;

  @ApiPropertyOptional({ description: 'Dynamic template data' })
  @IsOptional()
  dynamicTemplateData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Sender email address' })
  @IsOptional()
  @IsEmail()
  from?: string;

  @ApiPropertyOptional({ description: 'Sender name' })
  @IsOptional()
  @IsString()
  fromName?: string;
}
