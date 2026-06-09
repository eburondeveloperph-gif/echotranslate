import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, Monitor, VideoOff, Globe, Loader2, X, Activity, Info, PanelRight } from 'lucide-react';
import { useLiveTranslator, VideoMode } from './hooks/useLiveTranslator';

function AudioVisualizer({ analyserRef, isConnected }: { analyserRef: React.MutableRefObject<AnalyserNode | null>, isConnected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isConnected || !canvasRef.current) return;
    
    let animationId: number;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      if (!ctx || !analyserRef.current) return;
      animationId = requestAnimationFrame(draw);
      
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const numBars = 16;
      const barWidth = width / numBars;
      let x = 0;

      for (let i = 0; i < numBars; i++) {
        // Voice is concentrated in lower bins
        const val = dataArray[i]; 
        const percent = val / 255;
        const barHeight = Math.max(2, percent * height);
        
        ctx.fillStyle = `rgb(96, 165, 250)`; // blue-400
        
        ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isConnected, analyserRef]);

  return (
    <canvas 
      ref={canvasRef} 
      width={160} 
      height={48} 
      className={`w-[160px] h-[48px] transition-opacity duration-300 ${isConnected ? 'opacity-100' : 'opacity-0'}`} 
    />
  );
}

const LANGUAGES = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'am', name: 'Amharic' },
  { code: 'ar', name: 'Arabic' },
  { code: 'en', name: 'English' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'es', name: 'Spanish' },
  // Truncated list for simplicity, but you can retain all if preferred
];

