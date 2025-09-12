import { GoogleGenAI } from '@google/genai';

// Minimal result shape consumed by controller
export interface GenerateResult { texts: string[]; images: any[] }
export interface GenerateOptions { model?: string }

export default class AiChatService {
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const model = options.model || 'gemini-2.0-flash-lite';
    const ai = new GoogleGenAI({ apiKey });
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const stream = await ai.models.generateContentStream({ model, config: {}, contents });
    let full = '';
    for await (const chunk of stream) {
      if (chunk.text) full += chunk.text;
    }
    return { texts: [full], images: [] };
  }
}

