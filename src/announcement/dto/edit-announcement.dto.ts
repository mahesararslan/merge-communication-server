import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class EditAnnouncementDto {
  @IsUUID('4')
  announcementId: string;

  @IsUUID('4')
  roomId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
