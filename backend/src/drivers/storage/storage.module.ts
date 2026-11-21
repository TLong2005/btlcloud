import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'path';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE, StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService => {
        const driver = config.getOrThrow<'s3' | 'local'>('storageDriver');
        if (driver === 's3') {
          return new S3StorageService(
            config.getOrThrow<string>('awsRegion'),
            config.getOrThrow<string>('s3Bucket'),
          );
        }
        return new LocalStorageService(path.resolve(process.cwd(), '.local-storage'));
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
