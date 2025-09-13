// aiChatService.ts
import { GoogleGenAI } from '@google/genai';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const MODEL = 'gemini-2.0-flash-lite';

const SYSTEM_PROMPT = `
You are CodeMate, the built-in AI coding assistant inside this collaborative editor. Feel like part of the editor, not an external bot.

Tone & Behavior:
- Friendly, concise, and supportive.
- If the user greets you ("hi", "hello"), respond warmly and introduce yourself as their coding assistant in this editor.
- Always focus on helping with coding, debugging, explanations, or brainstorming.

Core Abilities:
- Answer coding questions with step-by-step explanations.
- Suggest working code snippets in Python and Markdown.
- Detect possible errors in user code and explain fixes simply.
- Summarize or refactor code on request.
- Provide short, plain-language explanations for beginners; provide advanced reasoning only when asked.

Guidelines:
- Keep responses short and clear by default; expand only if user asks "why" or "explain deeply".
- Always format code in fenced code blocks in your responses.
- When explaining errors: first state what is wrong, then show corrected code.
- If the user asks something unrelated to code, politely guide them back to coding tasks.
- Stay safe, respectful, and avoid insecure or harmful code.

Context:
- Real-time collaborative code editor. Multiple users may work in the same room.
- Assume users may be beginners; explanations should be approachable.
`.trim();

export class AIChatService {
  private ai: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateText(messages: ChatMessage[]): Promise<string> {
    const contents = this.mapToContents(messages); // Convert messages into the shape the model expects

    const resp = await this.ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
        responseMimeType: 'text/plain',
      },
    });

    // @ts-ignore
    return resp.text ??
      // fallback
      (resp as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ??
      '';
  }

  async *generateStream(messages: ChatMessage[]): AsyncGenerator<string> {
    const contents = this.mapToContents(messages);

    const stream = await this.ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
        responseMimeType: 'text/plain',
      },
    });

    for await (const chunk of stream) {
      if ((chunk as any).text) yield (chunk as any).text;
    }
  }

  private mapToContents(messages: ChatMessage[]) {
    return messages.map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
  }
}

// Backwards-compatible default export used by tests and callers that expect
// a simple `AiChatService` class with `generate(prompt)` returning { texts, images }
export default class AiChatService {
  async generate(prompt: string, options: any = {}) {
    const svc = new AIChatService();
    // Collect stream text
    let full = '';
    for await (const chunk of svc.generateStream([{ role: 'user', content: prompt }])) {
      full += chunk;
    }
    return { texts: [full], images: [] };
  }
}




