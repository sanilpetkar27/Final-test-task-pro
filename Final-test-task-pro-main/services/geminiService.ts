
import { GoogleGenAI } from "@google/genai";

// Note: process.env.API_KEY is handled externally by the environment.

/**
 * Handles professional chat interactions for dealership operations.
 * Uses gemini-3-pro-preview for complex reasoning and dealership domain knowledge.
 */
export const chatWithGemini = async (message: string, history: { role: string; text: string }[]) => {
  // Creating a new instance right before the call ensures we use the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Mapping history roles from UI (assistant) to Gemini (model)
  // Each content block must have a role and parts array.
  const contents = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));

  // Append current user message to the conversation history
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  // Use ai.models.generateContent directly to follow SDK guidelines
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: contents,
    config: {
      systemInstruction: 'You are an AI assistant for an auto dealership operations team. You help with task management, employee assignments, and tracking dealership finances. You know about payables (loans, inventory funding) and receivables (OEM incentives, insurance/finance payouts, warranty). Help staff manage their daily flow and financial follow-ups with professional, concise advice.',
    },
  });

  // Extracting text output directly from the text property as per documentation
  return response.text;
};
