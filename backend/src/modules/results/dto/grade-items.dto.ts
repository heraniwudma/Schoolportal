import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetGradeItemsDto {
  @IsString()
  @IsNotEmpty({ message: 'classSectionId is required' })
  classSectionId!: string;

  @IsString()
  @IsNotEmpty({ message: 'subjectId is required' })
  subjectId!: string;

  @IsString()
  @IsNotEmpty({ message: 'academicYearId is required' })
  academicYearId!: string;

  @IsOptional()
  @IsString()
  term?: string;
}

export class UpdateGradeItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Item name is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum mark must be a valid number' })
  @IsPositive({ message: 'Maximum mark must be greater than zero' })
  maxMark!: number;

  @IsString()
  @IsNotEmpty({ message: 'classSectionId is required' })
  classSectionId!: string;

  @IsString()
  @IsNotEmpty({ message: 'subjectId is required' })
  subjectId!: string;

  @IsString()
  @IsNotEmpty({ message: 'academicYearId is required' })
  academicYearId!: string;

  @IsOptional()
  @IsString()
  term?: string;
}
