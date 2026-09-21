import { IsOptional, IsString, IsNumber, IsPositive, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Assignment title cannot be empty' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  dueDate?: string | Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum mark must be a valid number' })
  @IsPositive({ message: 'Maximum mark must be greater than zero' })
  maxMark?: number;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  classSectionId?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
