import { Message } from "src/entities/message.entity";

export interface DirectMessageEvents {
  newMessage: (message: Message) => void;
  messageDeleted: (data: { messageId: string; deletedFor: 'me' | 'everyone'; senderId: string; recipientId: string }) => void;
  messageUpdated: (message: Message) => void;
  error: (data: { action: string; error: string; messageId?: string }) => void;
}

export interface RedisMessagePayload {
  type: 'new-message' | 'message-deleted' | 'message-updated';
  data: any;
  recipientId?: string;
  senderId?: string;
}