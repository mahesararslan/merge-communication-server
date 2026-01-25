import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  IsArray,
} from 'class-validator';
import { Attachment } from '../types/general-chat.type';

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
  @IsArray()
  attachments?: Attachment[];
}
