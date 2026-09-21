import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

type UploadedMaterialFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}
  private supabaseUrl = process.env.DIRECT_URL ? process.env.DIRECT_URL.replace('postgres://', 'https://').split(':')[0] : '';
  // Since we don't have the service role key natively in env right now, we will try to use the project ref from the DB URL.
  // Actually, without the service key, we cannot upload. Let's ask the user to provide SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.
  // For the sake of this code, we assume SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY will be added.
  private supabase = createClient(
    process.env.SUPABASE_URL || this.extractSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'fake-key-for-now',
    { auth: { persistSession: false } }
  );

  private extractSupabaseUrl() {
    const dbUrl = process.env.DATABASE_URL || '';
    const match = dbUrl.match(/@(.*?)\.pooler/);
    if (match) {
      const parts = match[1].split('-');
      const ref = parts.length > 2 ? parts[0] : match[1]; // aws-0-eu-west-1.pooler.supabase.com doesn't easily give ref
      // Extract project reference from connection string (e.g. postgresql://postgres.[project-ref]:***@host:6543/postgres)
      const userMatch = dbUrl.match(/postgres\.(.*?):/);
      if (userMatch) {
        return `https://${userMatch[1]}.supabase.co`;
      }
    }
    return '';
  }

  async findAll(userId: string, role?: Role) {
    if (role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId },
        select: {
          id: true,
          classSectionId: true,
          StudentEnrollment: {
            where: { status: 'ACTIVE' },
            orderBy: { enrollmentDate: 'desc' },
            take: 1,
            select: { classSectionId: true },
          },
        },
      });
      const sectionId = student?.StudentEnrollment[0]?.classSectionId || student?.classSectionId;
      return this.prisma.material.findMany({
        where: {
          AND: [
            {
              OR: [
                { targetRole: 'all' },
                { targetRole: 'student' },
              ],
            },
            {
              OR: [
                { classSectionId: null },
                ...(sectionId ? [{ classSectionId: sectionId }] : []),
              ],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const where: any = {};
    if (role && role !== Role.ADMIN) {
      where.OR = [
        { targetRole: 'all' },
        { targetRole: role.toLowerCase() }
      ];
    }
    if (role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: {
          id: true,
          subjectSections: {
            select: { classSectionId: true },
          },
        },
      });
      const assignedSections = teacher?.subjectSections || [];
      where.OR = [
        ...(where.OR || []),
        { userId },
        ...(assignedSections.length ? [{ classSectionId: { in: assignedSections.map((item) => item.classSectionId) } }] : []),
      ];
    }
    return this.prisma.material.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  private mapCategory(category: string): string {
    const c = category?.toLowerCase() || '';
    if (c.includes('rule')) return 'rules';
    if (c.includes('notice')) return 'notices';
    return 'materials';
  }

  private mapTargetRole(role: string): string {
    const r = role?.toLowerCase() || '';
    if (r.includes('teacher')) return 'teacher';
    if (r.includes('student')) return 'student';
    if (r.includes('parent')) return 'parent';
    return 'all';
  }

  async create(createMaterialDto: CreateMaterialDto, file: UploadedMaterialFile, userId: string, role: Role) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase();
    const fileName = `${crypto.randomUUID()}-${sanitizedName}`;

    const { data: uploadData, error: uploadError } = await this.supabase.storage
      .from('materials')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage Upload Error:', uploadError);
      if (uploadError.message?.includes('Invalid Compact JWS') || uploadError.message?.includes('API key')) {
        throw new InternalServerErrorException('Supabase Service Role Key is missing or invalid. Please configure SUPABASE_SERVICE_ROLE_KEY in .env');
      }
      throw new InternalServerErrorException(`Storage Error: ${uploadError.message || 'Failed to upload file'}`);
    }

    try {
      if (role === Role.TEACHER) {
        if (!createMaterialDto.classSectionId) throw new BadRequestException('Choose one of your assigned sections');
        const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
        const assignment = teacher && await this.prisma.sectionSubjectTeacher.findFirst({ where: { teacherId: teacher.id, classSectionId: createMaterialDto.classSectionId } });
        if (!assignment) throw new BadRequestException('You can only target sections you teach');
      }
      return await this.prisma.material.create({
        data: {
          title: createMaterialDto.title,
          category: this.mapCategory(createMaterialDto.category),
          description: createMaterialDto.description,
          targetRole: this.mapTargetRole(createMaterialDto.target_role || 'All Users'),
          fileType: file.mimetype,
          fileName: file.originalname,
          fileSize: BigInt(file.size || 0),
          fileUrl: `materials/${fileName}`,
          userId,
          classSectionId: createMaterialDto.classSectionId || null,
        },
      });
    } catch (dbError: any) {
      // If DB insert fails, clean up the uploaded file
      console.error('Database Insert Error:', dbError);
      await this.supabase.storage.from('materials').remove([fileName]);
      throw new InternalServerErrorException(`Failed to save material to database. File was cleaned up. Error: ${dbError.message || dbError}`);
    }
  }

  async update(id: string, updateMaterialDto: UpdateMaterialDto, file?: UploadedMaterialFile) {
    const material = await this.findOne(id);
   let fileUrl = material.fileUrl;
let fileType = material.fileType;
let fileNameStr = material.fileName;
let fileSize = material.fileSize;

    if (file) {
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase();
      const fileName = `${crypto.randomUUID()}-${sanitizedName}`;

      const { error: uploadError } = await this.supabase.storage
        .from('materials')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Storage Upload Error:', uploadError);
        if (uploadError.message?.includes('Invalid Compact JWS') || uploadError.message?.includes('API key')) {
          throw new InternalServerErrorException('Supabase Service Role Key is missing or invalid. Please configure SUPABASE_SERVICE_ROLE_KEY in .env');
        }
        throw new InternalServerErrorException(`Storage Error: ${uploadError.message || 'Failed to upload new file'}`);
      }

      fileUrl = `materials/${fileName}`;
      fileType = file.mimetype;
      fileNameStr = file.originalname;
      fileSize = BigInt(file.size || 0);

      // Extract old file path and remove it
      const oldFilePathMatch = material.fileUrl?.match(/materials\/(.*)$/);
      if (oldFilePathMatch) {
        await this.supabase.storage.from('materials').remove([oldFilePathMatch[1]]);
      }
    }

    return this.prisma.material.update({
      where: { id },
      data: {
        title: updateMaterialDto.title,
        category: updateMaterialDto.category ? this.mapCategory(updateMaterialDto.category) : undefined,
        description: updateMaterialDto.description,
        targetRole: updateMaterialDto.target_role ? this.mapTargetRole(updateMaterialDto.target_role) : undefined,
        fileUrl: fileUrl,
        fileType: fileType,
        fileName: fileNameStr,
        fileSize: fileSize,
      },
    });
  }

  async remove(id: string) {
    const material = await this.findOne(id);
    
    const oldFilePathMatch = material.fileUrl?.match(/materials\/(.*)$/);
    if (oldFilePathMatch) {
      const { error } = await this.supabase.storage.from('materials').remove([oldFilePathMatch[1]]);
      if (error) {
        throw new InternalServerErrorException(`Failed to delete file from storage: ${error.message}`);
      }
    }

    await this.prisma.material.delete({ where: { id } });
    return { success: true };
  }

  async getDownloadUrl(id: string, userId: string, role: Role) {
    const where: any = { id };

    if (role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId },
        select: {
          id: true,
          classSectionId: true,
          StudentEnrollment: {
            where: { status: 'ACTIVE' },
            orderBy: { enrollmentDate: 'desc' },
            take: 1,
            select: { classSectionId: true },
          },
        },
      });
      const sectionId = student?.StudentEnrollment[0]?.classSectionId || student?.classSectionId;
      where.AND = [
        {
          OR: [
            { targetRole: 'all' },
            { targetRole: 'student' },
          ],
        },
        {
          OR: [
            { classSectionId: null },
            ...(sectionId ? [{ classSectionId: sectionId }] : []),
          ],
        },
      ];
    } else if (role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: {
          id: true,
          subjectSections: {
            select: { classSectionId: true },
          },
        },
      });
      const assignedSections = teacher?.subjectSections || [];
      where.OR = [
        { targetRole: 'all' },
        { targetRole: 'teacher' },
        { userId },
        ...(assignedSections.length ? [{ classSectionId: { in: assignedSections.map((item) => item.classSectionId) } }] : []),
      ];
    }

    const material = await this.prisma.material.findFirst({ where });
    if (!material) {
      throw new NotFoundException('Material not found or you do not have permission to download it');
    }

    const oldFilePathMatch = material.fileUrl?.match(/materials\/(.*)$/);
    const pathInBucket = (oldFilePathMatch ? oldFilePathMatch[1] : material.fileUrl) || '';
    
    const { data, error } = await this.supabase.storage.from('materials').createSignedUrl(pathInBucket, 300, {
      download: material.fileName || true,
    });
    
    if (error || !data) {
      const { data: publicData } = this.supabase.storage.from('materials').getPublicUrl(pathInBucket, {
        download: material.fileName || true,
      });
      return { 
        url: publicData.publicUrl, 
        downloadUrl: publicData.publicUrl,
        fileName: material.fileName || 'file',
      };
    }
    return { 
      url: data.signedUrl, 
      downloadUrl: data.signedUrl,
      fileName: material.fileName || 'file',
    };
  }

  async getAdminMaterials(userId: string, role: Role) {
    // Get all admin users
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true }
    });
    const adminIds = admins.map(admin => admin.id);

    // Build filter for admin materials visible to this role
    const where: any = {
      userId: { in: adminIds },
      OR: [
        { targetRole: 'all' },
        { targetRole: role.toLowerCase() }
      ]
    };

    // Exclude materials that belong to a specific class section (these are class-specific admin materials)
    // Only show global admin materials or those explicitly for this role
    where.classSectionId = null;

    return this.prisma.material.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
        targetRole: true
      }
    });
  }
}
