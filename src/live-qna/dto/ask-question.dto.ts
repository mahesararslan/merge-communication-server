import { IsString, IsUUID, MaxLength } from 'class-validator';

export class AskQuestionDto {
  @IsUUID('4')
  roomId: string;

  @IsUUID('4')
  sessionId: string;

  @IsString()
  @MaxLength(500)
  content: string;
}
