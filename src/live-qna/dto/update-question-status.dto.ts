import { IsIn, IsUUID } from 'class-validator';

export class UpdateQuestionStatusDto {
  @IsUUID('4')
  roomId: string;

  @IsUUID('4')
  sessionId: string;

  @IsUUID('4')
  questionId: string;

  @IsIn(['open', 'answered'], {
    message: 'status must be either "open" or "answered"',
  })
  status: 'open' | 'answered';
}
