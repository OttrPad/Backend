// aiChatController.ts
import { Request, Response, NextFunction } from 'express';
import { AIChatService } from '../services/aiChatService';

const service = new AIChatService();

// prevent user makes too many requests
export const aiRateLimit = (_req: Request, _res: Response, next: NextFunction) => next();

export const generateAiContentHandler = async (req: Request, res: Response) => {
  try {
    const body: any = req.body;

    // Accept "prompt" (from your frontend) or "input" (from curl/Postman)
    const input =
      (typeof body?.prompt === 'string' && body.prompt) ||
      (typeof body?.input === 'string' && body.input) ||
      (typeof body === 'string' && body) || // raw text fallback
      '';

    if (!input.trim()) {
      return res.status(400).json({ error: 'input/prompt is required' });
    }

    const stream: boolean = !!(body?.stream ?? body?.sse); // check whether the client requested streaming
    const userMessage = [{ role: "user" as "user", content: input.trim() }];

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      for await (const token of service.generateStream(userMessage)) {
        res.write(`data: ${token}\n\n`);
      }
      res.write('event: done\ndata: [DONE]\n\n');
      return res.end();
    }

    const text = await service.generateText(userMessage);

    // Respond in the same shape the frontend expects
    return res.json({
      prompt: input,
      texts: [text],
      images: [],
      cached: false,
    });
  } catch (err: any) {
    console.error('AI error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Generation failed' });
  }
};
