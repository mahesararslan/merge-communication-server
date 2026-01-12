import { IsUUID } from 'class-validator';

export class DeleteMessageDto {
  @IsUUID('4')
  messageId: string;
}
