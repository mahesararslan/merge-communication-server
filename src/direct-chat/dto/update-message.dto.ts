import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class UpdateMessageDto {
  @IsUUID('4')
  messageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  attachmentURL?: string;
}
