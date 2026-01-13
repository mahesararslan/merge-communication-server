import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class UpdateMessageDto {
  @IsUUID('4')
  messageId: string;

  @IsUUID('4')
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  attachmentURL?: string;
}
