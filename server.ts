import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage } from "@google/genai";
import { createServer } from "http";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const targetLang = url.searchParams.get("targetLanguageCode") || "es";
      const targetLangName = url.searchParams.get("targetLanguageName") || targetLang;
      const sourceLang = url.searchParams.get("sourceLanguageCode") || "";
      const sourceLangName = url.searchParams.get("sourceLanguageName") || "";
      const topics = url.searchParams.get("topics") || "";
      const echoTargetParam = url.searchParams.get("echoTargetLanguage");
      const echoTarget = echoTargetParam !== null ? echoTargetParam === "true" : true;
      
      let baseTargetLang = targetLang;
      if (baseTargetLang === "nl-BE") {
        baseTargetLang = "nl";
      }

      const translationConfig: any = {
        targetLanguageCode: baseTargetLang,
        echoTargetLanguage: echoTarget
      };
      
      if (sourceLang) {
        translationConfig.sourceLanguageCode = sourceLang;
      }

      let aiInstructionsText = sourceLang 
        ? `You are an elite, hyper-accurate real-time interpreter. Translate from ${sourceLangName} (${sourceLang}) to highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. VOICE GENDER MATCHING: By default, use a female voice as the translation voice audio. However, if the source speaker is male, use a male voice for the translation.\nDeliver an output that sounds exactly as if the original speaker was a fluent, native ${targetLangName} speaker.`
        : `You are an elite, hyper-accurate real-time interpreter. Translate all audio/video input into highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. VOICE GENDER MATCHING: By default, use a female voice as the translation voice audio. However, if the source speaker is male, use a male voice for the translation.\nDeliver an output that sounds exactly as if the original speaker was a fluent, native ${targetLangName} speaker.`;

      if (topics) {
         aiInstructionsText += `\nAdditional Context/Topics:\n${topics}`;
      }

      const session = await ai.live.connect({
        model: "gemini-3.5-live-translate-preview",
        config: {
          responseModalities: ["AUDIO" as any, "TEXT" as any],
          systemInstruction: {
            role: "system",
            parts: [{ text: aiInstructionsText }]
          },
          translationConfig: translationConfig,
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            try {
              const msgAny = message as any;

              if (msgAny.serverContent && msgAny.serverContent.modelTurn) {
                for (const part of msgAny.serverContent.modelTurn.parts) {
                  if (part.inlineData?.data) {
                    clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                  } else if (part.text) {
                    clientWs.send(JSON.stringify({ text: part.text, speaker: "Model" }));
                  }
                }
              }

              if (msgAny.bidiTranslateEvents) {
                for (const ev of msgAny.bidiTranslateEvents) {
                   if (ev.sourceAudioEvent && ev.sourceAudioEvent.utterance) {
                      clientWs.send(JSON.stringify({ text: ev.sourceAudioEvent.utterance.text, speaker: ev.sourceAudioEvent.utterance.languageCode || 'User' }));
                   }
                   if (ev.targetAudioEvent && ev.targetAudioEvent.utterance) {
                      clientWs.send(JSON.stringify({ text: ev.targetAudioEvent.utterance.text, speaker: ev.targetAudioEvent.utterance.languageCode || 'Agent' }));
                   }
                }
              }

              if (msgAny.bidiTranslateEvent) {
                  const ev = msgAny.bidiTranslateEvent;
                  if (ev.sourceAudioEvent && ev.sourceAudioEvent.utterance) {
                      clientWs.send(JSON.stringify({ text: ev.sourceAudioEvent.utterance.text, speaker: ev.sourceAudioEvent.utterance.languageCode || 'User' }));
                  }
                  if (ev.targetAudioEvent && ev.targetAudioEvent.utterance) {
                      clientWs.send(JSON.stringify({ text: ev.targetAudioEvent.utterance.text, speaker: ev.targetAudioEvent.utterance.languageCode || 'Agent' }));
                  }
              }

              if (msgAny.bidiTranslateMessage) {
                  // ... just in case
              }

              // Handle general transcriptions
              if (msgAny.outputTranscription) {
                 clientWs.send(JSON.stringify({ text: msgAny.outputTranscription.text || msgAny.outputTranscription, speaker: "Agent" }));
              }
              if (msgAny.serverContent?.outputTranscription) {
                 clientWs.send(JSON.stringify({ text: msgAny.serverContent.outputTranscription.text || msgAny.serverContent.outputTranscription, speaker: "Agent" }));
              }
              
              if (msgAny.inputTranscription) {
                 clientWs.send(JSON.stringify({ text: msgAny.inputTranscription.text || msgAny.inputTranscription, speaker: "User" }));
              }
              if (msgAny.serverContent?.inputTranscription) {
                 clientWs.send(JSON.stringify({ text: msgAny.serverContent.inputTranscription.text || msgAny.serverContent.inputTranscription, speaker: "User" }));
              }
              
              if (msgAny.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
            } catch (e) {
              console.error("Error processing message", e);
            }
          }
        }
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              media: {
                data: parsed.audio,
                mimeType: "audio/pcm;rate=16000"
              }
            });
          } else if (parsed.video) {
            session.sendRealtimeInput({
              video: {
                data: parsed.video,
                mimeType: "image/jpeg"
              }
            });
          }
        } catch (e) {
          console.error("Error sending to session", e);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected");
      });

    } catch (e) {
      console.error("Error creating session", e);
      clientWs.close();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
