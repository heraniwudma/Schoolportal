import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const statusCode = res.statusCode;

          if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${duration}ms`);
            res.setHeader('Server-Timing', `total;dur=${duration}`);
          }

          if (duration >= 300) {
            this.logger.warn(
              `[SLOW ENDPOINT] ${method} ${url} completed with ${statusCode} in ${duration}ms`,
            );
          } else {
            this.logger.log(
              `${method} ${url} ${statusCode} - ${duration}ms`,
            );
          }
        },
        error: (err) => {
          const duration = Date.now() - start;
          this.logger.error(
            `[ERROR] ${method} ${url} failed after ${duration}ms - ${err?.message || err}`,
          );
        },
      }),
    );
  }
}
