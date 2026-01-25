import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  ValidateIf,
  IsArray,
} from 'class-validator';
import { Attachment } from '../types/general-chat.type';

export class SendMessageDto {
  @IsUUID('4')
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsArray()
  attachments?: Attachment[];

  @IsOptional()
  @IsUUID('4')
  replyToId?: string;

  @ValidateIf(
    (o) => !o.content && (!o.attachments || o.attachments.length === 0),
  )
  @IsString({ message: 'Either content or attachments must be provided' })
  _validator?: string;
}
