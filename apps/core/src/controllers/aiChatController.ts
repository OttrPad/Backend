// import { Request, Response } from 'express';
// import AiChatService from '../services/aiChatService';

// // Simple per-user (or IP) in-memory rate limiter (NOT production safe for multi-instance)
// interface RateEntry { count: number; reset: number }
// const rateMap = new Map<string, RateEntry>();
// const WINDOW_MS = 60_000; // 1 min
// const LIMIT = parseInt(process.env.AI_REQ_PER_MIN || '30');

// export function aiRateLimit(req: Request, res: Response, next: Function) {
//   const userId: string = (req.query['x-gateway-user-id'] as string) || (req.headers['x-gateway-user-id'] as string) || req.ip || 'anonymous';
//   const now = Date.now();
//   let entry = rateMap.get(userId);
//   if (!entry || now > entry.reset) {
//     entry = { count: 0, reset: now + WINDOW_MS };
//   }
//   entry.count++;
//   rateMap.set(userId, entry);
//   if (entry.count > LIMIT) {
//     const retrySec = Math.ceil((entry.reset - now)/1000);
//     res.setHeader('Retry-After', String(retrySec));
//     return res.status(429).json({ error: 'RATE_LIMIT_LOCAL', retryAfterSeconds: retrySec });
//   }
//   return next();
// }

// // Simple singleton instance (stateless wrapper around API)
// const aiChatService = new AiChatService();

// /**
//  * POST /ai/chat
//  * body: { prompt: string, options?: {...} }
//  */
// export const generateAiContentHandler = async (req: Request, res: Response) => {
//   try {
//     const { prompt, options } = req.body || {};
//     if (!prompt || typeof prompt !== 'string') {
//       return res.status(400).json({ error: 'prompt (string) is required' });
//     }

//     const result = await aiChatService.generate(prompt, options);
//     res.json({ prompt, ...result, cached: false });
//   } catch (err: any) {
//     console.error('AI chat generation error:', err);
//     const msg = String(err?.message || '').toLowerCase();
//     const isQuota = err?.status === 429 || /quota|rate|exceeded/.test(msg);
//     if (isQuota) {
//       const retryAfterSeconds = 20;
//       res.setHeader('Retry-After', String(retryAfterSeconds));
//       return res.status(429).json({ error: 'RATE_LIMIT_UPSTREAM', message: 'AI provider quota exceeded. Retry later.', retryAfterSeconds });
//     }
//     res.status(500).json({ error: 'Failed to generate AI content', details: err.message || err });
//   }
// };

// export default aiChatService;




// aiChatController.ts
import { Request, Response, NextFunction } from 'express';
import { AIChatService } from '../services/aiChatService';

const service = new AIChatService();

export const aiRateLimit = (_req: Request, _res: Response, next: NextFunction) => next();

export const generateAiContentHandler = async (req: Request, res: Response) => {
  try {
    const body: any = req.body;

    // 🔑 Accept "prompt" (from your frontend) or "input" (from curl/Postman)
    const input =
      (typeof body?.prompt === 'string' && body.prompt) ||
      (typeof body?.input === 'string' && body.input) ||
      (typeof body === 'string' && body) || // raw text fallback
      '';

    if (!input.trim()) {
      return res.status(400).json({ error: 'input/prompt is required' });
    }

    const stream: boolean = !!(body?.stream ?? body?.sse);
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

    // ✅ Respond in the same shape your frontend expects
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
