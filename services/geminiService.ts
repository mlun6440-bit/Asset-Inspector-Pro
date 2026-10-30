
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Asset, Room, SiteInfo, ChatMessage, WorkOrder } from '../types';
import { safeParseJson, sanitizeDetectedAssets } from './schemas';

// The real Gemini API key never reaches the browser. All calls go to a same-origin
// proxy (/api/gemini — see server.mjs and the dev proxy in vite.config.ts) which
// attaches GEMINI_API_KEY server-side. The SDK still requires a non-empty key, so a
// placeholder is sent and the proxy strips/replaces it.
const GEMINI_PROXY_PATH = (import.meta as any).env?.VITE_GEMINI_PROXY_PATH || '/api/gemini';
const AI_PROXY_ENABLED = true;
const ai = new GoogleGenAI({
  apiKey: 'server-side-proxy',
  httpOptions: {
    baseUrl: typeof window !== 'undefined' ? `${window.location.origin}${GEMINI_PROXY_PATH}` : GEMINI_PROXY_PATH,
  }
});

// High-performance image element cache to avoid re-decoding massive multi-MB base64 images per bounding box
const imageElementCache = new Map<string, Promise<HTMLImageElement>>();

function getLoadedImage(src: string): Promise<HTMLImageElement> {
  if (imageElementCache.has(src)) {
    return imageElementCache.get(src)!;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
  // Cap cache size to avoid memory retention
  if (imageElementCache.size > 8) {
    const firstKey = imageElementCache.keys().next().value;
    if (firstKey) imageElementCache.delete(firstKey);
  }
  imageElementCache.set(src, promise);
  return promise;
}

export const cropImage = async (base64Image: string, bbox: { x: number, y: number, width: number, height: number }): Promise<string> => {
  if (!base64Image) {
    return '';
  }

  try {
    const img = await getLoadedImage(base64Image);
    const naturalW = img.naturalWidth || img.width || 800;
    const naturalH = img.naturalHeight || img.height || 600;

    if (!bbox || typeof bbox.x !== 'number') { 
        // Return compact downscaled thumbnail (max 320px) rather than massive original
        const canvas = document.createElement('canvas');
        const targetDim = 320;
        const aspect = naturalW / naturalH;
        const w = aspect >= 1 ? targetDim : Math.round(targetDim * aspect);
        const h = aspect >= 1 ? Math.round(targetDim / aspect) : targetDim;
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.8);
        }
        return base64Image; 
    }

    // Sanitize inputs (Clamp to 0-1 range to prevent canvas errors)
    const x = Math.max(0, Math.min(0.99, bbox.x || 0));
    const y = Math.max(0, Math.min(0.99, bbox.y || 0));
    const w = Math.max(0.01, Math.min(1 - x, bbox.width || 0.2));
    const h = Math.max(0.01, Math.min(1 - y, bbox.height || 0.2));

    // Calculate source crop pixel coordinates
    const srcX = Math.floor(x * naturalW);
    const srcY = Math.floor(y * naturalH);
    let srcW = Math.floor(w * naturalW);
    let srcH = Math.floor(h * naturalH);

    if (srcX + srcW > naturalW) srcW = naturalW - srcX;
    if (srcY + srcH > naturalH) srcH = naturalH - srcY;
    if (srcW < 4) srcW = 4;
    if (srcH < 4) srcH = 4;

    // Destination dimensions: cap at max 360px for lightweight memory footprint
    const maxThumbnailDim = 360;
    let destW = srcW;
    let destH = srcH;
    if (destW > maxThumbnailDim || destH > maxThumbnailDim) {
      if (destW > destH) {
        destH = Math.round((destH * maxThumbnailDim) / destW);
        destW = maxThumbnailDim;
      } else {
        destW = Math.round((destW * maxThumbnailDim) / destH);
        destH = maxThumbnailDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, destW);
    canvas.height = Math.max(1, destH);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return base64Image;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (e) {
    console.warn("Cropping exception or image load failure:", e);
    return base64Image;
  }
};

/**
 * Thrown when AI asset detection cannot run or fails. Callers must surface this to the
 * inspector instead of inventing assets — a register must never contain fabricated rows.
 */
export class AssetDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetDetectionError';
  }
}

