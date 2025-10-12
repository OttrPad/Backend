import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { generateAiContentHandler, aiRateLimit } from "../controllers/aiChatController";
import axios from "axios";
import { spawnSync } from "child_process";


const router: Router = Router();

// --- Existing Gemini AI endpoint ---
router.post("/chat", aiRateLimit, generateAiContentHandler);



// // --- Inline code suggestion using NVIDIA Phi-4 Mini ---
// router.post("/suggest", async (req, res) => {
//   const { contextBefore, contextAfter, language } = req.body;

//   try {
//     console.log("🚀 Sending inline suggestion request to NVIDIA...");


//     const response = await axios.post(
//     "https://integrate.api.nvidia.com/v1/chat/completions",
//     {
//         model: "microsoft/phi-4-mini-instruct",
//         messages: [
//         {
//             role: "user",
//             content: `Continue this ${language} code logically:\n${contextBefore} [CURSOR] ${contextAfter}`,
//         },
//         ],
//         temperature: 0.2,
//         max_tokens: 60,
//     },
//     {
//         headers: {
//         Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
//         "Content-Type": "application/json",
//         },
//         timeout: 12000,
//     }
//     );


//     const suggestion =
//       response.data.choices?.[0]?.message?.content?.trim() || "";
//     console.log("✅ NVIDIA response received:", suggestion);
//     res.json({ suggestion });
//     } catch (error: any) {
//         console.error("❌ Inline suggestion failed:", error.message);

//     if (error.code === "ECONNABORTED") {
//       return res.status(504).json({ error: "timeout", message: "NVIDIA took too long" });
//     }

//     res.status(500).json({ error: "NVIDIA request failed", details: error.message });
//   }
// });

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
    (typeof cursor !== "object" || cursor === null ||
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
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
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
        timeoutHandle = setTimeout(() => reject(new Error("gemini_timeout")), timeoutMs);
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

    console.error("❌ Gemini suggestion error:", err.message);
    res.status(500).json({
      error: "Gemini suggestion failed",
      details: err.message,
    });
  }
});




export default router;
