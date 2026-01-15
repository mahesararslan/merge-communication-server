import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class PostAnnouncementDto {
  @IsUUID('4')
  roomId: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
