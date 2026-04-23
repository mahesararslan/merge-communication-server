import { IsUUID } from 'class-validator';

export class VoteQuestionDto {
  @IsUUID('4')
  roomId: string;

  @IsUUID('4')
  sessionId: string;

  @IsUUID('4')
  questionId: string;
}
