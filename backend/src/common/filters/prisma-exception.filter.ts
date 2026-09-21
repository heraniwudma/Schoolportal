import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Global exception filter that converts Prisma infrastructure errors into
 * clean HTTP responses. Key goals:
 *
 *  - P1001 (Can't reach database)  → 503 Service Unavailable
 *  - P1008 (Operations timed out)  → 503 Service Unavailable
 *  - P1017 (Server closed connection) → 503 Service Unavailable
 *  - P2002 (Unique constraint)     → 409 Conflict  (with field detail)
 *  - P2025 (Record not found)      → 404 Not Found
 *  - All other known Prisma errors → 400 Bad Request with the error code
 *
 * This filter does NOT swallow errors or hide P1001.  The error code and a
 * user-facing message are always included in the response body so callers can
 * react accordingly.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Pass through NestJS HttpExceptions unchanged — they already have the
    // correct status and message set by the throwing service.
    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    // ── Prisma: can't reach the database (P1001 family) ─────────────────────
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      const isConnectivity =
        exception.errorCode === 'P1001' ||
        exception.errorCode === 'P1008' ||
        exception.errorCode === 'P1017' ||
        exception.message.includes("Can't reach database server") ||
        exception.message.includes('timed out');

      const status = isConnectivity
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.INTERNAL_SERVER_ERROR;

      this.logger.error(
        `[${exception.errorCode ?? 'PrismaInit'}] Database connectivity error — ${exception.message.split('\n')[0]}`,
      );

      return response.status(status).json({
        statusCode: status,
        error: isConnectivity ? 'Service Unavailable' : 'Internal Server Error',
        message: isConnectivity
          ? 'The database is temporarily unavailable. Please try again in a moment.'
          : 'A database initialisation error occurred.',
        prismaCode: exception.errorCode ?? null,
      });
    }

    // ── Prisma: known request errors ─────────────────────────────────────────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const code = exception.code;
      this.logger.warn(`[Prisma ${code}] ${exception.message.split('\n')[0]}`);

      switch (code) {
        case 'P2002': {
          const fields = (exception.meta?.target as string[]) ?? [];
          return response.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: `A record with this ${fields.join(', ') || 'value'} already exists.`,
            prismaCode: code,
          });
        }
        case 'P2025':
          return response.status(HttpStatus.NOT_FOUND).json({
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: (exception.meta?.cause as string) ?? 'Record not found.',
            prismaCode: code,
          });
        default:
          return response.status(HttpStatus.BAD_REQUEST).json({
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: exception.message.split('\n')[0],
            prismaCode: code,
          });
      }
    }

    // ── Prisma: validation errors ────────────────────────────────────────────
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`[PrismaValidation] ${exception.message.split('\n')[0]}`);
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid query parameters.',
      });
    }

    // ── Fallback: unexpected errors ──────────────────────────────────────────
    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`[Unhandled] ${message}`);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
  }
}
