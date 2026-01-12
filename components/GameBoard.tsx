"use client";

import React, { useState, useEffect, useMemo } from "react";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";
import VotingPhase from "./VotingPhase";
import SecretCard from "./SecretCard";
import RoundResultScreen from "./RoundResultScreen";
import GameOverScreen from "./GameOverScreen";
import LeaveGameButton from "./LeaveGameButton";

interface CardData {
  playerId: string;
  isImpostor: boolean;
  secretWord: string | null;
  category: string;
  showHintToImpostor: boolean;
  currentRound?: number;
  totalRounds?: number;
}

interface RoundResultData {
  round: number;
  totalRounds: number;
  isTie: boolean;
  eliminatedId: string | null;
  eliminatedName: string | null;
  wasImpostor: boolean;
  gameEnds: boolean;
  winner: "FRIENDS" | "IMPOSTOR" | null;
  voteTallies?: Record<string, number>;
}

export default function GameBoard() {
  const socket = useSocket();
  const toast = useToast();
  const { 
    gameInfo, players, myPlayerId, setMyPlayerId, setGameInfo,
    myCard, setMyCard, 
    clues: storeClues, setClues: setStoreClues, addClue,
    roundResult, setRoundResult,
    gameOverResult, setGameOverResult
  } = useGameStore();
  
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [clue, setClue] = useState("");
  const [clues, setClues] = useState<{from: string; text: string; playerId?: string}[]>([]);
  const [clueSent, setClueSent] = useState(false);
  const [showRoundResult, setShowRoundResult] = useState(false);
  const [currentRoundResult, setCurrentRoundResult] = useState<RoundResultData | null>(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<Set<string>>(new Set());

  // Determinar si el jugador actual está eliminado
  const isEliminated = useMemo(() => {
    return myPlayerId ? eliminatedPlayers.has(myPlayerId) : false;
  }, [myPlayerId, eliminatedPlayers]);

  // Inicializar desde el store si hay datos de reconexión
  useEffect(() => {
    if (myCard && !cardData) {
      setCardData({
        playerId: myPlayerId || "",
        isImpostor: myCard.isImpostor,
        secretWord: myCard.secretWord || null,
        category: myCard.category || "",
        showHintToImpostor: gameInfo.config?.showHintToImpostor ?? true,
        currentRound: myCard.currentRound,
        totalRounds: myCard.totalRounds || gameInfo.totalRounds
      });
    }
    if (storeClues.length > 0 && clues.length === 0) {
      setClues(storeClues.map((c: { nickname?: string; from?: string; text: string; playerId: string }) => ({ 
        from: c.nickname || c.from || "Anónimo", 
        text: c.text, 
        playerId: c.playerId 
      })));
    }
  }, [myCard, storeClues, cardData, myPlayerId, gameInfo]);

  // Listeners de socket
  useEffect(() => {
    if (!socket) return;

    // Escuchar nueva pista en tiempo real
    socket.on("new_clue", (payload: any) => {
      console.log("new_clue:", payload);
      setClues((prev) => {
        const exists = prev.some(c => c.playerId === payload.playerId);
        if (exists) return prev;
        return [...prev, { from: payload.from, text: payload.text, playerId: payload.playerId }];
      });
      addClue({ playerId: payload.playerId || "", nickname: payload.from, text: payload.text });
      
      // Notificación
      if (payload.playerId !== myPlayerId) {
        toast.info(`${payload.from} envió una pista`);
      }
    });

    // Escuchar todas las pistas
    socket.on("all_clues", (payload: any) => {
      console.log("all_clues:", payload);
      if (payload.clues) {
        setClues(payload.clues.map((c: any) => ({ from: c.from, text: c.text, playerId: c.playerId })));
      }
    });

    // Escuchar resultado de ronda (NUEVO SISTEMA)
    socket.on("round_result", (payload: RoundResultData) => {
      console.log("round_result:", payload);
      setCurrentRoundResult(payload);
      setShowRoundResult(true);
      
      // Si alguien fue eliminado, agregarlo a la lista
      if (payload.eliminatedId) {
        setEliminatedPlayers(prev => new Set([...prev, payload.eliminatedId!]));
        
        // Si fui yo el eliminado
        if (payload.eliminatedId === myPlayerId) {
          toast.warning("Has sido eliminado. Ahora eres espectador.");
        }
      }
    });

    // Escuchar fin del juego
    socket.on("game_over", (payload: any) => {
      console.log("game_over:", payload);
      setGameOverResult(payload);
      setShowRoundResult(false);
      setShowGameOver(true);
    });

    // Escuchar cuando se notifica un voto
    socket.on("vote_cast", (payload: any) => {
      console.log("vote_cast:", payload);
      // Podría mostrar indicador visual de votos
    });

    return () => {
      socket.off("new_clue");
      socket.off("all_clues");
      socket.off("round_result");
      socket.off("game_over");
      socket.off("vote_cast");
    };
  }, [socket, myPlayerId, toast, addClue, setGameOverResult]);

  // Listener para tarjetas secretas
  useEffect(() => {
    if (!socket || players.length === 0) return;

    const handleSecretCard = (data: CardData) => {
      console.log("Received secret card for player:", data.playerId);
      if (myPlayerId && data.playerId === myPlayerId) {
        setCardData(data);
        setMyCard({
          isImpostor: data.isImpostor,
          secretWord: data.secretWord || undefined,
          category: data.category,
          currentRound: data.currentRound,
          totalRounds: data.totalRounds
        });
      }
    };

    players.forEach((p: any) => {
      socket.on(`secret_card_${p.id}`, handleSecretCard);
    });

    return () => {
      players.forEach((p: any) => {
        socket.off(`secret_card_${p.id}`);
      });
    };
  }, [socket, players, myPlayerId, setMyCard]);

  // Pedir la tarjeta si no la tenemos
  useEffect(() => {
    if (!socket || !gameInfo.gameId || !myPlayerId || isEliminated) return;
    if (cardData) return;
    if (gameInfo.phase !== "CLUES" && gameInfo.phase !== "DEALING") return;

    console.log("Requesting my card...");
    socket.emit("get_my_card", { gameId: gameInfo.gameId, playerId: myPlayerId }, (res: any) => {
      if (res.ok && res.card) {
        setCardData(res.card);
        setMyCard({
          isImpostor: res.card.isImpostor,
          secretWord: res.card.secretWord,
          category: res.card.category,
          currentRound: res.card.currentRound,
          totalRounds: res.card.totalRounds
        });
      }
    });
  }, [socket, gameInfo.gameId, gameInfo.phase, myPlayerId, cardData, setMyCard, isEliminated]);

  // Enviar pista
  function sendClue() {
    if (!socket || !gameInfo.gameId || !clue.trim() || clueSent || isEliminated) return;
    
    const clueText = clue.trim();
    socket.emit("send_clue", { gameId: gameInfo.gameId, clue: clueText }, (res: any) => {
      if (res.ok) {
        setClue("");
        setClueSent(true);
        toast.success("Pista enviada");
      } else {
        toast.error(res.error || "Error al enviar pista");
      }
    });
  }

  // Resetear estado cuando cambie la ronda
  useEffect(() => {
    console.log("Round changed to:", gameInfo.round);
    setClueSent(false);
    setClues([]);
    setCardData(null);
    setMyCard(null);
    setStoreClues([]);
    setShowRoundResult(false);
    setCurrentRoundResult(null);
  }, [gameInfo.round, setMyCard, setStoreClues]);

  // Handler para continuar después del resultado
  function handleRoundResultContinue() {
    setShowRoundResult(false);
    if (currentRoundResult?.gameEnds) {
      // El game_over event llegará automáticamente
    }
  }

  // Handler para jugar de nuevo
  function handlePlayAgain() {
    if (!socket || !gameInfo.gameId) return;
    socket.emit("restart_match", { gameId: gameInfo.gameId }, (res: any) => {
      if (res.ok) {
        setShowGameOver(false);
        setGameOverResult(null);
        setEliminatedPlayers(new Set());
        toast.success("¡Nueva partida iniciada!");
      } else {
        toast.error(res.error || "Error al reiniciar");
      }
    });
  }

  // Handler para salir
  function handleExit() {
    setShowGameOver(false);
    setGameOverResult(null);
    setGameInfo({ phase: "WAITING", round: 0 });
  }

  const phaseLabels: Record<string, string> = {
    WAITING: "Esperando...",
    DEALING: "Repartiendo cartas",
    CLUES: "Fase de Pistas",
    VOTING: "Fase de Votación",
    ROUND_RESULT: "Resultados",
    GAME_OVER: "Fin del Juego",
    FINISHED: "Partida Terminada",
  };

  const totalRounds = gameInfo.totalRounds || cardData?.totalRounds || 3;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕵️</span>
            <div>
              <h1 className="font-bold text-slate-200">Ronda {gameInfo.round || 1}</h1>
              <span className="text-xs text-slate-500">de {totalRounds}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Badge de estado */}
            <span className={`
              px-3 py-1.5 rounded-full text-xs font-medium border
              ${gameInfo.phase === "CLUES" 
                ? "bg-emerald-950/50 border-emerald-500/30 text-emerald-400" 
                : gameInfo.phase === "VOTING"
                  ? "bg-amber-950/50 border-amber-500/30 text-amber-400"
                  : "bg-violet-950/50 border-violet-500/30 text-violet-400"
              }
            `}>
              {phaseLabels[gameInfo.phase || ""] || gameInfo.phase}
            </span>
            
            {/* Badge de espectador */}
            {isEliminated && (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-rose-950/50 border border-rose-500/30 text-rose-400">
                👻 Espectador
              </span>
            )}

            {/* Botón salir */}
            <LeaveGameButton variant="icon" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Banner de espectador */}
        {isEliminated && (
          <div className="p-4 bg-rose-950/30 border border-rose-500/20 rounded-xl flex items-center gap-3">
            <span className="text-2xl">👻</span>
            <div>
              <p className="font-medium text-rose-300">Estás eliminado</p>
              <p className="text-sm text-rose-400/70">Puedes seguir viendo el juego pero no participar.</p>
            </div>
          </div>
        )}

        {/* ===== FASE DE VOTACIÓN ===== */}
        {gameInfo.phase === "VOTING" && !isEliminated && (
          <VotingPhase eliminatedPlayers={eliminatedPlayers} clues={clues} />
        )}

        {/* ===== FASE DE VOTACIÓN - ESPECTADOR ===== */}
        {gameInfo.phase === "VOTING" && isEliminated && (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center">
            <div className="text-4xl mb-4">🗳️</div>
            <h2 className="text-xl font-bold text-amber-400 mb-2">Votación en curso</h2>
            <p className="text-slate-400">Los jugadores activos están votando...</p>
          </div>
        )}

        {/* ===== FASE DE PISTAS (DEALING / CLUES) ===== */}
        {(gameInfo.phase === "DEALING" || gameInfo.phase === "CLUES") && (
          <>
            {/* Tarjeta secreta */}
            {!isEliminated && cardData && (
              <div className="animate-fade-in">
                <SecretCard
                  isImpostor={cardData.isImpostor}
                  secretWord={cardData.secretWord || undefined}
                  category={cardData.category}
                  showHintToImpostor={cardData.showHintToImpostor}
                />
              </div>
            )}

            {/* Loader mientras se reparten cartas */}
            {!isEliminated && !cardData && (
              <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center">
                <div className="animate-pulse">
                  <div className="text-5xl mb-4">🎴</div>
                  <div className="text-slate-400">Repartiendo roles...</div>
                </div>
              </div>
            )}

            {/* Grid principal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Panel de pistas */}
              <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <h2 className="font-medium text-slate-200 flex items-center gap-2">
                    <span>💬</span> Pistas
                  </h2>
                  <span className="text-xs text-slate-500">
                    {clues.length} / {players.length} enviadas
                  </span>
                </div>
                
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                  {clues.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="text-3xl mb-2 opacity-50">💭</div>
                      <p className="text-slate-500 text-sm">Esperando pistas...</p>
                    </div>
                  ) : (
                    clues.map((c, i) => {
                      const isMyClue = c.playerId === myPlayerId;
                      const playerEliminated = c.playerId ? eliminatedPlayers.has(c.playerId) : false;
                      
                      return (
                        <div 
                          key={i} 
                          className={`
                            p-3 rounded-lg transition
                            ${isMyClue 
                              ? "bg-violet-950/50 border border-violet-500/30" 
                              : "bg-slate-800/50"
                            }
                            ${playerEliminated ? "opacity-50" : ""}
                          `}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-violet-400 font-medium text-sm">{c.from}</span>
                            {isMyClue && <span className="text-[10px] text-violet-500">(Tú)</span>}
                            {playerEliminated && <span className="text-[10px] text-rose-400">💀</span>}
                          </div>
                          <p className="text-slate-200">{c.text}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input de pista */}
                <div className="p-4 border-t border-slate-800">
                  {isEliminated ? (
                    <div className="text-center text-slate-500 text-sm py-2">
                      No puedes enviar pistas como espectador
                    </div>
                  ) : gameInfo.phase === "CLUES" && !clueSent ? (
                    <div className="flex gap-2">
                      <input
                        className="flex-1 p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none transition"
                        placeholder="Escribe tu pista..."
                        value={clue}
                        onChange={(e) => setClue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendClue()}
                        maxLength={100}
                      />
                      <button 
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={sendClue}
                        disabled={!clue.trim()}
                      >
                        Enviar
                      </button>
                    </div>
                  ) : gameInfo.phase === "CLUES" && clueSent ? (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-lg text-emerald-400 text-center text-sm">
                      ✓ Pista enviada. Esperando a los demás...
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 text-sm py-2">
                      Esperando siguiente fase...
                    </div>
                  )}
                </div>
              </div>

              {/* Panel de jugadores */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h2 className="font-medium text-slate-200 flex items-center gap-2">
                    <span>👥</span> Jugadores
                  </h2>
                </div>
                
                <div className="p-3 space-y-2">
                  {players.map((p: any) => {
                    const isMe = p.id === myPlayerId;
                    const isPlayerEliminated = eliminatedPlayers.has(p.id);
                    
                    return (
                      <div 
                        key={p.id} 
                        className={`
                          flex items-center justify-between p-3 rounded-lg transition
                          ${isMe 
                            ? "bg-violet-950/50 border border-violet-500/30" 
                            : isPlayerEliminated
                              ? "bg-slate-800/30 opacity-50"
                              : "bg-slate-800/50"
                          }
                        `}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`truncate ${isPlayerEliminated ? "line-through text-slate-500" : "text-slate-200"}`}>
                            {p.nickname}
                          </span>
                          {p.isHost && <span className="text-yellow-400 shrink-0">👑</span>}
                          {isMe && <span className="text-[10px] text-violet-400 shrink-0">(Tú)</span>}
                          {isPlayerEliminated && <span className="text-rose-400 shrink-0">💀</span>}
                        </div>
                        <div className="text-sm text-slate-500 font-medium shrink-0">
                          {p.score ?? 0} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Pantalla de resultado de ronda */}
      <RoundResultScreen
        isOpen={showRoundResult}
        result={currentRoundResult}
        onContinue={handleRoundResultContinue}
      />

      {/* Pantalla de Game Over */}
      <GameOverScreen
        isOpen={showGameOver}
        result={gameOverResult}
        onPlayAgain={handlePlayAgain}
        onExit={handleExit}
      />
    </div>
  );
}
