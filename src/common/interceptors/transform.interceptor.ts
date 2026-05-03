import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = this.getOrCreateRequestId(request);

    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      map(
        (data: T): ApiResponse<T> => ({
          success: true,
          data,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        }),
      ),
    );
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
