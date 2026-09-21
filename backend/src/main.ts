import 'dotenv/config';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

const defaultCorsOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedCorsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigins = allowedCorsOrigins.length ? allowedCorsOrigins : defaultCorsOrigins;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (origin, callback) => {
      // Requests without an Origin header (for example health checks) are not
      // browser cross-origin requests and may proceed normally.
      callback(null, !origin || corsOrigins.includes(origin));
    },
    credentials: true,
  });
  app.getHttpAdapter().getInstance().set('etag', false);
  app.useGlobalInterceptors(new PerformanceInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
     // whitelist: true,
      //forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap();
