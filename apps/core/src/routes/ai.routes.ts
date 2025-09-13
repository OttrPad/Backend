import { Router } from 'express';
import { generateAiContentHandler, aiRateLimit } from '../controllers/aiChatController';

const router: Router = Router();

// POST /ai/chat -> generate AI response (text and/or images)
router.post('/chat', aiRateLimit, generateAiContentHandler);

export default router;

