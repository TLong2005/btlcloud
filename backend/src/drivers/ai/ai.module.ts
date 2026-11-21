import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_SERVICE, AiService } from './ai.service';
import { BedrockAiService } from './bedrock-ai.service';
import { FallbackAiService } from './fallback-ai.service';
import { MockAiService } from './mock-ai.service';
import { OpenAiService } from './openai-ai.service';

@Module({
  providers: [
    {
      provide: AI_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiService => {
        const driver = config.getOrThrow<'bedrock' | 'mock' | 'openai'>('aiDriver');
        const openai = (): OpenAiService =>
          new OpenAiService(
            config.getOrThrow<string>('openaiApiKey'),
            config.getOrThrow<string>('openaiBaseUrl'),
            config.getOrThrow<string>('openaiChatModel'),
            config.getOrThrow<string>('openaiEmbeddingModel'),
          );
        if (driver === 'bedrock') {
          const bedrock = new BedrockAiService(
            config.getOrThrow<string>('awsRegion'),
            config.getOrThrow<string>('bedrockEmbeddingModelId'),
            config.getOrThrow<string>('bedrockChatModelId'),
          );
          return config.get<string | null>('openaiApiKey')
            ? new FallbackAiService(bedrock, openai())
            : bedrock;
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
