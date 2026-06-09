import { useState, useRef, useCallback, useEffect } from 'react';
import { pcmToBase64, base64ToPcm } from '../lib/audio';

export type VideoMode = 'camera' | 'screen' | 'none';

function detectPitch(buffer: Float32Array, sampleRate: number): number {
  let maxVal = 0;
  for (let i = 0; i < buffer.length; i++) {
    const absVal = Math.abs(buffer[i]);
    if (absVal > maxVal) {
      maxVal = absVal;
    }
  }
  
  // Ignore quiet silence or pure background static/noise
  if (maxVal < 0.012) {
    return -1;
  }

  // Scan ranges corresponding to typical human speaker vocal pitches (70 Hz to 300 Hz)
  // At 16000 Hz:
  // Math.floor(16000 / 300) = 53 samples lag
  // Math.floor(16000 / 70) = 228 samples lag
  const minLag = Math.floor(sampleRate / 300);
  const maxLag = Math.floor(sampleRate / 70);
  
  let bestLag = -1;
  let bestCorrelation = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let sumSquares1 = 0;
    let sumSquares2 = 0;
    
    const limit = buffer.length - lag;
    for (let i = 0; i < limit; i++) {
      const v1 = buffer[i];
      const v2 = buffer[i + lag];
      correlation += v1 * v2;
      sumSquares1 += v1 * v1;
      sumSquares2 += v2 * v2;
    }
    
    if (sumSquares1 > 0 && sumSquares2 > 0) {
      const normalizedCorr = correlation / Math.sqrt(sumSquares1 * sumSquares2);
      if (normalizedCorr > bestCorrelation) {
        bestCorrelation = normalizedCorr;
        bestLag = lag;
      }
    }
  }

  // A periodic voiced signal has high autocorrelation (typically well above 0.55 at its pitch period)
  if (bestCorrelation > 0.62 && bestLag !== -1) {
    return sampleRate / bestLag;
  }
  return -1;
}

