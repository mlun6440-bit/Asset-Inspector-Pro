
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createChatStream } from '../services/geminiService';
import { ChatMessage } from '../types';

// PCM Audio Utilities as per @google/genai coding guidelines
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, liveTranscription]);

  // Handle Text-based Chat (Existing functionality)
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

  // --- LIVE VOICE API IMPLEMENTATION ---

  const startLiveMode = async () => {
    if (isLiveActive) return;
    setIsLiveActive(true);
    setLiveTranscription("Connecting to engineering expert...");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      // Setup Audio Contexts
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = audioContextOutRef.current.createGain();
      outputNode.connect(audioContextOutRef.current.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Build System Instruction from Context
      const siteName = privacyMode ? "REDACTED_SITE" : (Array.isArray(contextData) ? "Multiple Portfolio Sites" : contextData.siteInfo.name);
      const assetSummary = Array.isArray(contextData) 
        ? contextData.map(s => `Site: ${s.siteInfo?.name}, Assets: ${s.rooms?.length || 0} rooms analyzed`).join('; ')
        : (contextData.rooms || []).flatMap((r: any) => (r.assets || []).map((a: any) => `${a.category} (${a.condition}, Risk: ${a.riskRating})`)).join(', ');

      const systemInstruction = `
        You are an expert Engineering Asset Auditor conducting a LIVE voice consultation for: ${siteName}.
        
        CAPTURED DATA:
        ${assetSummary}

        YOUR TASK:
        - Discuss the captured assets in real-time.
        - Use ISO 55000 / Scenario 3 Logic.
        - Be professional, technical yet concise. 
        - Keep answers short for natural conversation.
        - You can 'see' the data captured in the session JSON.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setLiveTranscription("Session Active. Speak now.");
            
            // Stream audio from mic to model
            const source = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);
            liveSessionRef.current = { sessionPromise, scriptProcessor, stream };
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle output transcription
            if (message.serverContent?.outputTranscription) {
              setLiveTranscription(prev => (prev.length > 100 ? "" : prev) + message.serverContent!.outputTranscription!.text);
            }

            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              const ctx = audioContextOutRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              for (const source of audioSourcesRef.current.values()) {
                try { source.stop(); } catch(e) {}
              }
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Live Error:', e);
            stopLiveMode();
          },
          onclose: () => {
            console.log('Live Session Closed');
            stopLiveMode();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction,
          outputAudioTranscription: {},
        },
      });

    } catch (e) {
      console.error("Failed to start live mode:", e);
      setIsLiveActive(false);
    }
  };

  const stopLiveMode = () => {
    if (liveSessionRef.current) {
      const { stream, scriptProcessor } = liveSessionRef.current;
      stream.getTracks().forEach((track: any) => track.stop());
      scriptProcessor.disconnect();
      liveSessionRef.current = null;
    }
    
    for (const source of audioSourcesRef.current.values()) {
      try { source.stop(); } catch(e) {}
    }
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
            mode === 'portfolio' ? 'bg-purple-600 hover:bg-purple-700' : 
            privacyMode ? 'bg-teal-600 hover:bg-teal-700' : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
        aria-label="Open AI Chat"
      >
        {isOpen ? (
          <span className="material-icons">close</span>
        ) : (
          <span className="material-icons">{mode === 'portfolio' ? 'pie_chart' : 'engineering'}</span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[90vw] max-w-md h-[500px] max-h-[70vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-200 animate-fade-in-up">
          <div className={`p-4 text-white flex justify-between items-center transition-colors bg-gradient-to-r ${
              isLiveActive ? 'from-red-600 to-orange-500' :
              mode === 'portfolio' ? 'from-purple-700 to-pink-600' :
              privacyMode ? 'from-teal-700 to-green-600' : 'from-indigo-700 to-purple-700'
          }`}>
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl">
                {isLiveActive ? 'record_voice_over' : (mode === 'portfolio' ? 'analytics' : 'psychology')}
              </span>
              <div>
                <h3 className="font-bold text-sm">
                  {isLiveActive ? 'Live Engineering Call' : (mode === 'portfolio' ? 'Portfolio Strategist' : 'Engineering Manager')}
                </h3>
                <span className="text-[10px] opacity-80 block">
                    {isLiveActive ? 'Voice Conversation Active' : (mode === 'portfolio' ? 'Accessing Firebase Cloud' : 'ISO 55001:2024 Aligned')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isLiveActive && (
                <button 
                  onClick={startLiveMode} 
                  className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors flex items-center justify-center"
                  title="Talk with Data (Live Voice)"
                >
                  <span className="material-icons text-sm">phone</span>
                </button>
              )}
              {isLiveActive && (
                <button 
                  onClick={stopLiveMode} 
                  className="bg-red-700 hover:bg-red-800 p-2 rounded-full transition-colors flex items-center justify-center"
                  title="End Call"
                >
                  <span className="material-icons text-sm">call_end</span>
                </button>
              )}
              <div className="text-xs bg-white/20 px-2 py-1 rounded">
                Gemini {isLiveActive ? '2.5' : '3.0'}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
            {isLiveActive ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6">
                 <div className="relative">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                        <span className="material-icons text-5xl text-red-600">mic</span>
                    </div>
                    <div className="absolute inset-0 border-4 border-red-200 rounded-full animate-ping"></div>
                 </div>
                 <div>
                    <h4 className="font-bold text-gray-800">Voice Consultation Active</h4>
                    <p className="text-xs text-gray-500 mt-2">Speak naturally about the building assets. The AI has access to all detected data.</p>
                 </div>
                 {liveTranscription && (
                    <div className="bg-white p-4 rounded-xl border border-red-100 shadow-inner w-full text-sm text-gray-700 italic min-h-[80px] flex items-center justify-center">
                       "{liveTranscription}"
                    </div>
                 )}
                 <button 
                    onClick={stopLiveMode}
                    className="px-6 py-2 bg-gray-800 text-white rounded-full font-bold text-sm shadow-md hover:bg-black transition"
                 >
                    End Conversation
                 </button>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${
                        msg.role === 'user'
                          ? `${mode === 'portfolio' ? 'bg-purple-600' : 'bg-indigo-600'} text-white rounded-br-none`
                          : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none shadow-sm border border-gray-100 flex gap-1">
                      <div className={`w-2 h-2 rounded-full animate-bounce ${privacyMode ? 'bg-teal-400' : 'bg-indigo-400'}`} style={{ animationDelay: '0ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${privacyMode ? 'bg-teal-400' : 'bg-indigo-400'}`} style={{ animationDelay: '150ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${privacyMode ? 'bg-teal-400' : 'bg-indigo-400'}`} style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!isLiveActive && (
            <div className="p-4 bg-white border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={mode === 'portfolio' ? "Compare sites, find risks..." : "Ask about remedial works..."}
                  className={`flex-1 px-4 py-2 bg-white text-black placeholder-gray-500 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:border-transparent text-sm ${privacyMode ? 'focus:ring-teal-500' : 'focus:ring-indigo-500'}`}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className={`w-10 h-10 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${privacyMode ? 'bg-teal-600 hover:bg-teal-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  <span className="material-icons text-sm">send</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
