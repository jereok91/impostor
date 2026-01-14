"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Player = { id: string; nickname: string; score?: number; isHost?: boolean; role?: string };

type GameConfig = {
  totalRounds: number;
  impostorsCount: number;
  showHintToImpostor: boolean;
};

type GameInfo = { 
  gameId?: string; 
  code?: string; 
  phase?: string; 
  round?: number; 
  totalRounds?: number;
  config?: GameConfig;
  showHintToImpostor?: boolean;
  createdAt?: string; // ISO date string
  timeoutDuration?: number; // en milisegundos
};

type CardData = {
  isImpostor: boolean;
  secretWord?: string;
  category?: string;
  currentRound?: number;
  totalRounds?: number;
} | null;

type Clue = {
  playerId: string;
  nickname?: string;
  from?: string;
  text: string;
};

type RoundResult = {
  round: number;
  totalRounds: number;
  isTie: boolean;
  eliminatedId: string | null;
  eliminatedName: string | null;
  wasImpostor: boolean;
  gameEnds: boolean;
  winner: 'FRIENDS' | 'IMPOSTOR' | null;
  voteTallies: Record<string, number>;
};

type PlayerResult = {
  playerId: string;
  nickname: string;
  role: 'IMPOSTOR' | 'FRIEND';
  wasEliminated: boolean;
  totalScore: number;
  matchPoints: number;
  breakdown: Array<{ round: number; reason: string; points: number; description: string }>;
};

type GameOverResult = {
  winner: 'FRIENDS' | 'IMPOSTOR';
  winnerMessage: string;
  secretWord: string;
  impostors: string[];
  totalRounds: number;
  roundsPlayed: number;
  players: PlayerResult[];
  gameHistory: Array<{ round: number; eliminatedId: string | null; eliminatedName: string | null; wasImpostor: boolean; isTie: boolean }>;
};

type SessionData = {
  playerId: string;
  gameId: string;
  code: string;
  nickname: string;
};

type GameState = {
  players: Player[];
  gameInfo: GameInfo;
  myPlayerId: string | null;
  myNickname: string | null;
  myCard: CardData;
  clues: Clue[];
  roundResult: RoundResult | null;
  gameOverResult: GameOverResult | null;
  _hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setPlayers: (p: Player[] | ((prev: Player[]) => Player[])) => void;
  setGameInfo: (up: Partial<GameInfo> | ((prev: GameInfo) => GameInfo)) => void;
  setMyPlayerId: (id: string) => void;
  setMyNickname: (nickname: string) => void;
  setMyCard: (card: CardData) => void;
  setClues: (clues: Clue[] | ((prev: Clue[]) => Clue[])) => void;
  addClue: (clue: Clue) => void;
  setRoundResult: (result: RoundResult | null) => void;
  setGameOverResult: (result: GameOverResult | null) => void;
  getSession: () => SessionData | null;
  clearSession: () => void;
};

const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      players: [],
      gameInfo: { phase: "WAITING", round: 0 },
      myPlayerId: null,
      myNickname: null,
      myCard: null,
      clues: [],
      roundResult: null,
      gameOverResult: null,
      _hasHydrated: false,
      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),
      setPlayers: (p: Player[] | ((prev: Player[]) => Player[])) =>
        set((s: GameState) => ({ players: typeof p === "function" ? p(s.players) : p })),
      setGameInfo: (up: Partial<GameInfo> | ((prev: GameInfo) => GameInfo)) =>
        set((s: GameState) => ({ gameInfo: typeof up === "function" ? up(s.gameInfo) : { ...s.gameInfo, ...up } })),
      setMyPlayerId: (id: string) => set({ myPlayerId: id }),
      setMyNickname: (nickname: string) => set({ myNickname: nickname }),
      setMyCard: (card: CardData) => set({ myCard: card }),
      setClues: (clues: Clue[] | ((prev: Clue[]) => Clue[])) =>
        set((s: GameState) => ({ clues: typeof clues === "function" ? clues(s.clues) : clues })),
      addClue: (clue: Clue) => set((s: GameState) => ({ clues: [...s.clues, clue] })),
      setRoundResult: (result: RoundResult | null) => set({ roundResult: result }),
      setGameOverResult: (result: GameOverResult | null) => set({ gameOverResult: result }),
      getSession: () => {
        const state = get();
        if (state.myPlayerId && state.gameInfo.gameId && state.gameInfo.code && state.myNickname) {
          return {
            playerId: state.myPlayerId,
            gameId: state.gameInfo.gameId,
            code: state.gameInfo.code,
            nickname: state.myNickname,
          };
        }
        return null;
      },
      clearSession: () => set({ 
        myPlayerId: null, 
        myNickname: null, 
        gameInfo: { phase: "WAITING", round: 0 }, 
        players: [],
        myCard: null,
        clues: [],
        roundResult: null,
        gameOverResult: null
      }),
    }),
    {
      name: "impostor-session",
      partialize: (state) => ({
        myPlayerId: state.myPlayerId,
        myNickname: state.myNickname,
        gameInfo: state.gameInfo,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("Error rehydrating state:", error);
          if (typeof window !== "undefined") {
            localStorage.removeItem("impostor-session");
          }
        }
        // Marcar como hidratado
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

export default useGameStore;
