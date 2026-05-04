
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

export const detectAssetsWithBoundingBoxes = async (images: { dataUrl: string }[], allowedCategories: string[], privacyMode: boolean = false, existingAssets: Asset[] = []): Promise<Asset[]> => {
  if (!apiKey) throw new Error("API Key not found");

  const categoriesContext = allowedCategories.map(cat => `- ${cat}`).join('\n');
  const existingAssetsContext = existingAssets.length > 0 ? 
    `\n    PAST ASSETS HISTORY:\n    ` + JSON.stringify(existingAssets.map(a => ({ id: a.id, description: a.description, pastCondition: a.condition, pastRisk: a.riskRating }))) + 
    `\n\n    *RE-INSPECTION INSTRUCTION*: If you detect an asset in the images that matches an asset from the 'PAST ASSETS HISTORY', you MUST set its 'id' to the existing asset's id. Compare the new image to the 'pastCondition'. Explain exactly how it changed in the justification.` 
    : '';

  const prompt = `
    You are a Professional Building Surveyor conducting a Facility Condition Assessment aligned with ISO 55000 standards.
    
    CONTEXT:
    The user has provided ${images.length} images of the **SAME ROOM** taken from different angles. 
    You must treat these images as a single 3D environment.
    ${existingAssetsContext}

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
        id: {
          type: Type.STRING,
          description: "Required IF matching a past asset from 'PAST ASSETS HISTORY', otherwise omit."
        },
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
      model: 'gemini-3-flash-preview',
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
          details: `Detected via Gemini 3.0 Flash. Confidence High.`
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
          const docSummary = d.siteInfo?.documents?.length ? `DOCUMENTS EXTRACTED:\n${d.siteInfo.documents.map((doc: any) => `- ${doc.name}: ${doc.summary}`).join('\n')}` : '';
          return `
            SITE: ${siteName}
            ${docSummary}
            ASSETS: ${(d.rooms || []).flatMap((r:any) => (r.assets || []).map((a:any) => 
                `${a.category} [Age: ${a.age}y, RUL: ${a.rul}y] (${a.condition}, Risk: ${a.riskRating || 'N/A'}): ${a.justification} [Cost: ${a.cost}]`
            )).join('; ')}
          `;
      }).join('\n---\n');

      systemPrompt = `
        You are a **Portfolio Asset Strategist**. 
        
        YOUR ROLE:
        1. Compare performance and risk across the portfolio.
        2. Identify the "Worst Performing" buildings based on asset condition and RISK RATINGS.
        3. Aggregated CAPEX forecasting using provided Costs and Ages.
        4. Cross-reference uploaded service records and PM reports to validate asset conditions.
        
        PORTFOLIO DATA:
        ${portfolioSummary}
      `;
  } else {
      const siteName = privacyMode ? "REDACTED_SITE_NAME" : contextData.siteInfo.name;
      const siteAddress = privacyMode ? "REDACTED_LOCATION" : contextData.siteInfo.address;
      const docs = contextData.siteInfo.documents?.length ? `SERVICE/PM REPORTS EXRACTED:\n${contextData.siteInfo.documents.map((d: any) => `- ${d.name}:\n${d.summary}`).join('\n\n')}` : "None provided.";
      
      systemPrompt = `
        You are a specialized **Engineering Asset Manager**.
        
        CRITICAL INSTRUCTION:
        For every asset recommendation, you MUST strictly apply **"Scenario 3 Logic"** (ISO 55000 Standard).
        Consider cost context, life cycle (age, RUL), and risk, but ALWAYS check if the uploaded Service/PM Reports contradict visual conditions or add hidden context.

        SITE CONTEXT:
        Site Name: ${siteName}
        Location: ${siteAddress}

        ${docs}
        
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

export const analyzeDocument = async (base64Data: string, mimeType: string, fileName: string): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found");

    const prompt = `
      You are a Senior Engineering Asset Manager.
      Please review the attached document (File Name: ${fileName}). This is likely a Service Report, Preventive Maintenance (PM) report, or Compliance Certificate.
      
      Extract and summarize the following in a concise, structural format for an Asset Management system:
      - Key assets mentioned and their last known condition.
      - Any identified risks, failures, or non-compliances.
      - Recommended remedial actions, repairs, or replacements.
      - Dates of service and overall compliance status.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            { role: 'user', parts: [
                { inlineData: { data: base64Data.split(',')[1], mimeType } }, 
                { text: prompt }
            ]}
        ]
    });

    return response.text || "No insights could be extracted from the document.";
};

export const extractAssetsFromVendorRegister = async (base64Data: string, mimeType: string, fileName: string): Promise<{roomName: string, assets: Partial<Asset>[]}[]> => {
    if (!apiKey) throw new Error("API Key not found");

    const prompt = `
      You are an AI Data Engineer specializing in Asset Management.
      The user has uploaded a document (File Name: ${fileName}) containing asset information.
      This document might be a structured table (CSV/Excel), a PDF, a loosely formatted list, or even unstructured narrative text paragraphs.
      
      Scan the entire document carefully. Extract every physical building asset mentioned and logically group them into "Areas/Rooms" (e.g., "Roof", "Plant Room", "Room 1"). If no specific locations or rooms are mentioned, group them under a single "General Site Area".
      
      Map the extracted asset data to our standard schema:
      - category: e.g. 'HVAC', 'Fire', 'Electrical', 'Plumbing', 'Fabric', etc.
      - description: The asset name / description (e.g., "Daikin Split System", "Fire Extinguisher").
      - riskRating: 'Low', 'Medium', 'High', 'Extreme'. Infer from text if not explicit.
      - condition: The condition stated (e.g., 'Good', 'Poor', 'Requires Maintenance').
      - cost: Estimated replacement/repair cost if available, else '0'.
      - quantity: If specified, else 1.
      - rul: Remaining Useful Life if specified or implied, else 'Unknown'.
      - age: Estimated age if specified or implied, else 'Unknown'.
      - justification: Context, notes, or observations about the asset from the text.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            { role: 'user', parts: [
                { inlineData: { data: base64Data.split(',')[1], mimeType } }, 
                { text: prompt }
            ]}
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        roomName: { type: Type.STRING },
                        assets: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    category: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    riskRating: { type: Type.STRING },
                                    condition: { type: Type.STRING },
                                    cost: { type: Type.STRING },
                                    quantity: { type: Type.STRING },
                                    rul: { type: Type.STRING },
                                    age: { type: Type.STRING },
                                    justification: { type: Type.STRING }
                                },
                                required: ["category", "description", "condition", "justification"]
                            }
                        }
                    },
                    required: ["roomName", "assets"]
                }
            }
        }
    });

    try {
        return JSON.parse(response.text || "[]");
    } catch {
        return [];
    }
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
        // Use gemini-3-flash-preview for basic text tasks like summarization
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        return response.text || "";
    } catch (e) {
        console.error("Summary generation failed", e);
        return "Could not generate summary from chat.";
    }
};