export const detectAssetsWithBoundingBoxes = async (images: { dataUrl: string }[], allowedCategories: string[], privacyMode: boolean = false, existingAssets: Asset[] = []): Promise<Asset[]> => {
  if (!images || images.length === 0) return [];

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
  
  for (const img of images) {
    if (img.dataUrl) {
      try {
        const { base64, mimeType } = await getBase64FromUrlOrDataUrl(img.dataUrl);
        if (base64 && base64.length > 0) {
          parts.push({
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64
            }
          });
        }
      } catch (e) {
        console.error("Failed to parse/fetch image dataUrl in asset detection:", e);
      }
    }
  }

  if (!AI_PROXY_ENABLED) {
    throw new AssetDetectionError("AI detection is not configured on the server.");
  }
  // Never report a partial/unreadable photo set as a complete inspection.
  if (parts.length !== images.length + 1) {
    throw new AssetDetectionError("Some inspection photos could not be read. Replace the affected photos and retry.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const rawAssets = safeParseJson<unknown>(response.text, null);
    if (!Array.isArray(rawAssets)) {
      throw new AssetDetectionError("The AI returned an invalid asset response. Please retry; existing assets are unchanged.");
    }
    // A valid empty array means no assets were detected, not a reason to fabricate records.
    // Items are validated individually so one malformed detection doesn't discard the rest.
    const sanitized = sanitizeDetectedAssets(rawAssets, new Set(existingAssets.map(a => a.id)));
    if (rawAssets.length > 0 && sanitized.length === 0) {
      throw new AssetDetectionError("The AI returned an invalid asset response. Please retry; existing assets are unchanged.");
    }
    return sanitized;
  } catch (error) {
    if (error instanceof AssetDetectionError) throw error;
    console.error("Asset detection API call failed:", error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new AssetDetectionError(`AI asset detection failed: ${reason}. Existing assets are unchanged.`);
  }
};

async function getBase64FromUrlOrDataUrl(url: string): Promise<{ base64: string, mimeType: string }> {
  if (!url) return { base64: '', mimeType: 'image/jpeg' };

  // For SVG or standard images, rasterize to standard clean JPEG to guarantee Gemini model compatibility
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const maxDim = 1200;
        let width = img.naturalWidth || img.width || 800;
        let height = img.naturalHeight || img.height || 600;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error("Canvas context failed");
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const jpegUrl = canvas.toDataURL('image/jpeg', 0.85);
        const commaIdx = jpegUrl.indexOf(',');
        resolve({
          base64: jpegUrl.substring(commaIdx + 1),
          mimeType: 'image/jpeg'
        });
      } catch (err) {
        console.warn("Rasterization exception, using fallback parser:", err);
        fallbackBase64Parse(url).then(resolve);
      }
    };
    img.onerror = () => {
      console.warn("Image load error for rasterization, using fallback parser");
      fallbackBase64Parse(url).then(resolve);
    };
    img.src = url;
  });
}

async function fallbackBase64Parse(url: string): Promise<{ base64: string, mimeType: string }> {
  if (url.startsWith('data:')) {
    const isBase64 = url.includes(';base64,');
    const commaIndex = url.indexOf(',');
    const header = url.substring(0, commaIndex);
    const content = url.substring(commaIndex + 1);
    let mimeType = header.split(';')[0].split(':')[1] || 'image/jpeg';
    if (mimeType.includes('svg')) mimeType = 'image/jpeg'; // Normalize SVG to avoid model crash
    
    if (isBase64) {
      return { base64: content, mimeType };
    } else {
      try {
        const decoded = decodeURIComponent(content);
        const b64 = btoa(unescape(encodeURIComponent(decoded)));
        return { base64: b64, mimeType };
      } catch (err) {
        return { base64: btoa(content), mimeType };
      }
    }
  }

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(',');
        const base64 = dataUrl.substring(commaIdx + 1);
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      reader.onerror = () => resolve({ base64: '', mimeType: 'image/jpeg' });
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not fetch image directly for base64:", err);
    return { base64: '', mimeType: 'image/jpeg' };
  }
}

