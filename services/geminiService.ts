
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Asset, Room, SiteInfo, ChatMessage } from '../types';

// process.env.API_KEY is injected by the environment.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const cropImage = async (base64Image: string, bbox: { x: number, y: number, width: number, height: number }): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      try {
        if (!bbox) { 
            console.warn("No bbox provided, returning original");
            resolve(base64Image); 
            return; 
        }

        // Sanitize inputs (Clamp to 0-1 range to prevent canvas errors)
        const x = Math.max(0, Math.min(1, bbox.x));
        const y = Math.max(0, Math.min(1, bbox.y));
        const w = Math.max(0, Math.min(1, bbox.width));
        const h = Math.max(0, Math.min(1, bbox.height));

        const canvas = document.createElement('canvas');
        
        // Calculate pixel dimensions
        const pixelX = Math.floor(x * img.width);
        const pixelY = Math.floor(y * img.height);
        let pixelW = Math.floor(w * img.width);
        let pixelH = Math.floor(h * img.height);

        // Ensure minimum 1px dimension
        if (pixelW < 1) pixelW = 1;
        if (pixelH < 1) pixelH = 1;
        
        // Ensure we don't draw outside bounds
        if (pixelX + pixelW > img.width) pixelW = img.width - pixelX;
        if (pixelY + pixelH > img.height) pixelH = img.height - pixelY;

        canvas.width = pixelW;
        canvas.height = pixelH;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error("Canvas context failed");
          resolve(base64Image);
          return;
        }

        ctx.drawImage(img, pixelX, pixelY, pixelW, pixelH, 0, 0, pixelW, pixelH);
        resolve(canvas.toDataURL('image/jpeg'));
      } catch (e) {
        console.error("Cropping exception:", e);
        resolve(base64Image); // Fallback to full image
      }
    };
    img.onerror = () => {
        console.error("Failed to load image for cropping");
        resolve(base64Image); // Fallback to full image
    };
    img.src = base64Image;
  });
};

