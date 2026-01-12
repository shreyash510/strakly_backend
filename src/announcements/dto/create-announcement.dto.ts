import { IsString, IsOptional, IsMongoId } from 'class-validator';

export class CreateAnnouncementDto {
  @IsMongoId()
  gymId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  content?: string;
}
