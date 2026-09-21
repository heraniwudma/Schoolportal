import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class SaveRosterDraftDto {
  @IsString()
  @IsNotEmpty()
  classSectionId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsOptional()
  conductData?: any;
}

export class SaveConductDto {
  @IsString()
  @IsNotEmpty()
  classSectionId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsNotEmpty()
  conductData!: Record<string, string>;
}


export class SubmitRosterDto {
  @IsString()
  @IsNotEmpty()
  classSectionId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsOptional()
  @IsIn(['roster', 'report-cards', 'both'])
  type?: 'roster' | 'report-cards' | 'both';

  @IsOptional()
  conductData?: Record<string, string>;
}

export class RejectRosterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;
}

export class ReopenRosterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;
}