export const detectAssetsWithBoundingBoxes = async (images: { dataUrl: string }[], allowedCategories: string[], privacyMode: boolean = false): Promise<Asset[]> => {
  if (!apiKey) throw new Error("API Key not found");

  const categoriesContext = allowedCategories.map(cat => `- ${cat}`).join('\n');

  const prompt = `
    You are a Professional Building Surveyor conducting a Facility Condition Assessment aligned with ISO 55000 standards.
    
    CONTEXT:
    The user has provided ${images.length} images of the **SAME ROOM** taken from different angles. 
    You must treat these images as a single 3D environment.

    YOUR TASKS:
    1. **3D SPATIAL DEDUPLICATION (CRITICAL)**: 
       - **Analyze the spatial layout** to understand that the same physical object (e.g. the same door, the same AC unit) appears in multiple photos.
       - **MERGE observations**: If "Asset A" in Image 1 is the same physical object as "Asset B" in Image 2, create **ONLY ONE** entry.
       - Use the 'appearsInImageIndices' field to list ALL image indices where this specific object is visible (e.g. [0, 2]).
       - Select the **single best image** (clearest view) for the 'sourceImageIndex' and 'boundingBox'.
    
    2. **SCOPE OF DETECTION (STRICT)**:
       - **INCLUDE**: Fixed Building Fabric (walls, ceilings, floors, doors, windows), Electrical Services (lights, switches, boards), HVAC (AC, fans, ducts), Plumbing (sinks, toilets, taps), Fire & Security.
       - **EXCLUDE (FORBIDDEN)**: Furniture (desks, chairs, tables, beds, cabinets), Loose Appliances (microwaves, fridges, washing machines, coffee makers), IT Equipment (laptops, monitors, keyboards, mice, phones), Personal Items, Waste Bins, Cleaning Equipment.
    
    3. **CATEGORIZATION**: Select the exact category from the reference list.

    4. **CONDITION & LIFECYCLE ASSESSMENT**:
       - When justifying the condition, cite specific visual defects (rust, cracks, stains, wear).
       - **RISK RATING**: Assign 'Low', 'Medium', 'High', or 'Extreme' based on the asset's condition AND its criticality to safety/operations.
       - **AGE ESTIMATION**: Visually estimate the installed Age (in years) based on the asset's style, model, and wear.

    REFERENCE LIST:
    ${categoriesContext}
    
    OUTPUT REQUIREMENTS:
    - Return a consolidated list of **UNIQUE** assets found in the room.
    - Be thorough, but aggressively deduplicate same-objects.
  `;

  // Define Strict Schema
  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: allowedCategories, 
          description: "The category of the asset from the allowed list."
        },
        description: {
          type: Type.STRING,
          description: "Detailed physical description. Mention if seen in multiple views."
        },
        condition: {
          type: Type.STRING,
          enum: ["Excellent", "Good", "Average", "Fair", "Poor"]
        },
        riskRating: {
          type: Type.STRING,
          enum: ["Low", "Medium", "High", "Extreme"],
          description: "Risk assessment based on condition and criticality."
        },
        justification: {
          type: Type.STRING,
          description: "Technical justification citing specific visual defects (e.g. corrosion, water damage) and implied failure risk."
        },
        quantity: {
          type: Type.STRING, 
          description: "Count or quantity (e.g. '1', '4', 'approx 10')"
        },
        cost: {
          type: Type.NUMBER,
          description: "Estimated replacement cost in USD (number only)"
        },
        age: {
          type: Type.NUMBER,
          description: "Estimated installed age in years (number only)"
        },
        rul: {
          type: Type.NUMBER,
          description: "Remaining Useful Life in years (number only)"
        },
        notes: {
          type: Type.STRING,
          description: "Engineering observations, defects, or hazards."
        },
        sourceImageIndex: {
          type: Type.INTEGER,
          description: "The 0-based index of the best source image showing this asset."
        },
        appearsInImageIndices: {
           type: Type.ARRAY,
           items: { type: Type.INTEGER },
           description: "List of image indices [0, 1, ...] where this specific object is visible. Used for verification."
        },
        boundingBox: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "Normalized X coordinate (0.0 - 1.0) of top-left corner" },
            y: { type: Type.NUMBER, description: "Normalized Y coordinate (0.0 - 1.0) of top-left corner" },
            width: { type: Type.NUMBER, description: "Normalized width (0.0 - 1.0)" },
            height: { type: Type.NUMBER, description: "Normalized height (0.0 - 1.0)" }
          },
          required: ["x", "y", "width", "height"]
        }
      },
      required: ["category", "description", "condition", "riskRating", "justification", "quantity", "cost", "age", "rul", "sourceImageIndex", "boundingBox"]
    }
  };

  const parts: any[] = [{ text: prompt }];
  
  images.forEach((img) => {
    if (img.dataUrl.startsWith('data:image')) {
        const cleanBase64 = img.dataUrl.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64
          }
        });
    }
  });

  if (parts.length === 1) return [];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    let rawAssets: any[] = [];
    if (response.text) {
        rawAssets = JSON.parse(response.text);
    }

    return rawAssets.map((a: any) => ({
      id: crypto.randomUUID(),
      name: `${a.category} - ${a.description.substring(0, 30)}...`,
      category: a.category, 
      description: a.description,
      condition: a.condition,
      riskRating: a.riskRating || "Low", 
      justification: a.justification,
      quantity: String(a.quantity),
      cost: String(a.cost),
      age: String(a.age || '0'),
      rul: String(a.rul),
      notes: a.notes || "", 
      verified: false,
      aiDetected: true,
      sourceImageIndex: a.sourceImageIndex,
      boundingBox: a.boundingBox,
      auditTrail: [{
          timestamp: Date.now(),
          actor: 'AI',
          action: 'CREATED',
          details: `Detected via Gemini 2.5 Flash. Confidence High.`
      }]
    }));

  } catch (error) {
    console.error("Asset detection failed:", error);
    throw error;
  }
};

