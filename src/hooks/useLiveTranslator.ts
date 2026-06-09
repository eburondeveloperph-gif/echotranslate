import { useState, useRef, useCallback, useEffect } from 'react';
import { pcmToBase64, base64ToPcm } from '../lib/audio';

export type VideoMode = 'camera' | 'screen' | 'none';

export function useLiveTranslator() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ id: string; speaker: string; text: string; time: string; timestamp: number }>>([]);
  
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

  const connect = useCallback(async (targetLanguageCode: string, mode: VideoMode, targetLanguageName?: string, sourceLanguageCode?: string, sourceLanguageName?: string, topics?: string) => {
    try {
      setError(null);
      
      const wsUrl = new URL('/live', window.location.href);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
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
      
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      const inputAudioCtx = new window.AudioContext({ sampleRate: 16000 });
      const outputAudioCtx = new window.AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputAudioCtx;
      outputCtxRef.current = outputAudioCtx;

      // Ensure contexts are running
      if (inputAudioCtx.state === 'suspended') await inputAudioCtx.resume();
      if (outputAudioCtx.state === 'suspended') await outputAudioCtx.resume();

      nextStartTimeRef.current = outputAudioCtx.currentTime;

      ws.onopen = async () => {
        try {
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
          } catch (e) {
            console.warn("Could not get microphone", e);
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
          if (micStream) {
            micStream.getAudioTracks().forEach(track => mixedAudioStream.addTrack(track));
          }

          const audioMixer = inputAudioCtx.createGain();
          
          if (micStream && micStream.getAudioTracks().length > 0) {
            const micSource = inputAudioCtx.createMediaStreamSource(micStream);
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
              const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
              ws.send(JSON.stringify({ audio: base64 }));
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
            source.connect(outputCtx.destination);
            
            let startTime = nextStartTimeRef.current;
            if (startTime < outputCtx.currentTime) {
              startTime = outputCtx.currentTime;
            }
            
            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
          }
          
          if (msg.text) {
            const now = new Date();
            let textValue = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
            setTranscripts(prev => [...prev, {
              id: Math.random().toString(),
              speaker: msg.speaker || 'Speaker',
              text: textValue,
              time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              timestamp: now.getTime()
            }]);
          }

          if (msg.interrupted) {
            nextStartTimeRef.current = outputCtxRef.current?.currentTime || 0;
            // Depending on complexity, we might want to track current nodes and stop them
          }
        } catch (e) {
          console.error("Error receiving ws message", e);
        }
      };

      ws.onerror = () => setError("WebSocket connection error");
      ws.onclose = () => disconnect();
      
    } catch (err: any) {
      setError(err.message || 'Could not connect');
    }
  }, []);

  const disconnect = useCallback(() => {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    videoElementRef,
    analyserRef,
    transcripts,
    setTranscripts
  };
}
