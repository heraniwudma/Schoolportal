import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Emit warn-level Prisma events as native Node events so the logger
      // below can pick them up without polluting info logs.
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      datasources: {
        db: {
          // Re-read at construction time so hot-reload picks up .env changes.
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Forward Prisma warn/error events to NestJS logger.
    (this as unknown as Prisma.PrismaClientOptions & {
      $on: (event: string, cb: (e: any) => void) => void;
    }).$on('warn', (e: { message: string; timestamp: Date }) => {
      this.logger.warn(`[Prisma] ${e.message}`);
    });

    (this as unknown as Prisma.PrismaClientOptions & {
      $on: (event: string, cb: (e: any) => void) => void;
    }).$on('error', (e: { message: string; timestamp: Date }) => {
      this.logger.error(`[Prisma] ${e.message}`);
    });
  }

  async onModuleInit() {
    // Retry connection up to 5 times with back-off to handle
    // transient Supabase pooler latency at cold start.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connection established');
        return;
      } catch (err) {
        const isLast = attempt === 5;
        const message = (err as Error).message.split('\n')[0];
        this.logger.warn(
          `DB connect attempt ${attempt}/5 failed: ${message}`,
        );
        if (isLast) {
          this.logger.error(
            'All DB connection attempts failed. ' +
              'Verify DATABASE_URL, Supabase project status, and network access.',
          );
          throw err;
        }
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Translates known Prisma infrastructure errors into clean HTTP exceptions
   * with actionable messages. Call this from catch blocks in services when
   * you want to surface connectivity problems clearly instead of a generic 500.
   *
   * Usage:
   *   catch (err) { throw this.prisma.handleDbError(err); }
   */
  handleDbError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      // P1001 – Can't reach database server
      if (
        err.errorCode === 'P1001' ||
        err.message.includes("Can't reach database server")
      ) {
        this.logger.error(
          `[P1001] Database unreachable — check Supabase project status and DATABASE_URL. ${err.message.split('\n')[0]}`,
        );
        return new ServiceUnavailableException(
          'The database is temporarily unreachable. Please try again in a moment.',
        );
      }
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Surface the code so callers can decide but don't lose the original.
      this.logger.error(`[Prisma ${err.code}] ${err.message.split('\n')[0]}`);
    }

    // Re-throw everything else unchanged — let the global exception filter handle it.
    return err as Error;
  }
}
