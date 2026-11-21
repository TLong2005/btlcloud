import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CHAT_MODELS } from '../chat-models';

export class AskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Câu hỏi phải là chuỗi từ 1 đến 1000 ký tự' })
  @MinLength(1, { message: 'Câu hỏi phải có từ 1 đến 1000 ký tự' })
  @MaxLength(1000, { message: 'Câu hỏi phải có từ 1 đến 1000 ký tự' })
  question!: string;

  @IsOptional()
  @IsIn(CHAT_MODELS, { message: 'Mô hình không được hỗ trợ' })
  model?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Cuộc trò chuyện không hợp lệ' })
  conversationId?: string;
}
