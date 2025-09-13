import AiChatService from '../services/aiChatService';

//pnpm test --reporter=default

// Mock the @google/genai package used by the service
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContentStream: jest.fn().mockImplementation(async ({ contents }) => {
          // Simulate an async iterator that yields chunks
          async function* gen() {
            yield { text: 'Hello' };
            yield { text: ' world' };
          }
          return gen();
        }),
      },
    })),
  };
});

describe('AiChatService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('generate returns combined text when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
  const svc = new AiChatService();
    const res = await svc.generate('hi');
    expect(res.texts[0]).toBe('Hello world');
  });

  test('generate throws when GEMINI_API_KEY missing', async () => {
    delete process.env.GEMINI_API_KEY;
  const svc = new AiChatService();
    await expect(svc.generate('hi')).rejects.toThrow('GEMINI_API_KEY not set');
  });
});
