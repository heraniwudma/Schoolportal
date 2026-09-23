import 'dotenv/config';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';

declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function (this: bigint) {
  return Number(this);
};

function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  // Always permit local frontend dev origins
  origins.add('http://localhost:5173');
  origins.add('http://127.0.0.1:5173');

  // Support FRONTEND_URL (single URL or comma-separated URLs)
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((url) => origins.add(url));
  }

  // Support CORS_ORIGINS (comma-separated URLs)
  if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((url) => origins.add(url));
  }

  return Array.from(origins);
}

const allowedOrigins = getAllowedOrigins();

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const dbUrlPresent = Boolean(process.env.DATABASE_URL);
  const dbUrlLen = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.length
    : 0;

  logger.log(
    `[Diagnostic] DATABASE_URL defined: ${dbUrlPresent}, length: ${dbUrlLen}`,
  );

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.getHttpAdapter().getInstance().set('etag', false);

  app.useGlobalInterceptors(new PerformanceInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);

  logger.log(`Server listening on ${host}:${port}`);
}

bootstrap();