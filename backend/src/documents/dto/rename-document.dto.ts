import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameDocumentDto {
  @IsString({ message: 'Vui lòng nhập tên tệp' })
  @MinLength(1, { message: 'Vui lòng nhập tên tệp' })
  @MaxLength(180, { message: 'Tên tệp quá dài' })
  filename!: string;
}