export function useLiveTranslator() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ id: string; speaker: string; text: string; time: string; timestamp: number }>>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const smoothedSpeakerRmsRef = useRef<number>(0);
  const speakerPlayHangoverRef = useRef<number>(0);
  
  const recentPitchesRef = useRef<number[]>([]);
  const clientDetectedGenderRef = useRef<'male' | 'female' | null>(null);
  const translatingTimeoutRef = useRef<any>(null);

  const triggerTranslating = useCallback(() => {
    setIsTranslating(true);
    if (translatingTimeoutRef.current) {
      clearTimeout(translatingTimeoutRef.current);
    }
    translatingTimeoutRef.current = setTimeout(() => {
      setIsTranslating(false);
    }, 12000); // 12 seconds auto-reset
  }, []);

  const captureVideoFrame = useCallback(() => {
    if (!videoElementRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const video = videoElementRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = 640; // reasonable resolution
    canvas.height = (video.videoHeight / video.videoWidth) * 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = dataUrl.split(',')[1];
    
    if (base64Data) {
      wsRef.current.send(JSON.stringify({ video: base64Data }));
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newVal = !prev;
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !newVal;
        });
      }
      return newVal;
    });
  }, []);

  const connect = useCallback(async (targetLanguageCode: string, mode: VideoMode, targetLanguageName?: string, sourceLanguageCode?: string, sourceLanguageName?: string, topics?: string, echoTargetLang?: boolean, voiceGender?: 'auto' | 'female' | 'male') => {
    try {
      setError(null);
      recentPitchesRef.current = [];
      clientDetectedGenderRef.current = null;

      // 1. Request microphone permission first so user is prompted immediately!
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true 
          } 
        });
        streamRef.current = micStream;
      } catch (e: any) {
        console.error("Could not get microphone stream", e);
        throw new Error("Microphone access is required for real-time translation. Please allow microphone permissions in your browser and try again.");
      }
      
      let wsUrl: URL;
      const customWsUrl = localStorage.getItem('custom_ws_url');
      if (customWsUrl && customWsUrl.trim() !== '') {
        try {
          wsUrl = new URL(customWsUrl);
        } catch (e) {
          throw new Error("Invalid custom WebSocket URL format in Settings. Make sure it starts with ws:// or wss://");
        }
      } else {
        wsUrl = new URL('/live', window.location.href);
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      }
      
      wsUrl.searchParams.set('targetLanguageCode', targetLanguageCode);
      if (targetLanguageName) {
        wsUrl.searchParams.set('targetLanguageName', targetLanguageName);
      }
      if (sourceLanguageCode && sourceLanguageCode !== 'auto') {
        wsUrl.searchParams.set('sourceLanguageCode', sourceLanguageCode);
        if (sourceLanguageName) {
           wsUrl.searchParams.set('sourceLanguageName', sourceLanguageName);
        }
      }
      if (topics) {
        wsUrl.searchParams.set('topics', topics);
      }
      if (echoTargetLang !== undefined) {
        wsUrl.searchParams.set('echoTargetLanguage', String(echoTargetLang));
      }
      if (voiceGender) {
        wsUrl.searchParams.set('voiceGender', voiceGender);
      }
      
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });
      inputCtxRef.current = inputAudioCtx;
      outputCtxRef.current = outputAudioCtx;

      // Initialize output analyzer for robust acoustic echo cancellation/suppression
      const outputAnalyser = outputAudioCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyser.connect(outputAudioCtx.destination);
      outputAnalyserRef.current = outputAnalyser;

      // Ensure contexts are running
      if (inputAudioCtx.state === 'suspended') await inputAudioCtx.resume();
      if (outputAudioCtx.state === 'suspended') await outputAudioCtx.resume();

      nextStartTimeRef.current = outputAudioCtx.currentTime;

      ws.onopen = async () => {
        try {
          const activeMicStream = streamRef.current;
          if (activeMicStream) {
            activeMicStream.getAudioTracks().forEach(track => {
              track.enabled = !isMuted;
            });
          }
          
          if (mode === 'camera') {
            videoStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          } else if (mode === 'screen') {
            videoStreamRef.current = await navigator.mediaDevices.getDisplayMedia({ 
              video: true, 
              audio: true
            });
          }

          const mixedAudioStream = new MediaStream();
          if (activeMicStream) {
            activeMicStream.getAudioTracks().forEach(track => mixedAudioStream.addTrack(track));
          }

          const audioMixer = inputAudioCtx.createGain();
          
          if (activeMicStream && activeMicStream.getAudioTracks().length > 0) {
            const micSource = inputAudioCtx.createMediaStreamSource(activeMicStream);
            micSource.connect(audioMixer);
            micSourceRef.current = micSource;
          }

          if (videoStreamRef.current && videoStreamRef.current.getAudioTracks().length > 0) {
            const screenAudioSource = inputAudioCtx.createMediaStreamSource(videoStreamRef.current);
            screenAudioSource.connect(audioMixer);
            screenSourceRef.current = screenAudioSource;
          }

          const analyser = inputAudioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.8;
          audioMixer.connect(analyser);
          analyserRef.current = analyser;

          const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          
          audioMixer.connect(processor);
          
          const dummyGain = inputAudioCtx.createGain();
          dummyGain.gain.value = 0;
          processor.connect(dummyGain);
          dummyGain.connect(inputAudioCtx.destination);
          
          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const channelData = e.inputBuffer.getChannelData(0);

              // 1. Calculate the real-time speaker playback energy (RMS) from output processor outputAnalyser
              let speakerRms = 0;
              if (outputAnalyserRef.current && outputCtxRef.current && outputCtxRef.current.state === 'running') {
                const bufferLength = outputAnalyserRef.current.fftSize;
                const dataArray = new Float32Array(bufferLength);
                outputAnalyserRef.current.getFloatTimeDomainData(dataArray);
                
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                  sum += dataArray[i] * dataArray[i];
                }
                speakerRms = Math.sqrt(sum / bufferLength);
              }

              // Update a running smoothed amplitude and a playout hangover (trailing decay window)
              if (speakerRms > 0.004) {
                smoothedSpeakerRmsRef.current = Math.max(smoothedSpeakerRmsRef.current * 0.5 + speakerRms * 0.5, speakerRms);
                speakerPlayHangoverRef.current = 2; // Hold hangover (~512ms safety buffer)
              } else {
                if (speakerPlayHangoverRef.current > 0) {
                  speakerPlayHangoverRef.current--;
                  smoothedSpeakerRmsRef.current *= 0.75;
                } else {
                  smoothedSpeakerRmsRef.current = 0;
                }
              }

              const isSpeakerActive = speakerPlayHangoverRef.current > 0 || speakerRms > 0.004;

              // 2. Calculate microphone input RMS
              let micSum = 0;
              for (let i = 0; i < channelData.length; i++) {
                micSum += channelData[i] * channelData[i];
              }
              const micRms = Math.sqrt(micSum / channelData.length);

              // 3. Separate/suppress speaker loop feedback from the captured microphone stream (Acoustic Echo Suppression)
              let isEchoSuppressed = false;
              if (isSpeakerActive) {
                // Adaptive separation threshold based on estimated acoustic coupling factor.
                // Typical device speaker-to-mic feedback leak is roughly 25%-40% of standard output.
                const suppressionThreshold = (smoothedSpeakerRmsRef.current * 0.42) + 0.015;
                
                if (micRms < suppressionThreshold) {
                  isEchoSuppressed = true;
                  // Soft suppression: Attenuate loop leak while preserving some ambient context for model grounding
                  for (let i = 0; i < channelData.length; i++) {
                    channelData[i] *= 0.045; // ~27dB suppression (enough to prevent echo feedback loop while being more robust)
                  }
                } else {
                  // User vocal override (Double-talk / Interruption)
                  console.log(`[Acoustic Separator] User Interruption Detected! Mic RMS: ${micRms.toFixed(3)} > Threshold: ${suppressionThreshold.toFixed(3)}`);
                }
              }

              const base64 = pcmToBase64(channelData);
              ws.send(JSON.stringify({ audio: base64 }));

              // Simple voice activity detection for improved perceived feedback speed
              if (!isMuted && !isEchoSuppressed) {
                let hasActiveVocalSpeech = false;
                for (let i = 0; i < channelData.length; i++) {
                  if (Math.abs(channelData[i]) > 0.015) {
                    hasActiveVocalSpeech = true;
                    break;
                  }
                }
                if (hasActiveVocalSpeech) {
                  triggerTranslating();
                }
              }

              // Client-side robust pitch & gender tracking fallback
              try {
                const pitch = detectPitch(channelData, 16000);
                if (pitch > 0) {
                  recentPitchesRef.current.push(pitch);
                  if (recentPitchesRef.current.length > 25) {
                    recentPitchesRef.current.shift();
                  }

                  if (recentPitchesRef.current.length >= 8) {
                    const validPitches = recentPitchesRef.current.filter(p => p >= 70 && p <= 320);
                    if (validPitches.length >= 6) {
                      const sorted = [...validPitches].sort((a, b) => a - b);
                      const median = sorted[Math.floor(sorted.length / 2)];

                      let detected: 'male' | 'female' | null = null;
                      if (median < 145) {
                        detected = 'male';
                      } else if (median > 165) {
                        detected = 'female';
                      }

                      if (detected && detected !== clientDetectedGenderRef.current) {
                        clientDetectedGenderRef.current = detected;
                        console.log(`[Client Pitch Tracker] Detected voice pitch (median: ${median.toFixed(1)}Hz) => switching interpreter voice to ${detected.toUpperCase()}`);
                        ws.send(JSON.stringify({
                          type: 'detected_gender',
                          gender: detected
                        }));
                      }
                    }
                  }
                }
              } catch (err) {
                console.error("Client side pitch tracking error:", err);
              }
            }
          };

          if (videoElementRef.current && videoStreamRef.current) {
            videoElementRef.current.srcObject = videoStreamRef.current;
            videoElementRef.current.muted = true;
            videoElementRef.current.play();
          }

          setIsConnected(true);
        } catch (err: any) {
          setError(err.message || 'Failed to access mic/camera');
          ws.close();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.audio) {
            setIsTranslating(false);
            if (translatingTimeoutRef.current) {
              clearTimeout(translatingTimeoutRef.current);
            }
          }

          if (msg.audio && outputCtxRef.current) {
            const outputCtx = outputCtxRef.current;
            if (outputCtx.state === 'suspended') {
              outputCtx.resume().catch(e => console.warn('Could not resume audio context:', e));
            }
            const float32Data = base64ToPcm(msg.audio);
            const buffer = outputCtx.createBuffer(1, float32Data.length, 24000);
            buffer.getChannelData(0).set(float32Data);
            
            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            if (outputAnalyserRef.current) {
              source.connect(outputAnalyserRef.current);
            } else {
              source.connect(outputCtx.destination);
            }
            
            let startTime = nextStartTimeRef.current;
            if (startTime < outputCtx.currentTime) {
              startTime = outputCtx.currentTime;
            }
            
            // Track playing audio source for interruption support
            activeSourcesRef.current.add(source);
            source.onended = () => {
              activeSourcesRef.current.delete(source);
            };

            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
          }
          
          if (msg.text) {
            const now = new Date();
            let textValue = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
            
            const isUser = msg.speaker === 'User' || msg.speaker === 'en';
            if (isUser) {
              triggerTranslating();
            } else if (msg.speaker === 'Agent' || msg.speaker === 'Model') {
              setIsTranslating(false);
              if (translatingTimeoutRef.current) {
                clearTimeout(translatingTimeoutRef.current);
              }
            }

            setTranscripts(prev => [...prev, {
              id: Math.random().toString(),
              speaker: msg.speaker || 'Speaker',
              text: textValue,
              time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              timestamp: now.getTime()
            }]);
          }

          if (msg.autoDetectedGender) {
            const now = new Date();
            const textValue = `🎙️ Matches translation prebuilt voice to detected speaker: ${msg.autoDetectedGender === 'male' ? 'Zephyr (Male)' : 'Kore (Female)'}`;
            setTranscripts(prev => [...prev, {
              id: Math.random().toString(),
              speaker: 'System',
              text: textValue,
              time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              timestamp: now.getTime()
            }]);
          }

          if (msg.interrupted) {
            nextStartTimeRef.current = outputCtxRef.current?.currentTime || 0;
            // Instantly stop and discard all currently playing and scheduled sources to avoid voice overlaps
            activeSourcesRef.current.forEach(src => {
              try {
                src.stop();
              } catch (err) {}
            });
            activeSourcesRef.current.clear();
          }
        } catch (e) {
          console.error("Error receiving ws message", e);
        }
      };

      ws.onerror = () => {
        const isVercelHost = window.location.hostname.includes('vercel.app');
        if (isVercelHost) {
          setError(
            "WebSocket connection failed. Vercel's serverless system does not support active WebSocket connections. " +
            "Please configure your persistent Backend WebSocket URL under Settings in the sidebar."
          );
        } else {
          setError("WebSocket connection failed. Please ensure your backend server is running and supports WebSockets.");
        }
      };
      ws.onclose = () => disconnect();
      
    } catch (err: any) {
      setError(err.message || 'Could not connect');
    }
  }, []);

  const disconnect = useCallback(() => {
    recentPitchesRef.current = [];
    clientDetectedGenderRef.current = null;
    
    if (translatingTimeoutRef.current) {
      clearTimeout(translatingTimeoutRef.current);
      translatingTimeoutRef.current = null;
    }
    setIsTranslating(false);
    
    // Stop and clear all active playing audio outputs
    activeSourcesRef.current.forEach(src => {
      try {
        src.stop();
      } catch (err) {}
    });
    activeSourcesRef.current.clear();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (screenSourceRef.current) {
      screenSourceRef.current.disconnect();
      screenSourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = null;
      }
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    outputAnalyserRef.current = null;
    smoothedSpeakerRmsRef.current = 0;
    speakerPlayHangoverRef.current = 0;
    setIsMuted(false);
    setIsConnected(false);
  }, []);

  // Set up video frame capture interval
  useEffect(() => {
    let intervalId: any;
    if (isConnected) {
      // Stream frames at 1 fps
      intervalId = setInterval(() => {
        captureVideoFrame();
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isConnected, captureVideoFrame]);

  const updateTargetLanguage = useCallback((targetLanguageCode: string, targetLanguageName?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_config',
        targetLanguageCode,
        targetLanguageName
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    isConnected,
    isMuted,
    toggleMute,
    error,
    setError,
    connect,
    disconnect,
    updateTargetLanguage,
    videoElementRef,
    analyserRef,
    transcripts,
    setTranscripts,
    isTranslating
  };
}
