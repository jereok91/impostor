"use client";

import { useEffect } from "react";
import LandingPage from "../components/LandingPage";
import GameBoard from "../components/GameBoard";
import useGameStore from "../lib/useGameStore";
import useSocket from "../lib/useSocket";

export default function Home() {
  const socket = useSocket();
  const { gameInfo, setGameInfo, setPlayers } = useGameStore();
  const inGame = gameInfo.phase && gameInfo.phase !== "WAITING";

  // Listeners globales de socket
  useEffect(() => {
    if (!socket) return;

    const handlePhaseChange = (payload: any) => {
      console.log("Global phase_change received:", payload);
      setGameInfo((prev: any) => ({ 
        ...prev, 
        phase: payload.phase, 
        round: payload.round,
        gameId: payload.gameId || prev.gameId 
      }));
    };

    const handleRoomUpdate = (payload: any) => {
      console.log("Global room_update received:", payload);
      if (Array.isArray(payload.players)) {
        setPlayers(payload.players);
      }
    };

    const handlePlayerLeft = (payload: any) => {
      console.log("Player left:", payload);
      // Opcional: mostrar notificación
    };

    socket.on("phase_change", handlePhaseChange);
    socket.on("room_update", handleRoomUpdate);
    socket.on("player_left", handlePlayerLeft);

    return () => {
      socket.off("phase_change", handlePhaseChange);
      socket.off("room_update", handleRoomUpdate);
      socket.off("player_left", handlePlayerLeft);
    };
  }, [socket, setGameInfo, setPlayers]);

  return (
    <div className="min-h-screen bg-slate-950">
      {inGame ? <GameBoard /> : <LandingPage />}
    </div>
  );
}