export const createChatStream = async (
  history: { role: string, parts: { text: string }[] }[],
  message: string,
  contextData: any, 
  privacyMode: boolean = false
) => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  let systemPrompt = "";
  
  // Extract custom agent rules and memories from AI Second Brain
  let customRulesText = "";
  let memoriesText = "";
  
  if (contextData && !Array.isArray(contextData)) {
    const agentOS = contextData.siteInfo?.agentOS || contextData.agentOS;
    if (agentOS) {
      if (Array.isArray(agentOS.customRules) && agentOS.customRules.length > 0) {
        customRulesText = `\n**STRATEGIC PROMPT DIRECTIVES (User-programmed in AI OS):**\n${agentOS.customRules.map((rule: string, i: number) => `CR-${i+1}: ${rule}`).join('\n')}\n`;
      }
      if (Array.isArray(agentOS.memories) && agentOS.memories.length > 0) {
        memoriesText = `\n**EPISODIC KNOWLEDGE MEMORIES (Injected from AI Second Brain):**\n${agentOS.memories.map((mem: any) => `- [Category: ${mem.category}] ${mem.text}`).join('\n')}\n`;
      }
    }
  } else if (Array.isArray(contextData)) {
    const allRules: string[] = [];
    contextData.forEach((d: any) => {
      const agentOS = d.siteInfo?.agentOS || d.agentOS;
      if (agentOS?.customRules) {
        allRules.push(...agentOS.customRules);
      }
    });
    const uniqueRules = Array.from(new Set(allRules));
    if (uniqueRules.length > 0) {
      customRulesText = `\n**STRATEGIC PROMPT DIRECTIVES (Portfolio-wide custom rules):**\n${uniqueRules.map((rule, i) => `CR-${i+1}: ${rule}`).join('\n')}\n`;
    }
  }
  
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
        
        STRICT STANDARDS CITATION MANDATE:
        Whenever discussing portfolio strategies, risk, life-cycle decisions, or data requirements, you MUST explicitly cite the specific ISO standard clause in square brackets, such as:
        - Use [ISO 55001 Clause 4.1] for strategic context or organizational issues
        - Use [ISO 55001 Clause 6.1] for risk/opportunity management
        - Use [ISO 55001 Clause 7.5] for data/register requirements
        - Use [ISO 55001 Clause 8.1] for general operational control and Scenario 3 Logic
        - Use [ISO 55001 Clause 9.1] for monitoring/evaluation and performance metrics
        - Use [ISO 55001 Clause 10.1] for non-conformity, defects, or hazards
        
        PORTFOLIO DATA:
        ${portfolioSummary}

        ${customRulesText}
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

        STRICT STANDARDS CITATION MANDATE:
        Whenever you mention recommendations, condition assessments, risk ratings, or compliance issues, you MUST cite the specific corresponding ISO 55001 or 55002 clause in square brackets. This allows our interface to display the relevant clause text in a side-by-side Standards Notebook:
        - Use [ISO 55001 Clause 4.1] for strategic context, SAMP, or organizational boundaries
        - Use [ISO 55001 Clause 4.2] for safety/regulatory compliance & stakeholder expectations
        - Use [ISO 55001 Clause 6.1] for risk & opportunity assessment (and establishing risk-ratings like High/Extreme)
        - Use [ISO 55001 Clause 7.5] for asset registers or information requirements
        - Use [ISO 55001 Clause 8.1] for operational control, Maintenance vs Renewal trade-offs, and Scenario 3 Logic
        - Use [ISO 55001 Clause 8.2] for Management of Change (MoC) when replacing/upgrading
        - Use [ISO 55001 Clause 9.1] for monitoring, evaluation, or visual health indicators
        - Use [ISO 55001 Clause 10.1] for logging corrective actions, non-conformities, defects, or hazards

        SITE CONTEXT:
        Site Name: ${siteName}
        Location: ${siteAddress}

        ${docs}
        
        ${(() => {
          const agentOS = contextData.siteInfo?.agentOS;
          if (agentOS?.cogneeGraph?.nodes && agentOS.cogneeGraph.nodes.length > 0) {
            const g = agentOS.cogneeGraph;
            const nodeSummary = g.nodes.slice(0, 30).map((n: any) => `[${n.type}] ${n.label}: ${n.description || ''}`).join('\n');
            const edgeSummary = g.edges.slice(0, 30).map((e: any) => `${e.source} ➔ (${e.type}) ➔ ${e.target}: ${e.description || ''}`).join('\n');
            return `
        **COMPILED FACILITY KNOWLEDGE GRAPH (DETERMINISTIC TOPOLOGY - KARPATHY ENGINE):**
        Nodes (${g.nodes.length} entities):
        ${nodeSummary}

        Active Relational & Causal Edges (${g.edges.length} links):
        ${edgeSummary}

        *Guideline: When answering questions regarding room impacts, domino failures, or asset interdependencies, ground your deductions directly on the above relational graph paths for 100% causal accuracy.*
            `;
          }
          return '';
        })()}

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

        ${customRulesText}
        ${memoriesText}
      `;
  }

  const chat = ai.chats.create({
    model: 'gemini-3.7-flash',
    config: {
      systemInstruction: systemPrompt,
    },
    history: history.map(h => ({
        role: h.role,
        parts: h.parts
    }))
  });

  const messageParts: any[] = [{ text: message }];

  // Gather documents to load for Vision RAG
  const docsToLoad: any[] = [];
  if (Array.isArray(contextData)) {
    contextData.forEach((d: any) => {
      if (d.siteInfo?.documents) {
        docsToLoad.push(...d.siteInfo.documents);
      }
    });
  } else if (contextData?.siteInfo?.documents) {
    docsToLoad.push(...contextData.siteInfo.documents);
  }

  if (docsToLoad.length > 0) {
    for (const doc of docsToLoad) {
      if (doc.dataUrl) {
        try {
          const { base64, mimeType } = await getBase64FromUrlOrDataUrl(doc.dataUrl);
          messageParts.push({
            inlineData: {
              data: base64,
              mimeType: mimeType
            }
          });
          console.log(`Attached visual document "${doc.name}" for Vision RAG.`);
        } catch (err) {
          console.warn(`Could not load document "${doc.name}" for Vision RAG:`, err);
        }
      }
    }
  }

  return await chat.sendMessageStream({ message: messageParts });
};

export const analyzeDocument = async (base64Data: string, mimeType: string, fileName: string): Promise<string> => {
    if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

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
        model: 'gemini-3.7-flash',
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
    if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

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
        model: 'gemini-3.7-flash',
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
    if (!AI_PROXY_ENABLED) throw new Error("API Key not found");
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
            model: 'gemini-3.7-flash',
            contents: prompt
        });
        return response.text || "";
    } catch (e) {
        console.error("Summary generation failed", e);
        return "Could not generate summary from chat.";
    }
};

export const reconstructLayoutFromImage = async (
  base64Image: string,
  slices: { position: number; direction: 'vertical' | 'horizontal' }[]
): Promise<any[]> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  let base64Data = base64Image;
  let mimeType = 'image/jpeg';
  if (base64Image.includes(',')) {
    const parts = base64Image.split(',');
    const header = parts[0];
    base64Data = parts[1];
    mimeType = header.split(';')[0].split(':')[1];
  }

  const slicesText = slices.map((s, idx) => `Slice ${idx + 1}: ${s.direction} divider at ${s.position}%`).join('\n');

  const prompt = `
    You are an AI Architectural Drafting assistant.
    The user has uploaded a visual photo or sketch of a building room layout/floor plan.
    They have established the following "adaptive slicing" grid markers:
    ${slicesText || "No custom slices have been specified. Please identify the natural structural walls, doors, and window segments."}

    TASK:
    Analyze the visual structure (walls, window openings, doors) and map them to a 2D coordinate system from (0,0) to (20,20).
    (0,0) is top-left, and (20,20) is bottom-right of the room footprint.
    Translate the image into a clean list of WallSegments, Windows, and Doors.

    Represent this strictly as a JSON list of objects:
    {
       "id": "string",
       "x1": number (0 to 20),
       "y1": number (0 to 20),
       "x2": number (0 to 20),
       "y2": number (0 to 20),
       "type": "wall" | "window" | "door"
    }

    Keep the segments aligned to integers or 0.5 decimal coordinate steps for accuracy.
    Only return valid JSON array. No conversational text.
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: [
            { role: 'user', parts: [
                { inlineData: { data: base64Data, mimeType } }, 
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
                        id: { type: Type.STRING },
                        x1: { type: Type.NUMBER },
                        y1: { type: Type.NUMBER },
                        x2: { type: Type.NUMBER },
                        y2: { type: Type.NUMBER },
                        type: { type: Type.STRING }
                    },
                    required: ["id", "x1", "y1", "x2", "y2", "type"]
                }
            }
        }
    });

    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Layout extraction failed", e);
    return [];
  }
};

