import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const PUBLIC_REGISTRATION_ROLES = ['student', 'teacher', 'parent'] as const;

export class RegisterDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString({ message: 'Full name must be text' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  name!: string;

  @IsNotEmpty({ message: 'ID Number is required' })
  @IsString({ message: 'ID Number must be text' })
  @MinLength(2, { message: 'ID Number must be at least 2 characters' })
  idNumber!: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Student ID must be at least 2 characters' })
  studentId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsEmail({}, { message: 'Please enter a valid account email address' })
  email?: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsNotEmpty({ message: 'Confirm Password is required' })
  @IsString()
  @MinLength(8, { message: 'Confirm password must be at least 8 characters long' })
  confirmPassword!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(PUBLIC_REGISTRATION_ROLES, { message: 'Selected role is invalid' })
  role?: (typeof PUBLIC_REGISTRATION_ROLES)[number];

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  classSectionId?: string;

  @IsOptional()
  @IsString()
  grades?: string;

  @IsOptional() @IsString() institutionId?: string;
  @IsOptional() @IsString() institutionName?: string;
  @IsOptional() @IsString() fatherName?: string;
  @IsOptional() @IsString() grandfatherName?: string;
  @IsOptional() @IsString() admissionType?: string;
  @IsOptional() @IsString() disability?: string;
  @IsOptional() @IsString() disabilityType?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() familyKebele?: string;
  @IsOptional() @IsString() locationType?: string;
  @IsOptional() @IsString() fatherEducationLevel?: string;
  @IsOptional() @IsString() motherEducationLevel?: string;
  @IsOptional() @IsString() economicStatus?: string;
  @IsOptional() @IsString() guardianFullName?: string;
  @IsOptional() @IsString() familyHeadGender?: string;
  @IsOptional() @Transform(({ value }) => (value === '' || value === null ? undefined : value)) @IsEmail({}, { message: 'Please enter a valid parent/guardian email address' }) guardianEmail?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() residenceRegion?: string;
  @IsOptional() @IsString() residenceZone?: string;
  @IsOptional() @IsString() residenceWoreda?: string;
  @IsOptional() @IsString() birthRegion?: string;
  @IsOptional() @IsString() birthZone?: string;
  @IsOptional() @IsString() birthWoreda?: string;
  @IsOptional() @IsString() parentStatus?: string;
}
