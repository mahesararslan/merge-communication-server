import { Test, TestingModule } from '@nestjs/testing';
import { GeneralChatGateway } from './general-chat.gateway';

describe('GeneralChatGateway', () => {
  let gateway: GeneralChatGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeneralChatGateway],
    }).compile();

    gateway = module.get<GeneralChatGateway>(GeneralChatGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
