import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the Vite dev server and the Docker web container.
  // FRONTEND_ORIGIN may be a single URL or a comma-separated list (e.g. "https://app.example.com,https://www.example.com").
  const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:8080'];
  const rawOrigin = process.env.FRONTEND_ORIGIN;
  const extraOrigins = rawOrigin
    ? rawOrigin.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...extraOrigins]));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // [M7] X-Request-ID middleware — 为每个 HTTP 请求生成唯一 traceId
  //   1. 优先读客户端传入的 header (前端可串联用户行为)
  //   2. 否则生成 UUID
  //   3. 写回响应 header + 挂到 req 上 (供 controller 读取注入 AsyncLocalStorage)
  app.use((req: any, res: any, next: any) => {
    const traceId =
      (req.headers['x-request-id'] as string | undefined) || randomUUID();
    res.setHeader('X-Request-ID', traceId);
    req.traceId = traceId;
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
}
bootstrap();
