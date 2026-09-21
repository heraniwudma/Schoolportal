import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfExportService } from './pdf-export.service';
import { ResultsModule } from '../results/results.module';

@Module({
  imports: [PrismaModule, ResultsModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfExportService],
  exports: [ReportsService, PdfExportService],
})
export class ReportsModule {}
