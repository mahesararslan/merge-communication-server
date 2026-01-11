import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'https://www.mergeedu.app', 'http://localhost:5173', 'https://merge-frontend-five.vercel.app'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });


  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
