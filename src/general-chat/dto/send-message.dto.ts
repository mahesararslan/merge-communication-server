import { IsString, IsUUID, IsOptional, MaxLength, ValidateIf } from 'class-validator';

export class SendMessageDto {
  @IsUUID('4')
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  attachmentURL?: string;

  @IsOptional()
  @IsUUID('4')
  replyToId?: string;

  @ValidateIf(o => !o.content && !o.attachmentURL)
  @IsString({ message: 'Either content or attachmentURL must be provided' })
  _validator?: string;
}
