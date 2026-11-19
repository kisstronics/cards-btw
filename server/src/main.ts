import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const clientUrl = config.get<string>('CLIENT_URL') || 'http://localhost:5173';

  app.use(cookieParser());
  app.enableCors({
    origin: clientUrl,
    credentials: true,
  });

  const port = config.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`Between server listening on http://localhost:${port}`);
}

bootstrap();
