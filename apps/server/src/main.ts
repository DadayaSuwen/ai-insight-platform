import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the Vite dev server and the Docker web container.
  // FRONTEND_ORIGIN may be a single URL or a comma-separated list (e.g. "https://app.example.com,https://www.example.com").
  const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:8080'];
  const rawOrigin = process.env.FRONTEND_ORIGIN;
  const extraOrigins = rawOrigin
    ? rawOrigin.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...extraOrigins]));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
}
bootstrap();
