import { IsUUID } from 'class-validator';

export class DeleteAnnouncementDto {
  @IsUUID('4')
  announcementId: string;

  @IsUUID('4')
  roomId: string;
}
