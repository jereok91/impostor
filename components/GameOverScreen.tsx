"use client";

import React, { useState, useEffect } from "react";

interface PlayerResult {
  playerId: string;
  nickname: string;
  role: "IMPOSTOR" | "FRIEND";
  wasEliminated: boolean;
  totalScore: number;
  matchPoints: number;
  breakdown: Array<{ round: number; reason: string; points: number; description: string }>;
}

interface GameOverProps {
  isOpen: boolean;
  result: {
    winner: "FRIENDS" | "IMPOSTOR";
    winnerMessage: string;
    secretWord: string;
    impostors: string[];
    totalRounds: number;
    roundsPlayed: number;
    players: PlayerResult[];
    gameHistory: Array<{
      round: number;
      eliminatedId: string | null;
      eliminatedName: string | null;
      wasImpostor: boolean;
      isTie: boolean;
    }>;
  } | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

export default function GameOverScreen({ isOpen, result, onPlayAgain, onExit }: GameOverProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showScores, setShowScores] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Animar entrada de puntuaciones
      setTimeout(() => setShowScores(true), 500);
    } else {
      setShowScores(false);
    }
  }, [isOpen]);

  if (!isOpen || !result) return null;

  const isFriendsWin = result.winner === "FRIENDS";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop - fixed para que no se mueva con el scroll */}
      <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-lg" />

      {/* Contenedor scrollable con centrado flexible */}
      <div className="min-h-screen flex items-start justify-center py-10 px-4">
        {/* Contenido */}
        <div className="relative w-full max-w-2xl">
          {/* Header con resultado */}
          <div className={`
            text-center p-8 rounded-t-2xl border-t border-x
            ${isFriendsWin 
              ? "bg-gradient-to-b from-emerald-900/60 to-slate-900 border-emerald-500/30" 
              : "bg-gradient-to-b from-rose-900/60 to-slate-900 border-rose-500/30"
            }
          `}>
            <div className="text-6xl mb-4">
              {isFriendsWin ? "🎉" : "😈"}
            </div>
            <h1 className={`text-4xl font-bold mb-2 ${
              isFriendsWin ? "text-emerald-400" : "text-rose-400"
            }`}>
              {isFriendsWin ? "¡VICTORIA DE LOS AMIGOS!" : "¡VICTORIA DEL IMPOSTOR!"}
            </h1>
            <p className="text-slate-400 text-lg">
              {result.winnerMessage}
            </p>
            
            {/* Palabra secreta */}
            <div className="mt-6 inline-block px-6 py-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <span className="text-slate-500 text-sm">La palabra secreta era:</span>
              <div className="text-2xl font-bold text-violet-400">{result.secretWord}</div>
            </div>
          </div>

          {/* Tabla de puntuaciones */}
          <div className="bg-slate-900 border-x border-slate-800 p-6">
            <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
              <span>🏆</span> Puntuaciones
            </h2>
            
            <div className="space-y-2">
              {result.players.map((player, index) => (
                <div
                  key={player.playerId}
                  className={`
                    rounded-xl border transition-all duration-200 overflow-hidden
                    ${selectedPlayer === player.playerId 
                      ? "border-violet-500/50 bg-violet-950/30" 
                      : "border-slate-800 bg-slate-800/50 hover:border-slate-700"
                    }
                  `}
                >
                  {/* Fila principal */}
                  <button
                    onClick={() => setSelectedPlayer(
                      selectedPlayer === player.playerId ? null : player.playerId
                    )}
                    className="w-full p-4 flex items-center gap-4 text-left"
                  >
                    {/* Posición */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${index === 0 ? "bg-yellow-500 text-yellow-900" : 
                        index === 1 ? "bg-slate-400 text-slate-900" : 
                        index === 2 ? "bg-amber-700 text-amber-100" : 
                        "bg-slate-700 text-slate-400"}
                    `}>
                      {index + 1}
                    </div>

                    {/* Info del jugador */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200 truncate">
                          {player.nickname}
                        </span>
                        {/* Badge de rol */}
                        <span className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${player.role === "IMPOSTOR" 
                            ? "bg-rose-900/50 text-rose-400 border border-rose-500/30" 
                            : "bg-sky-900/50 text-sky-400 border border-sky-500/30"
                          }
                        `}>
                          {player.role === "IMPOSTOR" ? "🕵️ Impostor" : "👤 Amigo"}
                        </span>
                        {player.wasEliminated && (
                          <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400">
                            Eliminado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Puntos */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-violet-400">
                        +{player.matchPoints}
                      </div>
                      <div className="text-xs text-slate-500">
                        Total: {player.totalScore} pts
                      </div>
                    </div>

                    {/* Flecha */}
                    <svg 
                      className={`w-5 h-5 text-slate-500 transition-transform ${
                        selectedPlayer === player.playerId ? "rotate-180" : ""
                      }`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Desglose expandible */}
                  {selectedPlayer === player.playerId && player.breakdown.length > 0 && (
                    <div className="px-4 pb-4 pt-0 border-t border-slate-700/50">
                      <div className="text-xs text-slate-500 mb-2 mt-3">Desglose de puntos:</div>
                      <div className="space-y-1">
                        {player.breakdown.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm py-1 px-2 rounded bg-slate-800/50">
                            <span className="text-slate-400">{item.description}</span>
                            <span className="text-emerald-400 font-medium">+{item.points}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Historial de rondas */}
          <div className="bg-slate-900 border-x border-slate-800 px-6 pb-6">
            <h3 className="text-sm font-medium text-slate-500 mb-3">📜 Historial de Rondas</h3>
            <div className="flex gap-2 flex-wrap">
              {result.gameHistory.map((round) => (
                <div
                  key={round.round}
                  className={`
                    px-3 py-2 rounded-lg text-xs border
                    ${round.isTie 
                      ? "bg-amber-950/30 border-amber-500/20 text-amber-400" 
                      : round.wasImpostor 
                        ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-950/30 border-rose-500/20 text-rose-400"
                    }
                  `}
                >
                  <div className="font-medium">R{round.round}</div>
                  <div className="text-[10px] opacity-80">
                    {round.isTie ? "Empate" : round.eliminatedName}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer con botones */}
          <div className="bg-slate-900 rounded-b-2xl border-b border-x border-slate-800 p-6 flex gap-4">
            <button
              onClick={onExit}
              className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition font-medium"
            >
              Salir al Lobby
            </button>
            <button
              onClick={onPlayAgain}
              className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition"
            >
              🎮 Jugar de Nuevo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
