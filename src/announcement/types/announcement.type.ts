export interface AnnouncementEvents {
  newAnnouncement: (data: any) => void;
  announcementUpdated: (data: any) => void;
  announcementDeleted: (data: { announcementId: string; roomId: string }) => void;
  error: (error: { action: string; error: string; announcementId?: string }) => void;
}

export interface RedisAnnouncementPayload {
  type: 'new-announcement' | 'announcement-updated' | 'announcement-deleted';
  data: any;
  roomId: string;
  authorId: string;
}
