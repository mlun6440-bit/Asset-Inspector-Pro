
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createChatStream } from '../services/geminiService';
import { ChatMessage } from '../types';
import { StandardsNotebook } from './StandardsNotebook';

// PCM Audio Utilities
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface ChatBotProps {
  contextData: any; 
  privacyMode: boolean;
  mode: 'single' | 'portfolio';
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const ChatBot: React.FC<ChatBotProps> = ({ contextData, privacyMode, mode, messages, setMessages }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [liveObservations, setLiveObservations] = useState<Array<{id: string, type: string, description: string, condition: string, riskRating: string, time: Date}>>([]);
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);

  const findMatchingClauseId = (content: string): string | null => {
    const normalized = content.toLowerCase();
    if (normalized.includes('55000') || normalized.includes('principles') || normalized.includes('2.4')) {
      return 'iso-55000-principles';
    }
    if (normalized.includes('4.1')) return 'iso-55001-4.1';
    if (normalized.includes('4.2')) return 'iso-55001-4.2';
    if (normalized.includes('5.1')) return 'iso-55001-5.1';
    if (normalized.includes('6.1')) return 'iso-55001-6.1';
    if (normalized.includes('6.2')) return 'iso-55001-6.2';
    if (normalized.includes('7.5')) return 'iso-55001-7.5';
    if (normalized.includes('8.1')) return 'iso-55001-8.1';
    if (normalized.includes('8.2')) return 'iso-55001-8.2';
    if (normalized.includes('9.1')) return 'iso-55001-9.1';
    if (normalized.includes('10.1')) return 'iso-55001-10.1';
    if (normalized.includes('55002') || normalized.includes('annex a')) return 'iso-55002-guidance';
    return null;
  };

  const renderMessageTextWithLinks = (text: string) => {
    // Matches square brackets containing Clause, ISO, Section, or Annex
    const generalRegex = /\[([^\]]*(?:Clause|ISO\s+\d+|Section|Annex)[^\]]*)\]/gi;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = generalRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      const fullMatch = match[0];
      const content = match[1];
      
      if (matchIndex > lastIndex) {
        parts.push(<span key={lastIndex}>{text.substring(lastIndex, matchIndex)}</span>);
      }
      
      const matchedId = findMatchingClauseId(content);
      
      if (matchedId) {
        parts.push(
          <button
            key={matchIndex}
            onClick={() => {
              setActiveClauseId(matchedId);
              setIsNotebookOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-mono text-[11px] font-bold transition-colors shadow-sm align-baseline cursor-pointer"
            title="Click to view standard details in the Standards Notebook"
          >
            <span className="material-icons text-[11px]">menu_book</span>
            {content}
          </button>
        );
      } else {
        parts.push(<span key={matchIndex} className="text-amber-700 font-semibold">{fullMatch}</span>);
      }
      
      lastIndex = generalRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
    }
    
    return parts.length > 0 ? parts : text;
  };

  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const frameIntervalRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, liveTranscription]);

  useEffect(() => {
    return () => {
      // Ensure camera, audio streams, intervals, and audio contexts are cleanly torn down on unmount
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      if (liveSessionRef.current) {
        try {
          const { stream, scriptProcessor } = liveSessionRef.current;
          stream?.getTracks()?.forEach((track: any) => track.stop());
          scriptProcessor?.disconnect();
        } catch (e) {
          console.warn("Error cleaning up live stream", e);
        }
        liveSessionRef.current = null;
      }
      for (const s of audioSourcesRef.current.values()) {
        try { s.stop(); } catch (e) {}
      }
      audioSourcesRef.current.clear();
      if (audioContextInRef.current && audioContextInRef.current.state !== 'closed') {
        try { audioContextInRef.current.close(); } catch(e) {}
      }
      if (audioContextOutRef.current && audioContextOutRef.current.state !== 'closed') {
        try { audioContextOutRef.current.close(); } catch(e) {}
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => !m.id.startsWith('init'))
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));

      const stream = await createChatStream(history, userMsg.text, contextData, privacyMode);
      
      const botMsgId = crypto.randomUUID();
      let fullResponse = "";
      
      setMessages(prev => [...prev, {
          id: botMsgId,
          role: 'model',
          text: '',
          timestamp: Date.now()
      }]);

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          setMessages(prev => prev.map(m => 
            m.id === botMsgId ? { ...m, text: fullResponse } : m
          ));
        }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: 'Sorry, I encountered an error connecting to Gemini.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startLiveMode = async () => {
    if (isLiveActive) return;
    setIsLiveActive(true);
    setLiveTranscription("Initializing Multimodal Session...");

    try {
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = audioContextOutRef.current.createGain();
      outputNode.connect(audioContextOutRef.current.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 640, height: 480, frameRate: 15 } 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const siteName = privacyMode ? "REDACTED_SITE" : (Array.isArray(contextData) ? "Multiple Portfolio Sites" : contextData.siteInfo.name);
      const assetSummary = Array.isArray(contextData) 
        ? contextData.map(s => `Site: ${s.siteInfo?.name}, Assets: ${s.rooms?.length || 0} rooms analyzed`).join('; ')
        : (contextData.rooms || []).flatMap((r: any) => (r.assets || []).map((a: any) => `${a.category} (${a.condition})`)).join(', ');

      const systemInstruction = `
        You are a specialized Engineering Auditor in a LIVE MULTIMODAL session for ${siteName}.
        
        DATA CONTEXT: ${assetSummary}

        INSTRUCTIONS:
        - You can SEE the video feed from the inspector's camera.
        - PROACTIVELY analyze the video stream for potential hazards, asset identification, and condition assessments as the inspector moves through the site.
        - CRITICAL: Maintain a mental visual map of the site. If you see an asset you have already logged from a different angle, DO NOT log it again.
        - Deduplicate assets across frames. Only use 'log_observation' for NEW physical items or significant NEW hazards.
        - IMPORTANT: Do not wait for the user to ask questions. Continually scan for and call out assets or safety hazards.
        - When you spot a NEW asset or hazard, use the 'log_observation' tool to log it immediately, then briefly verbally acknowledge what you just logged.
        - Provide immediate, concise, and technical feedback.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            setLiveTranscription("Vision/Audio Active. Point camera at assets.");
            
            const audioSource = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ 
                  audio: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };
            
            audioSource.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);

            // Stream Video Frames (Multimodal Live)
            frameIntervalRef.current = window.setInterval(() => {
              if (videoRef.current && canvasRef.current && canvasRef.current.getContext('2d')) {
                const ctx = canvasRef.current.getContext('2d')!;
                canvasRef.current.width = 480; // slightly higher res for better spatial memory
                canvasRef.current.height = 360;
                ctx.drawImage(videoRef.current, 0, 0, 480, 360);
                
                const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.55).split(',')[1];
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({
                    video: { data: base64Data, mimeType: 'image/jpeg' }
                  });
                });
              }
            }, 1000); 

            liveSessionRef.current = { sessionPromise, scriptProcessor, stream };
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              message.serverContent.modelTurn.parts.forEach((part: any) => {
                 if (part.functionCall && part.functionCall.name === 'log_observation') {
                    const args = part.functionCall.args as any;
                    
                    // Client-side fuzzy deduplication
                    setLiveObservations(prev => {
                      const isDuplicate = prev.some(obs => 
                        obs.type === args.type && 
                        (obs.description.toLowerCase().includes(args.description.toLowerCase()) || 
                         args.description.toLowerCase().includes(obs.description.toLowerCase()))
                      );

                      if (isDuplicate) return prev;

                      return [{
                        id: crypto.randomUUID(),
                        type: args.type || 'asset',
                        description: args.description || 'Unknown observation',
                        condition: args.condition || 'N/A',
                        riskRating: args.riskRating || 'Low',
                        time: new Date()
                      }, ...prev].slice(0, 10); // Keep more history for active sessions
                    });

                    // Acknowledge the function call to the model
                    sessionPromise.then(session => {
                      (session as any).send({
                         clientContent: {
                           turns: [{
                             role: "user",
                             parts: [{
                               functionResponse: {
                                 name: "log_observation",
                                 response: { result: "logged successfully" }
                               }
                             }]
                           }],
                           turnComplete: true
                         }
                      });
                    });
                 }
              });
            }

            if (message.serverContent?.outputTranscription) {
              setLiveTranscription(prev => (prev.length > 80 ? "" : prev) + message.serverContent!.outputTranscription!.text);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              const ctx = audioContextOutRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const s of audioSourcesRef.current.values()) try { s.stop(); } catch(e) {}
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Live Error:', e);
            stopLiveMode();
          },
          onclose: () => stopLiveMode()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "log_observation",
                description: "Logs an observed hazard or asset directly to the inspector's dashboard screen in real-time.",
                parameters: {
                  type: 'OBJECT' as any,
                  properties: {
                    type: { type: 'STRING' as any, description: "Enum: 'hazard' or 'asset'" },
                    description: { type: 'STRING' as any, description: "Detailed description of the observation" },
                    condition: { type: 'STRING' as any, description: "Condition of the asset (e.g., 'Good', 'Poor'), or N/A for hazards" },
                    riskRating: { type: 'STRING' as any, description: "Risk rating (e.g., 'Low', 'Medium', 'High', 'Extreme')" }
                  },
                  required: ["type", "description", "riskRating"]
                }
              }
            ]
          }]
        },
      });

    } catch (e) {
      console.error("Failed to start live mode:", e);
      setIsLiveActive(false);
    }
  };

  const stopLiveMode = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (liveSessionRef.current) {
      const { stream, scriptProcessor } = liveSessionRef.current;
      stream.getTracks().forEach((track: any) => track.stop());
      scriptProcessor.disconnect();
      liveSessionRef.current = null;
    }
    for (const s of audioSourcesRef.current.values()) try { s.stop(); } catch(e) {}
    audioSourcesRef.current.clear();
    if (audioContextInRef.current) audioContextInRef.current.close();
    if (audioContextOutRef.current) audioContextOutRef.current.close();
    setIsLiveActive(false);
    setLiveTranscription("");
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center transition-all z-50 hover:scale-110 active:scale-95 ${
            isLiveActive ? 'bg-red-500 animate-pulse' :
            mode === 'portfolio' ? 'bg-purple-600' : 
            privacyMode ? 'bg-teal-600' : 'bg-indigo-600'
        }`}
      >
        {isOpen ? <span className="material-icons">close</span> : <span className="material-icons">{mode === 'portfolio' ? 'pie_chart' : 'engineering'}</span>}
      </button>

      {isOpen && (
        <div className={`fixed bottom-24 right-6 h-[600px] max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col md:flex-row z-50 overflow-hidden border border-gray-200 transition-all duration-300 ease-in-out animate-fade-in-up ${
          isNotebookOpen ? 'w-[95vw] max-w-4xl' : 'w-[90vw] max-w-md'
        }`}>
          {/* Main Chat Pane */}
          <div className="flex-1 flex flex-col h-full min-w-0">
            <div className={`p-4 text-white flex justify-between items-center transition-colors bg-gradient-to-r shrink-0 ${
                isLiveActive ? 'from-red-600 to-orange-500' :
                mode === 'portfolio' ? 'from-purple-700 to-pink-600' :
                privacyMode ? 'from-teal-700 to-green-600' : 'from-indigo-700 to-purple-700'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-icons text-xl">{isLiveActive ? 'videocam' : 'psychology'}</span>
                <div>
                  <h3 className="font-bold text-sm">{isLiveActive ? 'Multimodal Live Audit' : 'Engineering Manager'}</h3>
                  <span className="text-[10px] opacity-80 block">{isLiveActive ? 'Camera + Audio Streaming' : 'ISO 55001:2024 Context'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isLiveActive && (
                  <button 
                    onClick={() => setIsNotebookOpen(!isNotebookOpen)} 
                    className={`p-1.5 rounded-full transition-all flex items-center justify-center ${
                      isNotebookOpen ? 'bg-amber-500 text-slate-900 font-bold scale-110 shadow-md' : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                    title="Toggle ISO Standards Reference Notebook"
                  >
                    <span className="material-icons text-sm">menu_book</span>
                  </button>
                )}
                {!isLiveActive && <button onClick={startLiveMode} className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full"><span className="material-icons text-sm">videocam</span></button>}
                {isLiveActive && <button onClick={stopLiveMode} className="bg-red-700 p-1.5 rounded-full"><span className="material-icons text-sm">call_end</span></button>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
              {isLiveActive && (
                <div className="flex flex-col items-center h-full space-y-4">
                   <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg border-2 border-red-200">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                         <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> LIVE FEED
                      </div>
                   </div>
                   {liveTranscription && (
                      <div className="bg-white p-3 rounded-xl border border-red-100 shadow-inner w-full text-xs text-gray-700 italic min-h-[60px]">
                         "{liveTranscription}"
                      </div>
                   )}
                   {liveObservations.length > 0 && (
                       <div className="w-full space-y-2 mt-2">
                           <h4 className="text-[10px] uppercase font-bold text-gray-500">Live AI Analytics</h4>
                           {liveObservations.map(obs => (
                               <div key={obs.id} className={`p-2 rounded-lg border text-xs flex gap-2 items-start ${obs.type === 'hazard' ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'} animate-fade-in-up`}>
                                   <span className={`material-icons text-sm ${obs.type === 'hazard' ? 'text-orange-500' : 'text-blue-500'}`}>
                                       {obs.type === 'hazard' ? 'warning' : 'category'}
                                   </span>
                                   <div>
                                      <div className="font-semibold text-gray-800">{obs.description}</div>
                                      <div className="text-[10px] text-gray-500 flex gap-2 mt-0.5">
                                        <span>Risk: <b className={`${obs.riskRating === 'High' || obs.riskRating === 'Extreme' ? 'text-red-500' : ''}`}>{obs.riskRating}</b></span>
                                        {obs.type === 'asset' && <span>Cond: <b>{obs.condition}</b></span>}
                                      </div>
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
                   <p className="text-[10px] text-gray-400 text-center">Gemini is seeing your camera and hearing your voice to analyze assets in real-time.</p>

                </div>
              )}
              {!isLiveActive && messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 border rounded-bl-none'}`}>
                    <p className="text-sm whitespace-pre-wrap">
                      {msg.role === 'model' ? renderMessageTextWithLinks(msg.text) : msg.text}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && <div className="flex justify-start"><div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none shadow-sm border animate-pulse">...</div></div>}
              <div ref={messagesEndRef} />
            </div>

            {!isLiveActive && (
              <div className="p-4 bg-white border-t shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about remedial works..."
                    className="flex-1 px-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button onClick={handleSend} disabled={isLoading || !input.trim()} className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center cursor-pointer"><span className="material-icons text-sm">send</span></button>
                </div>
              </div>
            )}
          </div>

          {/* Standards Notebook Side-Pane */}
          {isNotebookOpen && (
            <div className="w-full md:w-[45%] border-t md:border-t-0 md:border-l border-slate-700 h-1/2 md:h-full shrink-0 flex">
              <StandardsNotebook
                activeClauseId={activeClauseId}
                onSelectClause={(id) => setActiveClauseId(id)}
                onClose={() => setIsNotebookOpen(false)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};
