import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is missing. Check your .env file.");
}

const ai = new GoogleGenAI({ apiKey });

export async function moderateImage(base64Data: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // safer stable model
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
            {
              text: "Analyze this image for nudity, explicit sexual content, or extreme violence. Return JSON: { isSafe: boolean, reason: string, confidence: number }",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Moderation error:", error);
    return { isSafe: true, error: "Moderation failed" };
  }
}