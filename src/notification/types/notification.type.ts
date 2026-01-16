export interface NotificationEvents {
  notification: (data: NotificationPayload) => void;
}

export interface NotificationPayload {
  id: string;
  content: string;
  isRead: boolean;
  metadata?: {
    roomId?: string;
    roomTitle?: string;
    sessionId?: string;
    quizId?: string;
    fileId?: string;
    senderId?: string;
    senderName?: string;
    actionUrl?: string;
    [key: string]: any;
  };
  expiresAt?: Date;
  createdAt: Date;
}

export interface RedisNotificationPayload {
  type: 'notification';
  data: NotificationPayload;
  userId: string;
}
