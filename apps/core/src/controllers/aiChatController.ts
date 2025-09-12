import { Request, Response } from 'express';
import AiChatService from '../services/aiChatService';

// Simple per-user (or IP) in-memory rate limiter (NOT production safe for multi-instance)
interface RateEntry { count: number; reset: number }
const rateMap = new Map<string, RateEntry>();
const WINDOW_MS = 60_000; // 1 min
const LIMIT = parseInt(process.env.AI_REQ_PER_MIN || '30');

export function aiRateLimit(req: Request, res: Response, next: Function) {
  const userId: string = (req.query['x-gateway-user-id'] as string) || (req.headers['x-gateway-user-id'] as string) || req.ip || 'anonymous';
  const now = Date.now();
  let entry = rateMap.get(userId);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + WINDOW_MS };
  }
  entry.count++;
  rateMap.set(userId, entry);
  if (entry.count > LIMIT) {
    const retrySec = Math.ceil((entry.reset - now)/1000);
    res.setHeader('Retry-After', String(retrySec));
    return res.status(429).json({ error: 'RATE_LIMIT_LOCAL', retryAfterSeconds: retrySec });
  }
  return next();
}

// Simple singleton instance (stateless wrapper around API)
const aiChatService = new AiChatService();

/**
 * POST /ai/chat
 * body: { prompt: string, options?: {...} }
 */
export const generateAiContentHandler = async (req: Request, res: Response) => {
  try {
    const { prompt, options } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt (string) is required' });
    }

    const result = await aiChatService.generate(prompt, options);
    res.json({ prompt, ...result, cached: false });
  } catch (err: any) {
    console.error('AI chat generation error:', err);
    const msg = String(err?.message || '').toLowerCase();
    const isQuota = err?.status === 429 || /quota|rate|exceeded/.test(msg);
    if (isQuota) {
      const retryAfterSeconds = 20;
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: 'RATE_LIMIT_UPSTREAM', message: 'AI provider quota exceeded. Retry later.', retryAfterSeconds });
    }
    res.status(500).json({ error: 'Failed to generate AI content', details: err.message || err });
  }
};

export default aiChatService;



// import { Request, Response } from 'express';
// import { AiChatService, ChatMessage } from '../services/aiChatService';

// const service = new AiChatService();

// /** Basic input guard */
// function parseMessages(body: any): ChatMessage[] {
//   const msgs = body?.messages;
//   if (!Array.isArray(msgs) || msgs.length === 0) {
//     throw new Error(
//       'Invalid payload. Expect: { messages: [{ role: "user"|"assistant", content: "..." }, ...] }'
//     );
//   }
//   for (const m of msgs) {
//     if (!m?.role || !m?.content) {
//       throw new Error('Each message needs { role, content }.');
//     }
//     if (m.role !== 'user' && m.role !== 'assistant') {
//       throw new Error('role must be "user" or "assistant".');
//     }
//   }
//   return msgs as ChatMessage[];
// }

// /** POST /api/chat  -> JSON (non-stream) */
// export async function chat(req: Request, res: Response) {
//   try {
//     const messages = parseMessages(req.body);
//     const config = req.body?.config ?? {}; // optional SDK config
//     const result = await service.generate(messages, config);
//     res.json(result);
//   } catch (e: any) {
//     console.error(e);
//     res.status(400).json({ error: e.message ?? 'Bad request' });
//   }
// }

// /** POST /api/stream  -> Server-Sent Events (stream tokens) */
// export async function stream(req: Request, res: Response) {
//   try {
//     const messages = parseMessages(req.body);
//     const config = req.body?.config ?? {};

//     // SSE headers
//     res.setHeader('Content-Type', 'text/event-stream');
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('Connection', 'keep-alive');

//     // Optional: allow CORS for SSE if needed (or use global cors())
//     // res.setHeader('Access-Control-Allow-Origin', '*');

//     for await (const token of service.stream(messages, config)) {
//       // Each token chunk as SSE "data" line
//       res.write(`data: ${token}\n\n`);
//     }

//     // Tell client we're done
//     res.write('event: done\ndata: [DONE]\n\n');
//     res.end();
//   } catch (e: any) {
//     console.error(e);
//     // Send an SSE error event if headers already sent
//     if (!res.headersSent) {
//       res.status(400).json({ error: e.message ?? 'Bad request' });
//     } else {
//       res.write(`event: error\ndata: ${JSON.stringify(e.message || 'error')}\n\n`);
//       res.end();
//     }
//   }
// }
