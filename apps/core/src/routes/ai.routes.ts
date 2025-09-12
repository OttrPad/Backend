import { Router } from 'express';
import { generateAiContentHandler, aiRateLimit } from '../controllers/aiChatController';

const router: Router = Router();

// POST /ai/chat -> generate AI response (text and/or images)
router.post('/chat', aiRateLimit, generateAiContentHandler);

export default router;

// import { Router } from 'express';
// import { chat, stream } from '../controllers/aiChatController';

// const router: Router = Router();

// /**
//  * POST /api/chat
//  * Body: { messages: [{role:'user'|'assistant', content:string}], config?: {...} }
//  * Returns: { text: string }
//  */
// router.post('/chat', chat);

// /**
//  * POST /api/stream
//  * Body: { messages: [{role:'user'|'assistant', content:string}], config?: {...} }
//  * Server-Sent Events stream (token-by-token)
//  */
// router.post('/stream', stream);

// export default router;
