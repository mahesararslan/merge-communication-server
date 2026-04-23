export type LiveQnaQuestionStatus = 'open' | 'answered';

export interface LiveQnaQuestion {
  id: string;
  roomId: string;
  sessionId: string;
  content: string;
  status: LiveQnaQuestionStatus;
  votesCount: number;
  viewerHasVoted?: boolean;
  isMine?: boolean;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    image?: string | null;
  };
  answeredBy?: {
    id: string;
    firstName: string;
    lastName: string;
    image?: string | null;
  } | null;
  answeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveQnaEvents {
  questionCreated: (question: LiveQnaQuestion) => void;
  questionUpdated: (question: LiveQnaQuestion) => void;
  questionRemoved: (data: {
    id: string;
    roomId: string;
    sessionId: string;
  }) => void;
  error: (data: { action: string; error: string; questionId?: string }) => void;
}

export type LiveQnaRedisEventType =
  | 'question-created'
  | 'question-updated'
  | 'question-removed';

export interface LiveQnaRedisPayload {
  type: LiveQnaRedisEventType;
  roomId: string;
  sessionId: string;
  data: any;
}

export interface WebSocketResponse<T = any> {
  success: boolean;
  error?: string;
  message?: string;
  payload?: T;
}
