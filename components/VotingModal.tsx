"use client";

import React, { useState } from "react";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";

interface VotingModalProps {
  eliminatedPlayers?: Set<string>;
}

export default function VotingModal({ eliminatedPlayers = new Set() }: VotingModalProps) {
  const socket = useSocket();
  const toast = useToast();
  const { players, gameInfo, myPlayerId } = useGameStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // Filtrar jugadores eliminados de las opciones de voto
  const eligiblePlayers = players.filter((p: any) => !eliminatedPlayers.has(p.id));

  function submitVote() {
    if (!socket || !gameInfo.gameId || !selected) return;
    socket.emit("submit_vote", { gameId: gameInfo.gameId, votedForPlayerId: selected }, (res: any) => {
      if (!res.ok) {
        toast.error(res.error || "Error al enviar voto");
      } else {
        setOpen(false);
        setHasVoted(true);
        toast.success("Voto enviado correctamente");
      }
    });
  }

  if (hasVoted) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-emerald-950/80 border border-emerald-500/30 backdrop-blur rounded-xl text-emerald-400 text-sm">
        ✓ Tu voto ha sido registrado. Esperando a los demás...
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
      <button 
        className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold text-white shadow-lg shadow-amber-600/25 transition transform hover:scale-105"
        onClick={() => setOpen(true)}
      >
        🗳️ Votar por el Impostor
      </button>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 animate-fade-in">
          <div className="w-full max-w-md mx-4 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-modal-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 bg-amber-950/30">
              <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
                <span>🗳️</span> Votación
              </h3>
              <p className="text-sm text-slate-400 mt-1">¿Quién crees que es el impostor?</p>
            </div>
            
            {/* Lista de jugadores */}
            <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
              {eligiblePlayers.map((p: any) => {
                const isMe = p.id === myPlayerId;
                const isSelected = selected === p.id;
                
                return (
                  <button
                    key={p.id}
                    className={`
                      w-full p-4 rounded-xl text-left transition transform
                      ${isSelected 
                        ? "bg-rose-600 border-2 border-rose-400 scale-[1.02]" 
                        : "bg-slate-800 border-2 border-transparent hover:border-slate-600"
                      }
                      ${isMe ? "opacity-60" : ""}
                    `}
                    onClick={() => !isMe && setSelected(p.id)}
                    disabled={isMe}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isSelected ? "bg-rose-500" : "bg-slate-700"}`}>
                          {p.nickname.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className={`font-medium ${isSelected ? "text-white" : "text-slate-200"}`}>
                            {p.nickname}
                          </span>
                          {isMe && <span className="ml-2 text-xs text-slate-500">(Tú)</span>}
                        </div>
                      </div>
                      {isSelected && <span className="text-2xl">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
              <button 
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button 
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-lg font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={submitVote}
                disabled={!selected}
              >
                Confirmar voto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
