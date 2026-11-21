import { LoggerService } from '@nestjs/common';

export function writeLog(entry: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({ ...entry, time: new Date().toISOString() })}\n`,
  );
}

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const entry: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      message,
    };
    if (context) {
      entry.context = context;
    }
    if (stack) {
      entry.stack = stack;
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
