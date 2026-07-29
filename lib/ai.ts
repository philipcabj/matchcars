import { getGenerativeModel, HarmBlockThreshold, HarmCategory } from "firebase/vertexai";
import { vertexAI } from "./firebase";
import { logger } from "./logger";

// Initialize the model
const model = getGenerativeModel(vertexAI, { 
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
});

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

function parseBox(input: any): BoundingBox | null {
  try {
    let box = input;
    // Handle array input (e.g. if AI returns [box])
    if (Array.isArray(box)) {
      if (box.length > 0) box = box[0];
      else return null;
    }

    // Handle nested keys like "box" or "bounding_box"
    if (box.box) box = box.box;
    else if (box.bounding_box) box = box.bounding_box;

    // Normalize keys to lowercase to handle case variations
    const norm: any = {};
    if (typeof box === 'object' && box !== null) {
        for (const k in box) {
            norm[k.toLowerCase()] = box[k];
        }
    } else {
        return null;
    }

    // Extract coordinates with fallback keys (ymin/y_min/top, etc)
    // Also handle string values by parsing float
    const ymin = parseFloat(String(norm.ymin ?? norm.y_min ?? norm.top));
    const xmin = parseFloat(String(norm.xmin ?? norm.x_min ?? norm.left));
    const ymax = parseFloat(String(norm.ymax ?? norm.y_max ?? norm.bottom));
    const xmax = parseFloat(String(norm.xmax ?? norm.x_max ?? norm.right));

    // Check if valid numbers
    if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax)) {
      return { ymin, xmin, ymax, xmax };
    }
  } catch (e) {
    console.error("Error parsing box:", e);
  }
  return null;
}

export type AIResult = {
  success: boolean;
  box?: BoundingBox;
  error?: string;
};

/**
 * Detects the license plate in an image using Gemini 2.0 Flash.
 */
export async function detectLicensePlate(base64Image: string): Promise<AIResult> {
  try {
  const prompt = `
    Analyze this image and find the bounding box of the car license plate.
    Return ONLY a valid JSON object with keys: ymin, xmin, ymax, xmax (normalized 0-1 coordinates).
    
    CRITICAL RULES:
    1. Identify the MAIN license plate (the one most visible).
    2. The box MUST be a tight rectangle around the plate itself.
    3. Exclude any car brand, logo, or text on the body of the car above or below the plate.
    4. Coordinates are 0.0 to 1.0 (top-left is 0,0; bottom-right is 1,1).
    5. If no plate is found, return null.
    
    Example: {"ymin": 0.65, "xmin": 0.45, "ymax": 0.72, "xmax": 0.55}
  `;

    // Strip data:image/jpeg;base64, prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();
    
    // Clean up markdown if present
    let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Find JSON object boundaries (robust)
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    
    // Fix common JSON errors from AI (like trailing commas or brackets)
    jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/]\s*}/g, "}");

    logger.log("AI Response (Plate):", jsonStr);

    // Sometimes the model returns "null" as a string
    if (jsonStr === "null" || !jsonStr) return { success: false, error: "AI returned null/empty." };

    try {
      const parsed = JSON.parse(jsonStr);
      const box = parseBox(parsed);
      
      if (box) {
        return { success: true, box };
      }
      return { success: false, error: "Invalid JSON structure. Raw: " + text.substring(0, 100) };
    } catch (e) {
      console.error("Error parsing AI response:", text);
      return { success: false, error: "JSON parse error. Raw: " + text.substring(0, 100) };
    }
    
  } catch (error: any) {
    console.error("Error detecting license plate:", error);
    return { success: false, error: error.message || "Unknown AI error" };
  }
}

/**
 * Detects the car in an image using Gemini 2.0 Flash.
 */
export async function detectCar(base64Image: string): Promise<AIResult> {
  try {
    const prompt = `
    Analyze this image and find the bounding box of the main car (vehicle).
    Return ONLY a JSON object with keys: ymin, xmin, ymax, xmax (normalized 0-1 coordinates).
    
    RULES:
    1. Find the PRIMARY vehicle in the image.
    2. The box should encompass the entire visible car.
    3. Include a small margin around the car.
    4. If the car is partially cropped, return the box for the visible part.
    5. Be generous: if there is a car, detect it. Do not return null unless the image is completely empty of cars.
  `;

    // Strip data:image/jpeg;base64, prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();
    
    // Clean up markdown if present
    let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Find JSON object boundaries
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    
    logger.log("AI Response (Car):", jsonStr);

    // Sometimes the model returns "null" as a string
    if (jsonStr === "null" || !jsonStr) return { success: false, error: "AI returned null or empty response" };

    try {
      const parsed = JSON.parse(jsonStr);
      const box = parseBox(parsed);
      if (box) {
        return { success: true, box };
      }
      return { success: false, error: "Invalid JSON structure from AI. Raw: " + text.substring(0, 100) };
    } catch (e) {
      console.error("Error parsing AI response:", text);
      return { success: false, error: "JSON parse error: " + text.substring(0, 100) };
    }
    
  } catch (error: any) {
    console.error("Error detecting car:", error);
    return { success: false, error: error.message || "Unknown AI error" };
  }
}