export const createChatStream = async (
  history: { role: string, parts: { text: string }[] }[],
  message: string,
  contextData: any, 
  privacyMode: boolean = false
) => {
  if (!apiKey) throw new Error("API Key not found");

  let systemPrompt = "";
  
  if (Array.isArray(contextData)) {
      const portfolioSummary = contextData.map((d: any) => {
          const siteName = privacyMode ? "REDACTED_SITE" : d.siteInfo?.name || "Unknown";
          return `
            SITE: ${siteName}
            ASSETS: ${(d.rooms || []).flatMap((r:any) => (r.assets || []).map((a:any) => 
                `${a.category} [Age: ${a.age}y, RUL: ${a.rul}y] (${a.condition}, Risk: ${a.riskRating || 'N/A'}): ${a.justification} [Cost: $${a.cost}]`
            )).join('; ')}
          `;
      }).join('\n---\n');

      systemPrompt = `
        You are a **Portfolio Asset Strategist**. 
        
        YOUR ROLE:
        1. Compare performance and risk across the portfolio.
        2. Identify the "Worst Performing" buildings based on asset condition and RISK RATINGS.
        3. Aggregated CAPEX forecasting using provided Costs and Ages.
        
        PORTFOLIO DATA:
        ${portfolioSummary}
      `;
  } else {
      const siteName = privacyMode ? "REDACTED_SITE_NAME" : contextData.siteInfo.name;
      const siteAddress = privacyMode ? "REDACTED_LOCATION" : contextData.siteInfo.address;
      
      systemPrompt = `
        You are a specialized **Engineering Asset Manager**.
        
        CRITICAL INSTRUCTION:
        For every asset recommendation, you MUST strictly apply **"Scenario 3 Logic"** (ISO 55000 Standard).
        
        **THE SCENARIO 3 LOGIC FRAMEWORK:**
        
        **1. VALUE (The 'Why')**
        - Identify the function of the asset (e.g. "Maintains thermal comfort for staff").
        
        **2. CRITERIA (The 'What')**
        - **Condition**: Current state (e.g. ${'R1 Poor'}).
        - **Risk**: Failure impact (e.g. ${'High'}).
        - **Age**: Installed age vs expected life (e.g. "15 year old unit, design life 12 years").
        
        **3. LIFECYCLE DECISION (The 'How')**
        - Compare **Maintenance** (Short term fix) vs **Renewal** (CAPEX replacement).
        - Example: "Due to Age (15y) and High Risk, repair is uneconomical. Recommend Full Replacement ($5k)."

        CONTEXT DATA:
        SITE: ${siteName} (${siteAddress})
        ASSETS: ${JSON.stringify(contextData.rooms.map((r:any) => ({
          room: r.roomName,
          assets: r.assets.map((a:any) => ({
              category: a.category,
              condition: a.condition,
              riskRating: a.riskRating,
              age: a.age,
              rul: a.rul,
              justification: a.justification,
              cost: a.cost
          }))
        })), null, 2)}
      `;
  }

  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: systemPrompt,
    },
    history: history.map(h => ({
        role: h.role,
        parts: h.parts
    }))
  });

  return await chat.sendMessageStream({ message });
};

export const summarizeConversation = async (messages: ChatMessage[]): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found");
    if (messages.length < 2) return ""; 

    const chatLog = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    const prompt = `
      You are an Executive Engineering Consultant.
      Review the following chat history.

      TASK:
      Summarize the key engineering observations, identified risks, remedial recommendations, and strategic decisions discussed.
      Focus on the "Scenario 3" logic (Value, Risk, Lifecycle) discussed.
      
      CHAT LOG:
      ${chatLog}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text || "";
    } catch (e) {
        console.error("Summary generation failed", e);
        return "Could not generate summary from chat.";
    }
};
