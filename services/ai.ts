
import { GoogleGenAI } from "@google/genai";

// NOTE: The API key is assumed to be available in process.env.API_KEY
export const getBattleCommentary = async (
  scoreWest: number,
  scoreEast: number,
  unitsWest: number,
  unitsEast: number
): Promise<string> => {
  // Initialize GoogleGenAI with the API key from environment variables
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prompt = `
      You are a 19th-century war correspondent observing a battle between East and West.
      Current Status:
      West Side: ${scoreWest} points, ${unitsWest} active troops.
      East Side: ${scoreEast} points, ${unitsEast} active troops.
      
      Provide a witty, dramatic, and short (max 2 sentences) commentary on who is winning or the intensity of the fight.
      Use old-timey language like "Gadzooks!", "By Jove!", etc.
    `;

    // Use gemini-3-flash-preview for basic text tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        // Removed maxOutputTokens to comply with thinkingBudget guidelines when thinking is default
        temperature: 0.8,
      }
    });

    // Access the text property directly from the response
    return response.text || "The radio is silent...";
  } catch (error) {
    console.error("AI Commentary Error:", error);
    return "Static interference on the line...";
  }
};
