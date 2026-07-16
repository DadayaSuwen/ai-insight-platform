import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let detail: string | object =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';
    // NestJS 的 message 可能是对象 { message, error, statusCode }
    const msg = typeof detail === 'object' && detail !== null
      ? ((detail as any).message || JSON.stringify(detail))
      : String(detail);

    response.status(status).json({
      success: false,
      error: { code: `HTTP_${status}`, message: msg },
    });
  }
}