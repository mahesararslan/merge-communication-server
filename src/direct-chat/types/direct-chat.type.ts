import { Message } from "src/entities/message.entity";

export interface DirectMessageEvents {
  newMessage: (message: Message) => void;
}