export interface ProposedConditionUpdate {
  assetId: string;
  assetName: string;
  category: string;
  roomName: string;
  currentCondition: string;
  proposedCondition: string;
  proposedRisk: string;
  justification: string;
}

export const analyzePMReportAndMapConditions = async (
  base64Data: string,
  mimeType: string,
  fileName: string,
  currentAssets: { id: string; name: string; category: string; roomName: string; currentCondition: string }[]
): Promise<ProposedConditionUpdate[]> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  const prompt = `
    You are an expert AI Reliability Engineer and Asset Analyst.
    The user has uploaded a Service Report / Preventive Maintenance (PM) Report / Work Order History document (File Name: ${fileName}).
    
    We have a list of physical building assets currently logged in our system:
    ${JSON.stringify(currentAssets, null, 2)}
    
    YOUR TASK:
    1. Analyze the uploaded service/maintenance report.
    2. Correlate any findings, test status, servicing details, defects, leaks, failures, or compliance issues to our existing list of assets. Match them by roomName, assetName, or asset category (e.g., "HVAC" / "AC Unit", "Fire" / "Extinguisher", "Electrical" / "Distribution Board", "Plumbing", "Fabric").
    3. If the report identifies issues with an asset or category, propose an updated "condition" and/or "risk rating".
       - For significant defects or failures: propose 'Poor' or 'Bad' condition and higher risk ('High' or 'Extreme').
       - For minor issues/wear: propose 'Fair' condition and 'Medium' risk.
       - For newly serviced, repaired, or perfectly checked assets: propose 'Excellent' or 'Good' condition and 'Low' risk.
    4. Provide a clear engineering "justification" quoting or summarizing the report's finding (e.g., "PM report indicates annual fire alarm certification passed with zero faults.").
    
    Only return updates for assets where the document actually contains relevant status or servicing information. Do not return updates for assets not mentioned or affected by the document.
    
    Return a JSON array of objects representing the proposed updates.
  `;

  try {
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        { role: 'user', parts: [
          { inlineData: { data: cleanBase64, mimeType } },
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
              assetId: { type: Type.STRING },
              assetName: { type: Type.STRING },
              category: { type: Type.STRING },
              roomName: { type: Type.STRING },
              currentCondition: { type: Type.STRING },
              proposedCondition: { type: Type.STRING },
              proposedRisk: { type: Type.STRING },
              justification: { type: Type.STRING }
            },
            required: ["assetId", "assetName", "proposedCondition", "proposedRisk", "justification"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("PM condition mapping failed", e);
    return [];
  }
};

export interface CFOScenario {
  year: string;
  baseAmount: number;
  stressAmount: number;
  inflationAmount: number;
}

export interface CFOAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  assetId?: string;
}

export interface CFOCriticalAsset {
  assetId: string;
  assetName: string;
  roomName: string;
  cost: number;
  condition: string;
  riskRating: string;
  score: number;
}

export interface CFOAnalysisResult {
  executiveSummary: string;
  totalAssetValue: number;
  immediateCAPEX: number;
  shortTermCAPEX: number;
  mediumTermCAPEX: number;
  monthlyAllocation: number;
  riskConcentrationPercentage: number;
  scenarios: CFOScenario[];
  criticalAssets: CFOCriticalAsset[];
  alerts: CFOAlert[];
}

