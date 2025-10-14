import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  generateAiContentHandler,
  aiRateLimit,
} from "../controllers/aiChatController";

const router: Router = Router();

// --- Existing Gemini AI endpoint ---
router.post("/chat", aiRateLimit, generateAiContentHandler);




const SUGGESTION_DEBOUNCE_MS = Number(
  process.env.AI_SUGGEST_DEBOUNCE_MS || "1000"
);

const suggestionCooldown = new Map<string, number>();
const pruneCooldown = (now: number) => {
  if (suggestionCooldown.size < 500) {
    return;
  }

  const cutoff = now - SUGGESTION_DEBOUNCE_MS * 10;
  for (const [key, timestamp] of suggestionCooldown.entries()) {
    if (timestamp < cutoff) {
      suggestionCooldown.delete(key);
    }
  }
};





// --- Inline code suggestion using Google Gemini ---
router.post("/suggest", async (req, res) => {
  const { contextBefore, contextAfter, language, cursor } = req.body ?? {};

  // Trace incoming payload to verify gateway/core handoff
  console.log("[AI Suggest] Incoming payload", {
    contextBefore,
    contextAfter,
    language,
    cursor,
  });

  if (
    typeof contextBefore !== "string" ||
    typeof contextAfter !== "string" ||
    typeof language !== "string"
  ) {
    return res.status(400).json({
      error: "invalid_payload",
      message:
        "contextBefore, contextAfter, and language must be provided as strings",
    });
  }

  if (
    cursor !== undefined &&
    (typeof cursor !== "object" ||
      cursor === null ||
      typeof cursor.line !== "number" ||
      typeof cursor.column !== "number")
  ) {
    return res.status(400).json({
      error: "invalid_cursor",
      message: "cursor must include numeric line and column when provided",
    });
  }

  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || "12000");
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      console.warn(
        "[AI Suggest] GEMINI_API_KEY not set; returning empty suggestions"
      );
      return res
        .status(200)
        .json({
          items: [],
          meta: { provider: "gemini", reason: "missing_api_key" },
        });
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const prompt = `
You are a lightweight inline code completion assistant.
Continue the following ${language} code naturally and correctly.

Code before cursor:
${contextBefore}

[CURSOR]

Code after cursor:
${contextAfter}

Respond ONLY with the next logical few lines of code (no explanations, no markdown, no quotes).
    `;

    const suggestionPromise = (async () => {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: { responseMimeType: "text/plain" },
      });

      const rawText = (() => {
        // Coerce SDK response regardless of whether text is a method or plain string
        const maybeText = (response as any)?.text;

        if (typeof maybeText === "function") {
          return maybeText.call(response);
        }

        if (typeof maybeText === "string") {
          return maybeText;
        }

        return (response as any)?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text || "")
          .join("");
      })();

      return (rawText || "").trim();
    })();

    const suggestion = await Promise.race([
      suggestionPromise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("gemini_timeout")),
          timeoutMs
        );
      }),
    ]);

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    res.json({
      items: suggestion
        ? [
            {
              text: suggestion,
              language,
              cursor,
            },
          ]
        : [],
      meta: { provider: "gemini", model: "gemini-2.0-flash-lite" },
    });
  } catch (err: any) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    if (err?.message === "gemini_timeout") {
      console.error("❌ Gemini suggestion timed out after", timeoutMs, "ms");
      return res
        .status(504)
        .json({ error: "timeout", message: "Gemini took too long" });
    }

    // Try to detect rate limiting / quota exhaustion and degrade gracefully
    const rawMsg = typeof err?.message === "string" ? err.message : String(err);
    const statusCode = Number(err?.status || err?.code || 0);
    if (
      statusCode === 429 ||
      /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(rawMsg) ||
      /"code"\s*:\s*429/.test(rawMsg)
    ) {
      console.warn(
        "⚠️ Gemini rate limited or quota exhausted; returning empty suggestions"
      );
      return res.status(200).json({
        items: [],
        meta: { provider: "gemini", reason: "rate_limited", raw: undefined },
      });
    }

    console.error("❌ Gemini suggestion error:", rawMsg);
    res.status(500).json({
      error: "Gemini suggestion failed",
      details: rawMsg,
    });
  }
});

export default router;
