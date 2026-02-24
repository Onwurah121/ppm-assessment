import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MongoError } from 'mongodb';

@Catch(MongoError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: MongoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    if (exception.code === 11000) {
      status = HttpStatus.CONFLICT;
      message = 'A record with this value already exists';
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: 'Database Error',
      timestamp: new Date().toISOString(),
    });
  }
}
