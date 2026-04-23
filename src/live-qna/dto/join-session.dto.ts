import { IsUUID } from 'class-validator';

export class JoinSessionDto {
  @IsUUID('4')
  roomId: string;

  @IsUUID('4')
  sessionId: string;
}