// Using all languages from original file
const ALL_LANGUAGES = [
  { code: 'af', name: 'Afrikaans' }, { code: 'sq', name: 'Albanian' }, { code: 'am', name: 'Amharic' }, { code: 'ar', name: 'Arabic' }, { code: 'hy', name: 'Armenian' }, { code: 'as', name: 'Assamese' }, { code: 'ay', name: 'Aymara' }, { code: 'az', name: 'Azerbaijani' }, { code: 'bm', name: 'Bambara' }, { code: 'eu', name: 'Basque' }, { code: 'be', name: 'Belarusian' }, { code: 'bn', name: 'Bengali' }, { code: 'bho', name: 'Bhojpuri' }, { code: 'bs', name: 'Bosnian' }, { code: 'br', name: 'Breton' }, { code: 'bg', name: 'Bulgarian' }, { code: 'ca', name: 'Catalan' }, { code: 'ceb', name: 'Cebuano' }, { code: 'ny', name: 'Chichewa' }, { code: 'zh', name: 'Chinese (Simplified)' }, { code: 'zh-TW', name: 'Chinese (Traditional)' }, { code: 'co', name: 'Corsican' }, { code: 'hr', name: 'Croatian' }, { code: 'cs', name: 'Czech' }, { code: 'da', name: 'Danish' }, { code: 'dv', name: 'Dhivehi' }, { code: 'doi', name: 'Dogri' }, { code: 'nl', name: 'Dutch' }, { code: 'en', name: 'English' }, { code: 'eo', name: 'Esperanto' }, { code: 'et', name: 'Estonian' }, { code: 'ee', name: 'Ewe' }, { code: 'fo', name: 'Faroese' }, { code: 'fil', name: 'Filipino' }, { code: 'fi', name: 'Finnish' }, { code: 'nl-BE', name: 'Flemish' }, { code: 'fr', name: 'French' }, { code: 'fy', name: 'Frisian' }, { code: 'gl', name: 'Galician' }, { code: 'ka', name: 'Georgian' }, { code: 'de', name: 'German' }, { code: 'el', name: 'Greek' }, { code: 'gn', name: 'Guarani' }, { code: 'gu', name: 'Gujarati' }, { code: 'ht', name: 'Haitian Creole' }, { code: 'ha', name: 'Hausa' }, { code: 'haw', name: 'Hawaiian' }, { code: 'he', name: 'Hebrew' }, { code: 'hi', name: 'Hindi' }, { code: 'hmn', name: 'Hmong' }, { code: 'hu', name: 'Hungarian' }, { code: 'is', name: 'Icelandic' }, { code: 'ig', name: 'Igbo' }, { code: 'ilo', name: 'Ilocano' }, { code: 'id', name: 'Indonesian' }, { code: 'ga', name: 'Irish' }, { code: 'it', name: 'Italian' }, { code: 'itw', name: 'Itawit' }, { code: 'ja', name: 'Japanese' }, { code: 'jv', name: 'Javanese' }, { code: 'kn', name: 'Kannada' }, { code: 'kk', name: 'Kazakh' }, { code: 'km', name: 'Khmer' }, { code: 'rw', name: 'Kinyarwanda' }, { code: 'gom', name: 'Konkani' }, { code: 'ko', name: 'Korean' }, { code: 'kri', name: 'Krio' }, { code: 'ku', name: 'Kurdish (Kurmanji)' }, { code: 'ckb', name: 'Kurdish (Sorani)' }, { code: 'ky', name: 'Kyrgyz' }, { code: 'lo', name: 'Lao' }, { code: 'la', name: 'Latin' }, { code: 'lv', name: 'Latvian' }, { code: 'ln', name: 'Lingala' }, { code: 'lt', name: 'Lithuanian' }, { code: 'lg', name: 'Luganda' }, { code: 'lb', name: 'Luxembourgish' }, { code: 'mk', name: 'Macedonian' }, { code: 'mai', name: 'Maithili' }, { code: 'mg', name: 'Malagasy' }, { code: 'ms', name: 'Malay' }, { code: 'ml', name: 'Malayalam' }, { code: 'mt', name: 'Maltese' }, { code: 'mi', name: 'Maori' }, { code: 'mr', name: 'Marathi' }, { code: 'mni-Mtei', name: 'Meiteilon (Manipuri)' }, { code: 'lus', name: 'Mizo' }, { code: 'mn', name: 'Mongolian' }, { code: 'my', name: 'Myanmar (Burmese)' }, { code: 'ne', name: 'Nepali' }, { code: 'no', name: 'Norwegian' }, { code: 'oc', name: 'Occitan' }, { code: 'or', name: 'Odia (Oriya)' }, { code: 'om', name: 'Oromo' }, { code: 'ps', name: 'Pashto' }, { code: 'fa', name: 'Persian' }, { code: 'pl', name: 'Polish' }, { code: 'pt', name: 'Portuguese' }, { code: 'pa', name: 'Punjabi' }, { code: 'qu', name: 'Quechua' }, { code: 'rm', name: 'Romansh' }, { code: 'ro', name: 'Romanian' }, { code: 'ru', name: 'Russian' }, { code: 'sm', name: 'Samoan' }, { code: 'sa', name: 'Sanskrit' }, { code: 'gd', name: 'Scots Gaelic' }, { code: 'nso', name: 'Sepedi' }, { code: 'sr', name: 'Serbian' }, { code: 'st', name: 'Sesotho' }, { code: 'sn', name: 'Shona' }, { code: 'sd', name: 'Sindhi' }, { code: 'si', name: 'Sinhala' }, { code: 'sk', name: 'Slovak' }, { code: 'sl', name: 'Slovenian' }, { code: 'so', name: 'Somali' }, { code: 'es', name: 'Spanish' }, { code: 'su', name: 'Sundanese' }, { code: 'sw', name: 'Swahili' }, { code: 'sv', name: 'Swedish' }, { code: 'tg', name: 'Tajik' }, { code: 'ta', name: 'Tamil' }, { code: 'tt', name: 'Tatar' }, { code: 'te', name: 'Telugu' }, { code: 'th', name: 'Thai' }, { code: 'ti', name: 'Tigrinya' }, { code: 'ts', name: 'Tsonga' }, { code: 'tr', name: 'Turkish' }, { code: 'tk', name: 'Turkmen' }, { code: 'ak', name: 'Twi' }, { code: 'uk', name: 'Ukrainian' }, { code: 'ur', name: 'Urdu' }, { code: 'ug', name: 'Uyghur' }, { code: 'uz', name: 'Uzbek' }, { code: 'vi', name: 'Vietnamese' }, { code: 'wa', name: 'Walloon' }, { code: 'cy', name: 'Welsh' }, { code: 'xh', name: 'Xhosa' }, { code: 'yi', name: 'Yiddish' }, { code: 'yo', name: 'Yoruba' }, { code: 'zu', name: 'Zulu' }
];

