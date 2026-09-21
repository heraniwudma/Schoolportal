import { Module, forwardRef } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ResultsModule } from '../results/results.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ResultsModule)],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}