export const analyzeCFOFinance = async (
  assets: { id: string; name: string; category: string; roomName: string; condition: string; cost: string; rul: string; age?: string; riskRating?: string }[],
  customRules: string[],
  memories: string[]
): Promise<CFOAnalysisResult> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  const prompt = `
    You are an expert AI CFO, Capital Allocator, and Corporate Treasurer operating on a portfolio of physical capital assets.
    
    You have been provided with the following real-time facility asset list:
    ${JSON.stringify(assets, null, 2)}
    
    You must also strictly adhere to these strategic guardrail rules:
    ${JSON.stringify(customRules, null, 2)}
    
    And use the following auxiliary site memories as additional context:
    ${JSON.stringify(memories, null, 2)}
    
    YOUR TASK:
    Analyze this asset portfolio and generate a professional, executive-level CFO report and forecasting workbook.
    Your report must focus on corporate capital preservation, liquidity risk, lifecycle depreciation cliffs, and asset collection/condition concentration.
    
    Specifically, compute/evaluate:
    1. **Executive CFO Summary**: Write a highly sophisticated 2-3 paragraph strategic advisory summary. Avoid generic platitudes; mention specific major asset vulnerabilities (e.g. HVAC, Concrete structural segments, Electrical), capital allocation advice, and compliance risks. Apply executive-level judgment.
    2. **CAPEX Budgets**: Aggregated capital replacement spends over:
       - Immediate term (0-2 years, when Remaining Useful Life (RUL) <= 2)
       - Short term (3-5 years, when 2 < RUL <= 5)
       - Medium term (6-10 years, when 5 < RUL <= 10)
    3. **Monthly Capital Allocation**: The recommended monthly strategic reserve fund contribution to ensure all upcoming immediate and short-term replacement expenses are fully funded.
    4. **Risk Concentration**: The percentage of total asset capital value that is concentrated in 'High' or 'Extreme' risk ratings.
    5. **Multi-Scenario Spend Forecasting**: Create a 6-year spend projection (2026 to 2031) under three models:
       - 'baseAmount': Spends based on standard remaining useful life replacement schedules.
       - 'stressAmount': Spends under a high-stress operational model (assuming faster 20% degradation of immediate/short term assets due to lack of PM or higher stress).
       - 'inflationAmount': Spends assuming a 4% compounded annual capital inflation rate.
    6. **Critical Asset Exposure Ranking**: Extract and rank the top 3-5 assets with the highest financial exposure score. The score should reflect replacement cost multiplied by a risk factor (e.g., Extreme=10, High=6, Medium=3, Low=1).
    7. **CFO Alerts**: Generate 2-4 critical alerts focusing on immediate liquidity threats, deprecation spikes, or compliance concerns (e.g., concrete structure leaks with high capital replacement cost).
    
    Only return valid JSON conforming to the specified schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING, description: "A highly analytical, CFO-level professional summary of the assets risk and capex trends." },
            totalAssetValue: { type: Type.NUMBER },
            immediateCAPEX: { type: Type.NUMBER },
            shortTermCAPEX: { type: Type.NUMBER },
            mediumTermCAPEX: { type: Type.NUMBER },
            monthlyAllocation: { type: Type.NUMBER },
            riskConcentrationPercentage: { type: Type.NUMBER },
            scenarios: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  year: { type: Type.STRING },
                  baseAmount: { type: Type.NUMBER },
                  stressAmount: { type: Type.NUMBER },
                  inflationAmount: { type: Type.NUMBER }
                },
                required: ["year", "baseAmount", "stressAmount", "inflationAmount"]
              }
            },
            criticalAssets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  assetId: { type: Type.STRING },
                  assetName: { type: Type.STRING },
                  roomName: { type: Type.STRING },
                  cost: { type: Type.NUMBER },
                  condition: { type: Type.STRING },
                  riskRating: { type: Type.STRING },
                  score: { type: Type.NUMBER }
                },
                required: ["assetId", "assetName", "roomName", "cost", "condition", "riskRating", "score"]
              }
            },
            alerts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["critical", "warning", "info"] },
                  title: { type: Type.STRING },
                  message: { type: Type.STRING },
                  assetId: { type: Type.STRING }
                },
                required: ["id", "type", "title", "message"]
              }
            }
          },
          required: [
            "executiveSummary", "totalAssetValue", "immediateCAPEX", "shortTermCAPEX",
            "mediumTermCAPEX", "monthlyAllocation", "riskConcentrationPercentage",
            "scenarios", "criticalAssets", "alerts"
          ]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("CFO finance analysis failed", e);
    // Real computation based strictly on provided assets (no fabricated numbers)
    let totalCost = 0;
    let immediate = 0;
    let shortTerm = 0;
    let mediumTerm = 0;
    let highRiskCost = 0;
    let unknownRul = 0;

    assets.forEach(a => {
      const c = parseFloat(a.cost) || 0;
      const r = parseFloat(a.rul);
      totalCost += c;
      if (Number.isNaN(r)) unknownRul += 1; // don't guess a remaining life
      else if (r <= 2) immediate += c;
      else if (r <= 5) shortTerm += c;
      else if (r <= 10) mediumTerm += c;

      if (a.riskRating === 'High' || a.riskRating === 'Extreme') {
        highRiskCost += c;
      }
    });

    const riskPercent = totalCost > 0 ? Math.round((highRiskCost / totalCost) * 100) : 0;
    const monthlyAlloc = Math.round((immediate + shortTerm * 0.5) / 36);

    const hasData = assets.length > 0;
    const summary = hasData
      ? `AI analysis unavailable — figures below are straight totals from ${assets.length} registered asset(s), with no forecasting. Total recorded replacement cost is $${totalCost.toLocaleString()}, of which $${immediate.toLocaleString()} sits on assets with 2 years or less remaining life.${unknownRul > 0 ? ` ${unknownRul} asset(s) have no remaining life recorded and are excluded from the timing buckets.` : ''}`
      : "insufficient_data: No asset records provided for financial valuation analysis. Please add registered assets to generate capital expenditure projections.";

    return {
      executiveSummary: summary,
      totalAssetValue: totalCost,
      immediateCAPEX: immediate,
      shortTermCAPEX: shortTerm,
      mediumTermCAPEX: mediumTerm,
      monthlyAllocation: monthlyAlloc,
      riskConcentrationPercentage: riskPercent,
      scenarios: [], // no multi-year forecast without the AI model
      // Rank by cost x risk weighting instead of taking the first five rows in register order.
      criticalAssets: assets.map(a => {
        const costVal = parseFloat(a.cost) || 0;
        const multiplier = a.riskRating === 'Extreme' ? 10 : a.riskRating === 'High' ? 6 : a.riskRating === 'Medium' ? 3 : 1;
        return {
          assetId: a.id,
          assetName: a.name,
          roomName: a.roomName,
          cost: costVal,
          condition: a.condition,
          riskRating: a.riskRating || 'Unrated',
          score: Math.round((costVal * multiplier) / 1000)
        };
      }).sort((x, y) => y.score - x.score).slice(0, 5),
      alerts: immediate > 0 ? [
        { id: 'alert-1', type: 'critical', title: 'Lifecycle CAPEX Alert', message: `Immediate capital expenditure of $${immediate.toLocaleString()} required for assets with remaining life <= 2 years.` }
      ] : []
    };
  }
};

export interface AsBuiltAnalysisResult {
  summary: string;
  detectedEquipment: string[];
}

export const analyzeAsBuiltDrawing = async (base64Data: string, mimeType: string, discipline: string): Promise<AsBuiltAnalysisResult> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");
  const prompt = `
    You are an engineering surveyor and drafting expert auditing architectural and engineering as-built drawings.
    Analyze this drawing image or blueprint for the "${discipline}" discipline.
    Identify and extract:
    1. A detailed engineering summary of the drawing (spatial dimensions, layouts, service coverage).
    2. A list of key mechanical/electrical/plumbing/architectural equipment, components, or major fixtures visible, labeled, or specified in the drawing legends/schedules.
    
    Return a JSON object containing:
    - "summary": A brief 2-3 sentence technical summary.
    - "detectedEquipment": An array of strings, listing the distinct equipment items or structural components identified.
  `;

  try {
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        { role: 'user', parts: [
          { inlineData: { data: cleanBase64, mimeType } },
          { text: prompt }
        ]}
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            detectedEquipment: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "detectedEquipment"]
        }
      }
    });

    return JSON.parse(response.text || '{"summary": "No summary available", "detectedEquipment": []}');
  } catch (e) {
    console.error("As-built drawing analysis failed", e);
    return {
      summary: "Drawing stored, but AI extraction failed — no equipment was identified. Review the drawing manually or retry.",
      detectedEquipment: []
    };
  }
};

export interface VisionDegradationResult {
  analysisText: string;
  conditionTrend: { date: string; conditionScore: number; conditionLabel: string }[];
  estimatedRemainingYears: number;
  degradationVelocityLabel: 'Negligible' | 'Slow & Predictable' | 'Accelerated Wear' | 'Severe Structural Defect';
}

export const analyzeHistoricalVisionDegradation = async (
  assetName: string,
  category: string,
  currentCondition: string,
  historyCaptures: { dateCaptured: string; condition: string; notes: string }[]
): Promise<VisionDegradationResult> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  const prompt = `
    You are an engineering risk specialist monitoring physical asset degradation over time.
    Analyze the asset condition timeline for asset "${assetName}" (Category: "${category}").
    Current condition is: "${currentCondition}".
    The historical visual inspection logs are:
    ${JSON.stringify(historyCaptures, null, 2)}

    Your task is to:
    1. Evaluate the velocity of deterioration (degradation velocity).
    2. Map out a numerical "conditionScore" for each date (e.g. Excellent=5, Good=4, Average=3, Fair=2, Poor=1).
    3. Project the remaining operational years until complete failure (Score <= 1).
    4. Provide a highly detailed technical analysis explaining the root causes (moisture, mechanical fatigue, environment, thermal wear, etc.) and remedial actions.

    Return a JSON object containing:
    - "analysisText": A concise, highly professional engineering analysis of the degradation velocity and remediation.
    - "conditionTrend": An array of objects, each containing:
        - "date": string (ISO or YYYY-MM-DD format matching input captures)
        - "conditionScore": number (5 to 1)
        - "conditionLabel": string (Excellent, Good, Average, Fair, Poor)
    - "estimatedRemainingYears": number (Remaining operational years)
    - "degradationVelocityLabel": One of: "Negligible", "Slow & Predictable", "Accelerated Wear", "Severe Structural Defect"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        { role: 'user', parts: [
          { text: prompt }
        ]}
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysisText: { type: Type.STRING },
            conditionTrend: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  conditionScore: { type: Type.NUMBER },
                  conditionLabel: { type: Type.STRING }
                },
                required: ["date", "conditionScore", "conditionLabel"]
              }
            },
            estimatedRemainingYears: { type: Type.NUMBER },
            degradationVelocityLabel: { type: Type.STRING, enum: ["Negligible", "Slow & Predictable", "Accelerated Wear", "Severe Structural Defect"] }
          },
          required: ["analysisText", "conditionTrend", "estimatedRemainingYears", "degradationVelocityLabel"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Degradation analysis failed", e);
    // Do not invent a trend verdict or remaining-life figure; let the caller report the failure.
    throw new Error("AI degradation analysis failed. No trend or remaining-life estimate was produced.");
  }
};

