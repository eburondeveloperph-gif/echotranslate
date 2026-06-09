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
      const voiceGender = url.searchParams.get("voiceGender") || "female";
      
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

      // Match the correct prebuilt voice based on the selected gender
      let currentVoiceName = voiceGender === "male" ? "Zephyr" : "Kore";

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
      if (voiceGender === "auto") {
        aiInstructionsText = sourceLang 
          ? `You are an elite, hyper-accurate real-time interpreter. Translate from ${sourceLangName} (${sourceLang}) to highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. AUTOMATIC VOICE GENDER MATCHING: You have access to the detectSpeakerGender tool. You MUST call the "detectSpeakerGender" function immediately as soon as you identify the speaker's gender (male or female) from the source audio. This will dynamically update your translation voice to match the gender of the speaker seamlessly. Continue translating normally after invoking it.`
          : `You are an elite, hyper-accurate real-time interpreter. Translate all audio/video input into highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. AUTOMATIC VOICE GENDER MATCHING: You have access to the detectSpeakerGender tool. You MUST call the "detectSpeakerGender" function immediately as soon as you identify the speaker's gender (male or female) from the source audio. This will dynamically update your translation voice to match the gender of the speaker seamlessly. Continue translating normally after invoking it.`;
      } else {
        aiInstructionsText = sourceLang 
          ? `You are an elite, hyper-accurate real-time interpreter. Translate from ${sourceLangName} (${sourceLang}) to highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. VOICE GENDER MATCHING: Use a matching ${voiceGender} voice ("${currentVoiceName}") as your output voice.\nDeliver an output that sounds exactly as if the original speaker was a fluent, native ${targetLangName} speaker.`
          : `You are an elite, hyper-accurate real-time interpreter. Translate all audio/video input into highly idiomatic ${targetLangName} (${targetLang}).\nCore directives:\n1. NATIVITY & IDIOMS: Do not translate word-by-word. Extract the core meaning and express it using the most natural, native phrasing, idioms, and grammatical structures characteristic of ${targetLangName}.\n2. PROSODY & EXPRESSION: Flawlessly mimic the speaker's nuance, tone, rhythm, speed, pacing, and emotion. Maintain exact emotional resonance. For example, if the speaker speaks quickly, slowly, emotionally, excitedly, sadly, angrily, or whispers, capture and reproduce that exact style, speed, mood, and delivery in your translated audio output.\n3. CLARITY & ACCURACY: Ensure maximum clarity and absolute semantic accuracy. Prioritize coherent, fully formed thoughts over literal fragments, even if you remain 3 to 4 seconds behind to capture full context.\n4. SYNCHRONIZATION: Seamlessly sync your speaking speed with the source audio.\n5. COMPLETENESS: Always finish your translations completely. Do not cut off mid-sentence or overrun conversational turns. Wait for logical breaks before completing your thought.\n6. VOICE GENDER MATCHING: Use a matching ${voiceGender} voice ("${currentVoiceName}") as your output voice.\nDeliver an output that sounds exactly as if the original speaker was a fluent, native ${targetLangName} speaker.`;
      }

      if (topics) {
         aiInstructionsText += `\nAdditional Context/Topics:\n${topics}`;
      }

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
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            response: { output: { success: true, genderMatched: detected } },
                            id: call.id,
                            name: "detectSpeakerGender"
                          }
                        ]
                      });

                      // Update output voice
                      const targetVoiceName = detected === "male" ? "Zephyr" : "Kore";
                      if (targetVoiceName !== currentVoiceName) {
                        currentVoiceName = targetVoiceName;
                        console.log(`[Gender Detector] Dynamically update voiceName to: ${targetVoiceName}`);

                        // Send dynamic session update
                        (session as any).conn.send(JSON.stringify({
                          setup: {
                            model: "gemini-3.5-live-translate-preview",
                            config: {
                              speechConfig: {
                                voiceConfig: {
                                  prebuiltVoiceConfig: {
                                    voiceName: targetVoiceName
                                  }
                                }
                              }
                            }
                          }
                        }));

                        // Notify client to show nice auto-detected toast or text element
                        clientWs.send(JSON.stringify({ autoDetectedGender: detected }));
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
                    console.log(`[Gender Detector] Dynamic part detected speaker as: ${detected}`);
                    
                    session.sendToolResponse({
                      functionResponses: [
                        {
                          response: { output: { success: true, genderMatched: detected } },
                          id: call.id,
                          name: "detectSpeakerGender"
                        }
                      ]
                    });

                    const targetVoiceName = detected === "male" ? "Zephyr" : "Kore";
                    if (targetVoiceName !== currentVoiceName) {
                      currentVoiceName = targetVoiceName;
                      console.log(`[Gender Detector] Dynamic update voiceName inside parts to: ${targetVoiceName}`);

                      (session as any).conn.send(JSON.stringify({
                        setup: {
                          model: "gemini-3.5-live-translate-preview",
                          config: {
                            speechConfig: {
                              voiceConfig: {
                                prebuiltVoiceConfig: {
                                  voiceName: targetVoiceName
                                }
                              }
                            }
                          }
                        }
                      }));

                      clientWs.send(JSON.stringify({ autoDetectedGender: detected }));
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
