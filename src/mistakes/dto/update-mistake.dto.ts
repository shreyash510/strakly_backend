import { PartialType } from '@nestjs/mapped-types';
import { CreateMistakeDto } from './create-mistake.dto';

export class UpdateMistakeDto extends PartialType(CreateMistakeDto) {}