export interface WorkOrderAnalysisResult {
  executiveSummary: string;
  totalMaintenanceSpent: number;
  reworkCost: number;
  capexReinvestNeeded: number;
  reworkPercentage: number;
  detections: {
    id: string;
    assetName: string;
    roomName: string;
    category: string;
    issueDescription: string;
    totalTickets: number;
    moneySpent: number;
    verdict: 'REWORK_LOOP' | 'SUSTAINABLE_PM';
    recommendation: string;
    isoClause: string;
  }[];
  spendByYearProjection: {
    year: string;
    repairOPEX: number;
    replacementCAPEX: number;
  }[];
}

export const analyzeWorkOrdersForCapexOrRework = async (
  workOrders: WorkOrder[],
  assets: { id: string; name: string; category: string; roomName: string; cost: string; condition: string }[],
  customRules: string[] = [],
  memories: string[] = []
): Promise<WorkOrderAnalysisResult> => {
  if (!AI_PROXY_ENABLED) throw new Error("API Key not found");

  const prompt = `
    You are Jarvis, an advanced AI Asset Operations and CFO Advisory Engine.
    You have been supplied with maintenance Work Orders (WOs) and active inventory profiles for this site.
    
    WORK ORDERS (MAINTENANCE HISTORY):
    ${JSON.stringify(workOrders, null, 2)}
    
    ACTIVE ASSET REGISTERS:
    ${JSON.stringify(assets, null, 2)}
    
    AUXILIARY RULES & CONTEXTS:
    Rules: ${JSON.stringify(customRules, null, 2)}
    Memories: ${JSON.stringify(memories, null, 2)}
    
    YOUR OBJECTIVE:
    Conduct a professional maintenance audit to identify "Rework Loops" vs. "Sustainable Maintenance".
    - **Rework Loop**: When corrective/emergency repairs are repeatedly made to the same asset, asset class, or specific room space (e.g. fixing AC leaks 3 times a year, patching water pipes repeatedly). This indicates "throwing good money after bad" (OPEX leakage). It should be scheduled for a capital replacement (CAPEX attention) under [ISO 55001 Clause 8.1] (Trade-offs between maintenance and replacement).
    - **Sustainable Maintenance / Sustainable PM**: Valid, periodic checkups (e.g., annual filter swaps, routine tagging) that legitimately preserve remaining useful life.
    
    INSTRUCTIONS:
    1. **Audit Executive Summary**: Write a highly analytical, 2-paragraph executive report in a conversational, Jarvis-like but crisp professional tone. Detail where we are bleeding OPEX cash and which key assets (HVAC, Plumbing, Electrical, etc.) are dragging down productivity. Cite [ISO 55001 Clause 8.1] and [ISO 55001 Clause 10.1] (Corrective action/non-conformity) directly in the text to ground the advice.
    2. **Detections**: Break down specific recurring issue patterns. For each detection, state:
       - Asset name (or general class if matched), room location, and category.
       - A summary of the issue (e.g. "HVAC cooling coil patched 4 times in 12 months").
       - Number of tickets and total cost spent.
       - Verdict: "REWORK_LOOP" if maintenance cost is high/recurring, or "SUSTAINABLE_PM" if it is healthy maintenance.
       - Recommendation: Precise operational instructions (e.g., "Halt active repairs immediately. Asset has exceeded design life and repair is uneconomical. Allocate $5,500 CAPEX for complete system replacement").
       - ISO Clause: The relevant clause (e.g., "Clause 8.1" or "Clause 10.1").
    3. **Aggregated Financials**:
       - \`totalMaintenanceSpent\`: Sum of all WO costs.
       - \`reworkCost\`: Maintenance costs wasted in rework loops.
       - \`capexReinvestNeeded\`: Estimated capex required to solve these issues.
       - \`reworkPercentage\`: Percentage of total maintenance opex that goes to rework loops.
    4. **Financial Spend Projection**: Provide a 5-year spend comparison projection comparing Repair-OPEX (cost to continue with band-aids) vs. Replacement-CAPEX (investing in new assets to eliminate repairs).
    
    Only return a valid JSON object matching the defined schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            totalMaintenanceSpent: { type: Type.NUMBER },
            reworkCost: { type: Type.NUMBER },
            capexReinvestNeeded: { type: Type.NUMBER },
            reworkPercentage: { type: Type.NUMBER },
            detections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  assetName: { type: Type.STRING },
                  roomName: { type: Type.STRING },
                  category: { type: Type.STRING },
                  issueDescription: { type: Type.STRING },
                  totalTickets: { type: Type.NUMBER },
                  moneySpent: { type: Type.NUMBER },
                  verdict: { type: Type.STRING, enum: ["REWORK_LOOP", "SUSTAINABLE_PM"] },
                  recommendation: { type: Type.STRING },
                  isoClause: { type: Type.STRING }
                },
                required: ["id", "assetName", "roomName", "category", "issueDescription", "totalTickets", "moneySpent", "verdict", "recommendation", "isoClause"]
              }
            },
            spendByYearProjection: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  year: { type: Type.STRING },
                  repairOPEX: { type: Type.NUMBER },
                  replacementCAPEX: { type: Type.NUMBER }
                },
                required: ["year", "repairOPEX", "replacementCAPEX"]
              }
            }
          },
          required: [
            "executiveSummary", "totalMaintenanceSpent", "reworkCost", "capexReinvestNeeded",
            "reworkPercentage", "detections", "spendByYearProjection"
          ]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Work order audit failed", e);
    // Previously this labelled every corrective WO a "rework loop" and projected CAPEX with
    // arbitrary multipliers. Fail visibly instead.
    throw new Error("AI work order audit failed. No rework or CAPEX findings were produced.");
  }
};

export const cognifyDataSources = async (
  unstructuredTexts: string[],
  rooms: Room[],
  workOrders: WorkOrder[] = [],
  memories: any[] = []
): Promise<{ nodes: any[], edges: any[] }> => {
  const nodes: any[] = [];
  const edges: any[] = [];
  const nodeIds = new Set<string>();

  // Add Site node
  const siteId = 'site-1';
  nodes.push({
    id: siteId,
    label: 'Physical Facility',
    type: 'Site',
    description: 'The root facility containing all surveyed physical spaces and engineering assets.'
  });
  nodeIds.add(siteId);

  // Add Rooms
  rooms.forEach((r, idx) => {
    const rId = `room-${r.id || idx}`;
    if (!nodeIds.has(rId)) {
      nodes.push({
        id: rId,
        label: r.roomName || `Room ${idx + 1}`,
        type: 'Room',
        description: `Surveyed floor area: ${r.roomName}. Comments: ${r.comments || 'No comment recorded.'}`
      });
      nodeIds.add(rId);
      
      edges.push({
        id: `edge-site-room-${idx}`,
        source: siteId,
        target: rId,
        type: 'CONTAINS',
        description: 'Facility contains this physical space'
      });
    }

    // Add Assets inside room
    if (r.assets) {
      r.assets.forEach((a, aIdx) => {
        const assetId = `asset-${a.id}`;
        if (!nodeIds.has(assetId)) {
          nodes.push({
            id: assetId,
            label: a.name,
            type: 'Asset',
            description: `${a.category} asset under condition "${a.condition}" with risk rating "${a.riskRating || 'Medium'}". RUL: ${a.rul || 'Unknown'}. Cost: ${a.cost || '$0'}`
          });
          nodeIds.add(assetId);

          edges.push({
            id: `edge-room-asset-${a.id}`,
            source: rId,
            target: assetId,
            type: 'HAS_ASSET',
            description: 'Asset is installed/located in this room'
          });

          // System Nodes mapping (Group by Category)
          const systemId = `system-${a.category.toLowerCase().replace(/\s+/g, '-')}`;
          if (!nodeIds.has(systemId)) {
            nodes.push({
              id: systemId,
              label: `${a.category} Infrastructure System`,
              type: 'System',
              description: `Critical facility system organizing all ${a.category} hardware and assets.`
            });
            nodeIds.add(systemId);

            edges.push({
              id: `edge-site-sys-${systemId}`,
              source: siteId,
              target: systemId,
              type: 'MONITORS',
              description: 'Facility monitors this critical system'
            });
          }

          edges.push({
            id: `edge-asset-sys-${a.id}`,
            source: assetId,
            target: systemId,
            type: 'BELONGS_TO',
            description: 'Asset belongs to infrastructure system'
          });
        }
      });
    }
  });

  // Add Work Orders
  workOrders.forEach((wo, idx) => {
    const woId = `wo-${wo.id || idx}`;
    if (!nodeIds.has(woId)) {
      nodes.push({
        id: woId,
        label: `Work Order ${wo.ticketNo || '#' + idx}`,
        type: 'WorkOrder',
        description: `[${wo.maintenanceType}] ${wo.description}. Status: ${wo.status}, Cost: $${wo.cost}`
      });
      nodeIds.add(woId);

      // Link to room
      const rMatch = rooms.find(r => r.roomName.toLowerCase() === wo.roomName.toLowerCase());
      const rId = rMatch ? `room-${rMatch.id}` : null;
      if (rId && nodeIds.has(rId)) {
        edges.push({
          id: `edge-wo-room-${idx}`,
          source: woId,
          target: rId,
          type: 'AFFECTS',
          description: 'Maintenance occurs inside this space'
        });
      }

      // Link to asset if matches
      if (wo.assetId) {
        const assetId = `asset-${wo.assetId}`;
        if (nodeIds.has(assetId)) {
          edges.push({
            id: `edge-wo-asset-${idx}`,
            source: woId,
            target: assetId,
            type: 'MAINTAINED_BY',
            description: 'Work order acts upon this hardware'
          });
        }
      }
    }
  });

  // If no unstructured text or no API key, return baseline
  if ((!unstructuredTexts || unstructuredTexts.length === 0 || unstructuredTexts.join('').trim() === '') || !AI_PROXY_ENABLED) {
    return { nodes, edges };
  }

  try {
    const mergedUnstructured = unstructuredTexts.join('\n\n');
    const prompt = `You are the Cognee AI Semantic Graph Compiler.
Your goal is to parse unstructured textual documents and extract semantic concepts, systems, equipment entities, and relationships, merging them with our baseline facility graph schema.

We have a baseline graph containing:
- Nodes: ${JSON.stringify(nodes.map(n => ({ id: n.id, label: n.label, type: n.type })))}
- Edges: ${JSON.stringify(edges.map(e => ({ source: e.source, target: e.target, type: e.type })))}

Read this unstructured site report/manual content:
"""
${mergedUnstructured}
"""

Extract new entities/nodes (Type: 'Asset', 'Room', 'System', 'WorkOrder', 'Inspector', 'Concept', 'Document') that are mentioned. Create meaningful links between these new entities and the baseline entities.
For example, if the text mentions "Inspector Harold conducted fire safety audits", extract node Harold (Inspector) and edge: Harold -> CONDUCTED -> Fire System.
Provide the output in standard JSON. Include all baseline nodes/edges and any newly extracted ones, assigning unique IDs for new nodes.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  type: { 
                    type: Type.STRING, 
                    enum: ['Asset', 'Room', 'System', 'WorkOrder', 'Inspector', 'Concept', 'Site', 'Document']
                  },
                  description: { type: Type.STRING },
                },
                required: ['id', 'label', 'type']
              }
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  source: { type: Type.STRING },
                  target: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ['id', 'source', 'target', 'type']
              }
            }
          },
          required: ['nodes', 'edges']
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to run Cognee compilation with Gemini, returning robust baseline:", error);
  }

  return { nodes, edges };
};

