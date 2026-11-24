import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_SERVICE, AiService } from './ai.service';
import { BedrockAiService } from './bedrock-ai.service';
import { FallbackAiService } from './fallback-ai.service';
import { MockAiService } from './mock-ai.service';
import { OpenAiService } from './openai-ai.service';
import { resolveOpenAiApiKey } from './resolve-openai-key';

@Module({
  providers: [
    {
      provide: AI_SERVICE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<AiService> => {
        const driver = config.getOrThrow<'bedrock' | 'mock' | 'openai'>('aiDriver');
        const apiKey = await resolveOpenAiApiKey({
          apiKey: config.get<string | null>('openaiApiKey') ?? null,
          secretArn: config.get<string | null>('openaiSecretArn') ?? null,
          awsRegion: config.getOrThrow<string>('awsRegion'),
        });
        const openai = (): OpenAiService => {
          if (!apiKey) {
            throw new Error('Set OPENAI_API_KEY or OPENAI_SECRET_ARN');
          }
          return new OpenAiService(
            apiKey,
            config.getOrThrow<string>('openaiBaseUrl'),
            config.getOrThrow<string>('openaiChatModel'),
            config.getOrThrow<string>('openaiEmbeddingModel'),
          );
        };
        if (driver === 'bedrock') {
          const bedrock = new BedrockAiService(
            config.getOrThrow<string>('awsRegion'),
            config.getOrThrow<string>('bedrockEmbeddingModelId'),
            config.getOrThrow<string>('bedrockChatModelId'),
          );
          return apiKey ? new FallbackAiService(bedrock, openai()) : bedrock;
        }
        if (driver === 'openai') {
          return openai();
        }
        return new MockAiService();
      },
    },
  ],
  exports: [AI_SERVICE],
})
export class AiModule {}
