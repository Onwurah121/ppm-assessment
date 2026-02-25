import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as dns from 'node:dns';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // DNS Configuration
  logger.log(`Default DNS servers: ${dns.getServers()}`);
  dns.setServers(['1.1.1.1']);
  logger.log(`New DNS servers: ${dns.getServers()}`);

  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  app.enableCors();

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filters
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new MongoExceptionFilter(),
  );


  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
