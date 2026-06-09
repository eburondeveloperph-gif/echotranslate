export interface TranscriptItem {
  id: string;
  speaker: string;
  text: string;
  time: string;
  timestamp: number;
}

export interface SessionHistory {
  id: string;
  userId: string;
  targetLang: string;
  sourceLang: string;
  topics?: string;
  createdAt: any; // Firestore Timestamp
  items: TranscriptItem[];
}

export interface Language {
  code: string;
  name: string;
}