export const queryCogneeGraph = async (
  query: string,
  graph: { nodes: any[], edges: any[] }
): Promise<{ answer: string, traversedNodes: string[], traversedEdges: string[] }> => {
  // Callers fall back to the deterministic graph engine when this throws
  if (!AI_PROXY_ENABLED) {
    throw new Error("Gemini AI proxy is not configured for semantic graph queries.");
  }

  try {
    const prompt = `You are the Cognee AI Graph Semantic Query Engine.
We have compiled an Asset Lifecycle & Facility Knowledge Graph with:
Nodes:
${JSON.stringify(graph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, desc: n.description })))}

Edges (Relationships):
${JSON.stringify(graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type, desc: e.description })))}

The user asks this graph-grounded query:
"${query}"

Instructions:
1. Traverse the graph conceptually to solve this query.
2. Formulate a comprehensive, highly technical, and professional answer.
3. Identify exactly which Node IDs and Edge IDs you "traversed" or referenced to derive this answer.
4. Output your response as a JSON object matching this schema:
{
  "answer": "...",
  "traversedNodes": ["node_id_1", "node_id_2"],
  "traversedEdges": ["edge_id_1", "edge_id_2"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            traversedNodes: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            traversedEdges: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['answer', 'traversedNodes', 'traversedEdges']
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
  } catch (err) {
    console.error("Error in querying Cognee graph:", err);
    throw err;
  }

  throw new Error("Empty response from semantic graph traversal.");
};


