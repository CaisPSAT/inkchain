export type PromptMode = "random" | "custom";
export type RoomPhase = "lobby" | "prompt-entry" | "word-reveal" | "countdown" | "playing" | "review";
export type PageType = "prompt" | "drawing" | "guess";
export interface Point { x: number; y: number }
export interface Stroke { color: string; width: number; points: Point[] }
export interface GameSettings { timerEnabled: boolean; timerSeconds: number; multicolor: boolean; promptMode: PromptMode; hostPlaying: boolean; randomPassing: boolean }
export interface Player { id: string; name: string; connected: boolean; isHost: boolean; isCoHost: boolean; joinedAt: number }
export interface BookletPage { index: number; type: PageType; authorName: string; text?: string; strokes?: Stroke[]; blank?: boolean }
export interface Booklet { id: string; ownerName: string; pages: BookletPage[] }
export interface PlayerTask { kind: "prompt-entry" | "word-reveal" | "drawing" | "guess" | "waiting" | "spectating"; bookletId?: string; hiddenWord?: string; instructionText?: string; instructionAuthorName?: string; previousDrawing?: Stroke[]; previousAuthorName?: string; submitted?: boolean }
export interface Room {
  code: string;
  players: Player[];
  settings: GameSettings;
  phase: RoomPhase;
  countdownEndsAt?: number;
  roundNumber: number;
  round?: {
    participantNames: string[];
    turnIndex: number;
    totalTurns: number;
    turnType: "drawing" | "guess";
    turnEndsAt?: number;
    submittedNames: string[];
    reviewedBookletIds: string[];
    reviewBookletId?: string;
    reviewPageIndex: number;
    booklets?: Booklet[];
  };
  task: PlayerTask;
}
