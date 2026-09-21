import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { UsersModule } from '../users/users.module';
import { TimetableModule } from '../timetable/timetable.module';

// PrismaService is provided globally by PrismaModule (registered in AppModule).
// Do NOT re-add it to providers here — a second local instance would open extra
// pgBouncer connections and exhaust the connection pool under concurrent load.
@Module({
  imports: [UsersModule, TimetableModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
