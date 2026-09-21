import { Module } from '@nestjs/common';
import { ReportCardsService } from './report-cards.service';
import { ReportCardsController } from './report-cards.controller';
import { TeachersModule } from '../teachers/teachers.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [TeachersModule, ReportsModule],
  controllers: [ReportCardsController],
  providers: [ReportCardsService],
  exports: [ReportCardsService],
})
export class ReportCardsModule {}