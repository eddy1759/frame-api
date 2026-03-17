import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = this.getOrCreateRequestId(request);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        errorCode = (resp.code as string) || this.getDefaultErrorCode(status);
        message = (resp.message as string) || exception.message;
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = this.getDefaultErrorCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    // Log the error
    this.logger.error({
      statusCode: status,
      errorCode,
      message,
      path: request.url,
      method: request.method,
      ip: request.ip,
      requestId,
      timestamp: new Date().toISOString(),
    });

    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        statusCode: status,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private getDefaultErrorCode(status: number): string {
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      410: 'GONE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codeMap[status] || 'UNKNOWN_ERROR';
  }

  private getOrCreateRequestId(
    request: Request & { requestId?: string },
  ): string {
    if (request.requestId) {
      return request.requestId;
    }

    const headerValue = request.headers['x-request-id'];
    if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
      request.requestId = headerValue;
      return request.requestId;
    }

    if (Array.isArray(headerValue) && headerValue.length > 0) {
      const first = headerValue[0]?.trim();
      if (first) {
        request.requestId = first;
        return request.requestId;
      }
    }

    request.requestId = randomUUID();
    return request.requestId;
  }
}
