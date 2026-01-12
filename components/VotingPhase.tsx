"use client";

import React, { useState } from "react";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";

interface VotingPhaseProps {
  eliminatedPlayers: Set<string>;
  clues: { from: string; text: string; playerId?: string }[];
}

export default function VotingPhase({ eliminatedPlayers, clues }: VotingPhaseProps) {
  const socket = useSocket();
  const toast = useToast();
  const { players, gameInfo, myPlayerId } = useGameStore();
  
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtrar jugadores elegibles (no eliminados y no soy yo)
  const eligiblePlayers = players.filter(
    (p: any) => !eliminatedPlayers.has(p.id) && p.id !== myPlayerId
  );

  // Obtener el nombre del jugador seleccionado
  const selectedPlayer = players.find((p: any) => p.id === selectedVoteId);

  // Obtener la pista de un jugador
  const getPlayerClue = (playerId: string) => {
    return clues.find(c => c.playerId === playerId)?.text || null;
  };

  function submitVote() {
    if (!socket || !gameInfo.gameId || !selectedVoteId || isSubmitting) return;
    
    setIsSubmitting(true);
    socket.emit("submit_vote", { gameId: gameInfo.gameId, votedForPlayerId: selectedVoteId }, (res: any) => {
      setIsSubmitting(false);
      if (!res.ok) {
        toast.error(res.error || "Error al enviar voto");
      } else {
        setHasVoted(true);
        toast.success("¡Voto registrado!");
      }
    });
  }

  // Si ya votó, mostrar estado de espera
  if (hasVoted) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-950/50 border-2 border-emerald-500/50 flex items-center justify-center">
            <span className="text-4xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-emerald-400 mb-2">Voto enviado</h2>
          <p className="text-slate-400">Esperando a que los demás voten...</p>
          
          <div className="mt-8 flex justify-center gap-2">
            {players.map((p: any) => (
              <div 
                key={p.id} 
                className={`w-3 h-3 rounded-full ${
                  eliminatedPlayers.has(p.id) 
                    ? "bg-slate-700" 
                    : "bg-emerald-500 animate-pulse"
                }`}
                title={p.nickname}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28"> {/* Padding para el sticky footer */}
      {/* Header de votación */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-amber-400 mb-2">🗳️ Fase de Votación</h2>
        <p className="text-slate-400">Selecciona al jugador que crees que es el impostor</p>
      </div>

      {/* Grid de jugadores votables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {eligiblePlayers.map((player: any) => {
          const isSelected = selectedVoteId === player.id;
          const playerClue = getPlayerClue(player.id);
          
          return (
            <button
              key={player.id}
              onClick={() => setSelectedVoteId(player.id)}
              className={`
                relative p-5 rounded-2xl text-left transition-all duration-200 transform
                ${isSelected 
                  ? "bg-gradient-to-br from-rose-950/80 to-rose-900/50 border-2 border-rose-500 ring-4 ring-rose-500/30 scale-[1.02]" 
                  : "bg-slate-900 border-2 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80"
                }
              `}
            >
              {/* Indicador de selección */}
              {isSelected && (
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/50 animate-bounce">
                  <span className="text-white text-sm">✓</span>
                </div>
              )}
              
              {/* Contenido de la carta */}
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`
                  w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0
                  ${isSelected 
                    ? "bg-rose-500 text-white" 
                    : "bg-slate-800 text-slate-400"
                  }
                `}>
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-semibold truncate ${isSelected ? "text-rose-100" : "text-slate-200"}`}>
                      {player.nickname}
                    </span>
                    {player.isHost && <span className="text-yellow-400 shrink-0">👑</span>}
                  </div>
                  
                  {/* Pista del jugador */}
                  {playerClue ? (
                    <div className={`
                      text-sm p-2 rounded-lg mt-2
                      ${isSelected ? "bg-rose-900/50 text-rose-200" : "bg-slate-800/50 text-slate-400"}
                    `}>
                      <span className="opacity-70">Pista: </span>
                      <span className="italic">"{playerClue}"</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 mt-2">
                      No envió pista
                    </div>
                  )}
                </div>
              </div>
              
              {/* Puntuación */}
              <div className={`
                absolute bottom-3 right-3 text-xs font-medium
                ${isSelected ? "text-rose-300" : "text-slate-500"}
              `}>
                {player.score ?? 0} pts
              </div>
            </button>
          );
        })}
      </div>

      {/* Tu propia info (no votable) */}
      <div className="mt-6 p-4 bg-violet-950/30 border border-violet-500/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold">
            {players.find((p: any) => p.id === myPlayerId)?.nickname?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <div className="text-violet-300 font-medium flex items-center gap-2">
              {players.find((p: any) => p.id === myPlayerId)?.nickname || "Tú"}
              <span className="text-xs text-violet-500">(Tú)</span>
            </div>
            <div className="text-xs text-violet-400/70">No puedes votar por ti mismo</div>
          </div>
        </div>
      </div>

      {/* Sticky Footer con botón de confirmación */}
      <div className={`
        fixed bottom-0 left-0 right-0 p-4 transition-all duration-300 z-40
        ${selectedVoteId 
          ? "translate-y-0 opacity-100" 
          : "translate-y-full opacity-0 pointer-events-none"
        }
      `}>
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/95 backdrop-blur-lg border border-slate-700 rounded-2xl p-4 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-4">
              {/* Info del seleccionado */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {selectedPlayer?.nickname?.charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">Vas a votar por:</div>
                  <div className="text-lg font-bold text-white truncate">
                    {selectedPlayer?.nickname || "..."}
                  </div>
                </div>
              </div>
              
              {/* Botones */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setSelectedVoteId(null)}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitVote}
                  disabled={isSubmitting}
                  className={`
                    px-6 py-3 rounded-xl font-bold text-white transition transform
                    ${isSubmitting 
                      ? "bg-slate-600 cursor-not-allowed" 
                      : "bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 hover:scale-105 shadow-lg shadow-rose-600/30"
                    }
                  `}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enviando...
                    </span>
                  ) : (
                    "🗳️ Confirmar Voto"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
