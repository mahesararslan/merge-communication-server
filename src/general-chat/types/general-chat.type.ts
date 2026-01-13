import { GeneralChatMessage } from '../../entities/general-chat-message.entity';

export interface GeneralChatEvents {
  newMessage: (message: GeneralChatMessage) => void;
  messageUpdated: (message: GeneralChatMessage) => void;
  messageDeleted: (data: { messageId: string; deletedFor: 'everyone'; roomId: string; authorId: string }) => void;
  error: (data: { action: string; error: string; messageId?: string }) => void;
}

export interface RedisMessagePayload {
  type: 'new-message' | 'message-updated' | 'message-deleted';
  data: any;
  roomId: string;
  authorId?: string;
}
