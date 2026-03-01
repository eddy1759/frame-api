import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AddressInfo } from 'net';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { setupSwagger } from './common/config/swagger.config';

const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';
const keepAliveTimeout = parseInt(
  process.env.HTTP_KEEP_ALIVE_TIMEOUT || '65000',
  10,
);
const headersTimeout = parseInt(
  process.env.HTTP_HEADERS_TIMEOUT || '66000',
  10,
);
const requestTimeout = parseInt(
  process.env.HTTP_REQUEST_TIMEOUT || '120000',
  10,
);

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Security
  app.use(helmet());

  const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global Prefix
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  //Swagger (non-production only)
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
    logger.log(`Swagger docs available at /api/docs`);
  }

  // Global Filters & Interceptors (added after Swagger to avoid interfering with docs)
  app.useGlobalFilters(new GlobalExceptionFilter());
  const accessLogEnabled =
    process.env.HTTP_ACCESS_LOG_ENABLED?.toLowerCase() === 'true';
  if (accessLogEnabled || process.env.NODE_ENV === 'production') {
    app.useGlobalInterceptors(
      new LoggingInterceptor(),
      new TransformInterceptor(),
    );
  } else {
    app.useGlobalInterceptors(new TransformInterceptor());
  }

  const server = (await app.listen(port, host)) as unknown as {
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
    address(): AddressInfo | string | null;
  };

  server.keepAliveTimeout = keepAliveTimeout;
  server.headersTimeout = headersTimeout;
  server.requestTimeout = requestTimeout;

  const boundAddress = server.address();
  const listenHost =
    typeof boundAddress === 'object' && boundAddress
      ? boundAddress.address
      : host;
  const listenPort =
    typeof boundAddress === 'object' && boundAddress ? boundAddress.port : port;

  logger.log(
    `Frame API running on http://${listenHost}:${listenPort}/${apiPrefix}`,
  );
  logger.log(
    `Health check: http://${listenHost}:${listenPort}/${apiPrefix}/health`,
  );
  logger.log(`Environment: ${process.env.NODE_ENV}`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed', err);
  process.exit(1);
});