export default function App() {
  const { isConnected, error, connect, disconnect, videoElementRef, transcripts, setTranscripts, analyserRef } = useLiveTranslator();
  const [targetLang, setTargetLang] = useState('fil'); // Default Filipino as in the image
  const [sourceLang, setSourceLang] = useState('auto');
  const [videoMode, setVideoMode] = useState<VideoMode>('none');
  const [isConnecting, setIsConnecting] = useState(false);
  const [echoTargetLang, setEchoTargetLang] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [topics, setTopics] = useState("carry over the emotional nuance to the output audio");

  // Group transcripts by source vs target
  // Based on current backend implementation, it emits "User" for input and "Agent" or "Model" for output.
  const inputTranscripts = transcripts.filter(t => t.speaker === 'User' || t.speaker === 'en');
  const outputTranscripts = transcripts.filter(t => t.speaker !== 'User' && t.speaker !== 'en');

  const inputEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inputTranscripts, outputTranscripts]);

  const handleToggleConnect = async () => {
    if (isConnected) {
      disconnect();
    } else {
      setIsConnecting(true);
      const targetLangName = ALL_LANGUAGES.find(l => l.code === targetLang)?.name;
      const sourceLangName = ALL_LANGUAGES.find(l => l.code === sourceLang)?.name;
      await connect(targetLang, videoMode, targetLangName, sourceLang, sourceLangName, topics);
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (error) {
      setIsConnecting(false);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#111111] text-[#f4f4f5] flex font-sans">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative px-12 py-8 overflow-hidden h-screen">
        
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 right-6 z-50 p-2 rounded-full hover:bg-white/10 text-neutral-400 bg-transparent transition-colors"
        >
          <PanelRight className="w-5 h-5" />
        </button>

        {/* Error notification */}
        {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 text-red-400 rounded px-4 py-2 text-sm z-50">
              {error}
            </div>
        )}

        <div className="flex flex-1 gap-16 overflow-hidden">
          
          {/* Input Transcript Column */}
          <div className="flex-1 flex flex-col min-w-0 h-full">
            <h2 className="text-[#a1a1aa] font-medium text-lg mb-6 shrink-0">Input transcript</h2>
            <div className="flex-1 overflow-y-auto pb-32 custom-scrollbar pr-4 text-neutral-300 font-light leading-relaxed text-lg">
              {inputTranscripts.length === 0 ? (
                <div className="flex items-center gap-3">
                  <span className="bg-[#27272a] text-[#d4d4d8] text-xs font-semibold px-2 py-1 rounded">EN</span>
                  <span className="opacity-50">Waiting for speech...</span>
                </div>
              ) : (
                <div className="flex">
                   <span className="bg-[#27272a] text-[#d4d4d8] text-xs font-semibold px-2 py-0.5 rounded mt-1 mr-3 h-fit shrink-0">EN</span>
                   <span>
                     {inputTranscripts.map((t, i) => (
                       <React.Fragment key={t.id}>
                         {t.text}{' '}
                       </React.Fragment>
                     ))}
                   </span>
                </div>
              )}
              <div ref={inputEndRef} />
            </div>
          </div>

          {/* Output Transcript Column */}
          <div className="flex-1 flex flex-col min-w-0 h-full">
            <h2 className="text-[#a1a1aa] font-medium text-lg mb-6 shrink-0">Output transcript</h2>
            <div className="flex-1 overflow-y-auto pb-32 custom-scrollbar pr-4 text-neutral-300 font-light leading-relaxed text-lg">
              {outputTranscripts.length === 0 ? (
                <div className="flex items-center gap-3">
                  <span className="bg-[#27272a] text-[#d4d4d8] text-xs font-semibold px-2 py-1 rounded">
                    {targetLang.toUpperCase()}
                  </span>
                  <span className="opacity-50">Translation will appear here...</span>
                </div>
              ) : (
                <div className="flex">
                   <span className="bg-[#27272a] text-[#d4d4d8] text-xs font-semibold px-2 py-0.5 rounded mt-1 mr-3 h-fit shrink-0">
                     {targetLang.toUpperCase()}
                   </span>
                   <span>
                     {outputTranscripts.map((t, i) => (
                       <React.Fragment key={t.id}>
                         {t.text}{' '}
                       </React.Fragment>
                     ))}
                   </span>
                </div>
              )}
              <div ref={outputEndRef} />
            </div>
          </div>

        </div>

        {/* Video Picture-in-Picture Preview */}
        <div className={`absolute bottom-24 right-12 w-[320px] rounded-xl overflow-hidden bg-black shadow-2xl border border-white/10 transition-all duration-300 ${videoMode === 'none' ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
           <video
              ref={(el) => {
                videoElementRef.current = el;
                if (el && videoMode === 'screen') {
                  el.volume = 0; // Mute local feedback
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video object-cover"
            />
            {videoMode !== 'none' && !isConnected && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                 <VideoOff className="w-8 h-8 text-white/50 mb-2" />
                 <span className="text-xs text-white/50 font-medium">Inactive</span>
               </div>
            )}
        </div>

        {/* Floating Controls Bar */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 relative">
          
          {/* Audio Visualizer Popover */}
          <div className={`transition-all duration-300 absolute bottom-[calc(100%+16px)] ${showVisualizer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <div className="bg-[#1c1c1f] p-4 rounded-2xl border border-white/5 shadow-2xl flex flex-col items-center gap-2">
               <span className="text-[10px] uppercase tracking-widest text-[#71717a] font-semibold">Audio input</span>
               {isConnected ? (
                 <AudioVisualizer analyserRef={analyserRef} isConnected={isConnected} />
               ) : (
                 <div className="w-[160px] h-[48px] flex items-center justify-center">
                    <span className="text-xs text-[#71717a]">Connect to see activity</span>
                 </div>
               )}
            </div>
          </div>

          <div className="bg-[#1c1c1f] border border-white/5 shadow-2xl rounded-2xl flex items-center p-2 pr-4 pl-6 gap-4">
          <div className="flex items-center gap-3">
             {isConnecting ? (
               <span className="text-sm font-medium text-white flex items-center gap-2">
                 <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> Connecting...
               </span>
             ) : isConnected ? (
               <span className="text-sm font-medium text-white">Stream is live</span>
             ) : (
               <button onClick={handleToggleConnect} className="text-sm font-medium text-blue-400 hover:text-blue-300">Start connection</button>
             )}
             
             {isConnected && (
               <button onClick={disconnect} className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors">
                 <X className="w-4 h-4" />
               </button>
             )}
          </div>

          <div className="w-[1px] h-6 bg-white/10 mx-2"></div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowVisualizer(!showVisualizer)}
              className={`p-2.5 rounded-full transition-colors ${showVisualizer ? 'bg-blue-600' : 'bg-white/5 hover:bg-white/10 text-neutral-300'}`}
              title="Audio visualizer"
            >
              <Activity className={`w-4 h-4 ${showVisualizer ? 'text-white' : ''}`} />
            </button>
            <button 
              onClick={() => {}} // Could toggle mic if needed
              className="p-2.5 rounded-full hover:bg-white/5 text-neutral-300 transition-colors bg-[#3f3f46]"
              title="Microphone"
            >
              <Mic className="w-4 h-4 text-white" />
            </button>
            <button 
              onClick={() => setVideoMode(prev => prev === 'screen' ? 'none' : 'screen')}
              className={`p-2.5 rounded-full transition-colors ${videoMode === 'screen' ? 'bg-blue-600' : 'bg-white/5 hover:bg-white/10 text-neutral-300'}`}
              title="Share screen"
            >
              <Monitor className={`w-4 h-4 ${videoMode === 'screen' ? 'text-white' : ''}`} />
            </button>
          </div>
          </div>
        </div>

      </div>

      {/* Right Sidebar */}
      <div className={`bg-[#161616] border-l border-white/5 flex flex-col gap-6 overflow-y-auto shrink-0 z-20 transition-all duration-300 ${isSidebarOpen ? 'w-[340px] p-6' : 'w-0 opacity-0 overflow-hidden px-0 border-transparent py-6'}`}>
        
        {/* Info Card (Hidden) */}
        {/* <div className="bg-[#1c1c1f] rounded-xl border border-white/5 p-4 flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-200">Gemini 3.5 Live Translate Preview</h3>
          <p className="text-xs text-neutral-500 font-mono">gemini-3.5-live-translate-preview</p>
          <p className="text-xs text-neutral-400 leading-relaxed mt-1">
            A real-time speech-to-speech translation model delivering low latency translation for 70+ languages.
          </p>
        </div> */}

        {/* Topics */}
        <div className="bg-[#1c1c1f] rounded-xl border border-white/5 p-4 flex flex-col gap-2 relative">
           <div className="absolute top-4 right-4 text-neutral-600">
             <Info className="w-4 h-4" />
           </div>
           <h3 className="text-sm font-medium text-neutral-200 mb-1">Topics</h3>
           <textarea 
             className="w-full bg-transparent text-xs text-neutral-400 resize-none h-20 outline-none placeholder:text-neutral-600"
             placeholder="Optional topic instructions for the model"
             value={topics}
             onChange={(e) => setTopics(e.target.value)}
             disabled={isConnected || isConnecting}
           ></textarea>
        </div>

        {/* Target Language */}
        <div className="flex flex-col gap-3 mt-4">
           <h3 className="text-sm font-medium text-neutral-200">Target language</h3>
           <div className="relative">
             <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
               <Globe className="w-4 h-4" />
             </div>
             <select 
               value={targetLang}
               onChange={(e) => setTargetLang(e.target.value)}
               disabled={isConnected || isConnecting}
               className="w-full bg-[#1c1c1f] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-neutral-200 focus:outline-none focus:border-white/20 appearance-none cursor-pointer disabled:opacity-50"
             >
               {ALL_LANGUAGES.map(l => (
                 <option key={l.code} value={l.code}>{l.name}</option>
               ))}
             </select>
             <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-neutral-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
             </div>
           </div>
        </div>

        {/* Echo target language toggle */}
        <div className="flex items-center justify-between mt-2 pt-6 border-t border-white/5">
           <span className="text-sm font-medium text-neutral-200">Echo target language</span>
           <button 
             onClick={() => setEchoTargetLang(!echoTargetLang)}
             disabled={isConnected || isConnecting}
             className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors relative ${echoTargetLang ? 'bg-blue-600' : 'bg-[#3f3f46]'}`}
           >
             <div className={`w-4 h-4 rounded-full bg-white transition-transform ${echoTargetLang ? 'translate-x-4' : 'translate-x-0'}`}></div>
           </button>
        </div>

      </div>

    </div>
  );
}

