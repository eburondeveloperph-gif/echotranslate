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
      let currentTargetLang = url.searchParams.get("targetLanguageCode") || "es";
      let currentTargetLangName = url.searchParams.get("targetLanguageName") || currentTargetLang;
      const sourceLang = url.searchParams.get("sourceLanguageCode") || "";
      const sourceLangName = url.searchParams.get("sourceLanguageName") || "";
      const topics = url.searchParams.get("topics") || "";
      const echoTargetParam = url.searchParams.get("echoTargetLanguage");
      const echoTarget = echoTargetParam !== null ? echoTargetParam === "true" : true;
      const voiceGender = url.searchParams.get("voiceGender") || "female";
      
      // Match the correct prebuilt voice based on the selected gender
      let currentVoiceName = voiceGender === "male" ? "Zephyr" : "Kore";

      let currentSession: any = null;
      let isReconnectingGemini = false;

      async function establishGeminiSession() {
        if (isReconnectingGemini) return;
        isReconnectingGemini = true;

        try {
          let baseTargetLang = currentTargetLang;
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

          const tools = voiceGender === "auto" ? [
            {
              functionDeclarations: [
                {
                  name: "detectSpeakerGender",
                  description: "Call this immediately when you hear the voice of the primary source speaker (the human user speaking the input audio) and determine their gender (whether they sound male or female based on audio pitch, vocal tone, or style). This matches the translation voice gender with the source speaker gender dynamically.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      gender: {
                        type: "STRING",
                        enum: ["male", "female"],
                        description: "The auto-detected gender, either 'male' or 'female'."
                      }
                    },
                    required: ["gender"]
                  }
                }
              ]
            }
          ] : undefined;

          let aiInstructionsText = "";
          const baseDirectives = (langDetails: string, voiceDetails: string) => `You are an elite, hyper-accurate real-time interpreter. You must translate${langDetails} into a highly idiomatic target language.
CRITICAL PREMISES FOR PROSODY, EXACT VOICE MIMICRY, STRICT SENTENCE-BY-SENTENCE DISPATCH, AND NON-LITERAL TRANSLATION:
1. TRANSLATE PER FULL SENTENCE OR COHERENT PHRASE: Real-time translation must be delivered as complete, coherent sentences or logical semantic clauses. Wait for a natural break or completion of a coherent clause of input before uttering the translated speech. Never translate word-for-word or in small fragments of 2-3 words. Deliver the translation of each complete sentence as a single, continuous, fluent, and completely uninterrupted stream of speech.
2. IDIOMATIC AND NON-LITERAL TRANSLATION: Under no circumstances perform direct literal translations. Capture the natural meaning, cultural nuances, and precise context of the full sentence, and then render it cleanly through fluent, beautiful phrasing in the target language.
3. VOICE MIMICRY & TONAL MATCHING: Replicate the speaker's voice qualities in your output. Match the speaker's exact emotional state, vocal pitch range, tone, whisper, volume, laugh, sigh, urgency, excitement, sadness, and hesitation. If they speak with custom stress/inflection on certain words, apply corresponding stress on those words in the translation.
4. NATURAL TEMPO & PROSODY: Mimic the pacing, conversational pauses, and speech delivery speed of the speaker perfectly. If they whisper, you MUST whisper. If they speak rapidly with high enthusiasm, you MUST speak rapidly with high enthusiasm. Do not use a generic, robotic, or monotonous tone.
5. SYNCHRONIZATION & COMPLETENESS: Seamlessly synchronize the delivery speed with the raw input. Under no circumstances should you cut off mid-sentence or fail to complete a translated turn.
${voiceDetails}`;

          if (voiceGender === "auto") {
            const autoVoiceMatchingLine = "5. AUTOMATIC VOICE GENDER MATCHING: You have access to the detectSpeakerGender tool. You MUST call the \"detectSpeakerGender\" function immediately as soon as you identify the speaker's gender (male or female) from the source audio. This will dynamically update your translation voice to match the gender of the speaker seamlessly.";
            aiInstructionsText = sourceLang 
              ? baseDirectives(` from ${sourceLangName} (${sourceLang}) to ${currentTargetLangName} (${currentTargetLang})`, autoVoiceMatchingLine)
              : baseDirectives(` all audio/video input to ${currentTargetLangName} (${currentTargetLang})`, autoVoiceMatchingLine);
          } else {
            const fixedVoiceLine = `5. VOICE GENDER MATCHING: Use a matching ${voiceGender} voice ("${currentVoiceName}") as your output voice. Deliver an output that sounds exactly as if the original speaker was a fluent, native speaker.`;
            aiInstructionsText = sourceLang 
              ? baseDirectives(` from ${sourceLangName} (${sourceLang}) to ${currentTargetLangName} (${currentTargetLang})`, fixedVoiceLine)
              : baseDirectives(` all audio/video input to ${currentTargetLangName} (${currentTargetLang})`, fixedVoiceLine);
          }

          if (topics) {
             aiInstructionsText += `\nAdditional Context/Topics:\n${topics}`;
          }

          console.log(`[establishGeminiSession] Connecting with Voice: ${currentVoiceName}, TargetLanguage: ${currentTargetLangName} (${currentTargetLang})`);

          const session = await ai.live.connect({
            model: "gemini-3.5-live-translate-preview",
            config: {
              responseModalities: ["AUDIO" as any, "TEXT" as any],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: currentVoiceName
                  }
                }
              },
              systemInstruction: {
                role: "system",
                parts: [{ text: aiInstructionsText }]
              },
              tools: tools as any,
              translationConfig: translationConfig,
              outputAudioTranscription: {},
              inputAudioTranscription: {}
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                try {
                  const msgAny = message as any;

                  // Handle function / tool calling
                  if (msgAny.toolCall) {
                    const functionCalls = msgAny.toolCall.functionCalls;
                    if (functionCalls && functionCalls.length > 0) {
                      for (const call of functionCalls) {
                        if (call.name === "detectSpeakerGender") {
                          const detected = call.args?.gender || "female";
                          console.log(`[Gender Detector] Model detected source speaker as: ${detected}`);
                          
                          // Respond to the tool call so model transaction can finalize smoothly
                          if (currentSession === session) {
                            session.sendToolResponse({
                              functionResponses: [
                                {
                                  response: { output: { success: true, genderMatched: detected } },
                                  id: call.id,
                                  name: "detectSpeakerGender"
                                }
                              ]
                            });
                          }

                          // Update output voice
                          const targetVoiceName = detected === "male" ? "Zephyr" : "Kore";
                          if (targetVoiceName !== currentVoiceName) {
                            currentVoiceName = targetVoiceName;
                            console.log(`[Gender Detector] Dynamically voiceName target => ${targetVoiceName}`);
                            if (currentSession === session) {
                              establishGeminiSession();
                            }
                          }
                        }
                      }
                    }
                  }

                  if (msgAny.serverContent && msgAny.serverContent.modelTurn) {
                    for (const part of msgAny.serverContent.modelTurn.parts) {
                      if (part.functionCall && part.functionCall.name === "detectSpeakerGender") {
                        const call = part.functionCall;
                        const detected = call.args?.gender || "female";
                        console.log(`[Gender Detector] Dynamic part detected speaker: ${detected}`);
                        
                        if (currentSession === session) {
                          session.sendToolResponse({
                            functionResponses: [
                              {
                                response: { output: { success: true, genderMatched: detected } },
                                id: call.id,
                                name: "detectSpeakerGender"
                              }
                            ]
                          });
                        }

                        const targetVoiceName = detected === "male" ? "Zephyr" : "Kore";
                        if (targetVoiceName !== currentVoiceName) {
                          currentVoiceName = targetVoiceName;
                          console.log(`[Gender Detector] Dynamic voiceName update during turn => ${targetVoiceName}`);
                          if (currentSession === session) {
                            establishGeminiSession();
                          }
                        }
                      }

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
              },
              onerror: (e) => {
                console.error("[Gemini Connection Error]", e);
                if (currentSession === session && clientWs.readyState === WebSocket.OPEN) {
                  console.log("[Server] Gemini session error. Triggering auto-recovery...");
                  setTimeout(() => {
                    if (currentSession === session && clientWs.readyState === WebSocket.OPEN) {
                      establishGeminiSession();
                    }
                  }, 1200);
                }
              },
              onclose: (e) => {
                console.log("[Gemini Connection Closed] Code:", e.code, "Reason:", e.reason);
                if (currentSession === session && clientWs.readyState === WebSocket.OPEN) {
                  console.log("[Server] Gemini session closed unexpectedly. Re-establishing connection for continuous translation...");
                  establishGeminiSession();
                }
              }
            }
          });

          // Swap active sessions cleanly
          const oldSession = currentSession;
          currentSession = session;

          if (oldSession) {
            console.log("[Server] Swapping active translation session successfully.");
            try {
              oldSession.close();
            } catch (err) {
              console.error("Error closing swapped out session:", err);
            }
          }
        } catch (err) {
          console.error("Failed to connect to Gemini live session:", err);
          clientWs.send(JSON.stringify({ text: "⚠️ Direct link to translator voice was interrupted. Attempting self-healing recovery...", speaker: "System" }));
        } finally {
          isReconnectingGemini = false;
        }
      }

      // Initial connection
      await establishGeminiSession();

      clientWs.on("message", async (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          
          if (parsed.type === "detected_gender") {
            if (voiceGender === "auto") {
              const detected = parsed.gender;
              const targetVoiceName = detected === "male" ? "Zephyr" : "Kore";
              if (targetVoiceName !== currentVoiceName) {
                currentVoiceName = targetVoiceName;
                console.log(`[Gender Detector - Client Driven] Rebuilding session for voice: ${targetVoiceName}`);
                await establishGeminiSession();
                clientWs.send(JSON.stringify({ autoDetectedGender: detected }));
              }
            }
            return;
          }
          
          if (parsed.type === "update_config") {
            const newTargetLang = parsed.targetLanguageCode;
            const newTargetLangName = parsed.targetLanguageName || newTargetLang;
            
            currentTargetLang = newTargetLang;
            currentTargetLangName = newTargetLangName;
            
            console.log(`[Config Updater] Target language updated mid-stream => ${currentTargetLangName} (${currentTargetLang})`);
            await establishGeminiSession();
            return;
          }

          // Forward direct media payload only to the active live session
          if (currentSession && !isReconnectingGemini) {
            if (parsed.audio) {
              currentSession.sendRealtimeInput({
                media: {
                  data: parsed.audio,
                  mimeType: "audio/pcm;rate=16000"
                }
              });
            } else if (parsed.video) {
              currentSession.sendRealtimeInput({
                video: {
                  data: parsed.video,
                  mimeType: "image/jpeg"
                }
              });
            }
          }
        } catch (e) {
          console.error("Error sending input to live session", e);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected - closing current active Gemini live session...");
        try {
          if (currentSession) {
            currentSession.close();
          }
        } catch (err) {
          console.error("Error closing Gemini live session:", err);
        }
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
