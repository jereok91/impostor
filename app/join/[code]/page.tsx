"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSocket from "../../../lib/useSocket";
import useGameStore from "../../../lib/useGameStore";
import PlayerCard from "../../../components/PlayerCard";

export default function JoinRoomPage() {
  const params = useParams();
  const router = useRouter();
  const socket = useSocket();
  const { players, setPlayers, gameInfo, setGameInfo, setMyPlayerId, setMyNickname, getSession } = useGameStore();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  
  const roomCode = (params.code as string)?.toUpperCase();

  // Si ya tiene sesión para esta sala, redirigir a /room/[code]
  useEffect(() => {
    const session = getSession();
    if (session && session.code === roomCode) {
      router.replace(`/room/${roomCode}`);
    }
  }, [roomCode, router, getSession]);

  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdate = (payload: any) => {
      if (Array.isArray(payload.players)) {
        setPlayers(payload.players);
      }
    };

    socket.on("room_update", handleRoomUpdate);

    return () => {
      socket.off("room_update", handleRoomUpdate);
    };
  }, [socket, setPlayers]);

  function joinRoom() {
    if (!socket || !nickname.trim()) {
      setError("Escribe tu nickname");
      return;
    }
    
    setError("");
    socket.emit("join_room", { code: roomCode, nickname: nickname.trim() }, (res: any) => {
      if (res.ok) {
        setGameInfo({ gameId: res.gameId, code: res.code, phase: "WAITING", round: 0 });
        setMyPlayerId(res.playerId);
        setMyNickname(nickname.trim());
        // Redirigir a la URL de la sala
        router.push(`/room/${res.code}`);
      } else {
        setError(res.error || "Error al unirse");
      }
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🕵️ Impostor</h1>
          <p className="text-gray-400">Te han invitado a una partida</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="text-center mb-6">
            <div className="text-sm text-violet-400 mb-1">Código de sala</div>
            <div className="text-3xl font-bold tracking-widest text-white">{roomCode}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Tu nickname</label>
            <input
              className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-violet-500 focus:outline-none"
              placeholder="Escribe tu nombre..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium text-white transition"
            onClick={joinRoom}
          >
            Unirse a la partida
          </button>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-gray-500 hover:text-gray-300 text-sm">
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}