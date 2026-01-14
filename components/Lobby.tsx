"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";
import PlayerCard from "./PlayerCard";
import LeaveGameButton from "./LeaveGameButton";
import GameSettingsForm from "./GameSettingsForm";
import RoomExpirationTimer from "./RoomExpirationTimer";

export default function Lobby() {
  const router = useRouter();
  const socket = useSocket();
  const toast = useToast();
  const { players, setPlayers, gameInfo, setGameInfo, myPlayerId, setMyPlayerId, setMyNickname } = useGameStore();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHintToImpostor, setShowHintToImpostor] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Verificar si el jugador actual es el anfitrión
  const isHost = players.find((p: any) => p.id === myPlayerId)?.isHost ?? false;

  useEffect(() => {
    if (!socket) return;

    // Escuchar evento de sala expirada por inactividad
    const handleRoomExpired = ({ reason }: { reason?: string }) => {
      toast.error(reason || "La sala se cerró por inactividad");
      // Limpiar estado del juego
      setGameInfo({ gameId: "", code: "", phase: "WAITING", round: 0 });
      setPlayers([]);
      setMyPlayerId("");
      setMyNickname("");
      // Redirigir a la landing page
      router.push("/");
    };

    socket.on("room_expired", handleRoomExpired);

    return () => {
      socket.off("room_expired", handleRoomExpired);
    };
  }, [socket, router, toast, setGameInfo, setPlayers, setMyPlayerId, setMyNickname]);

  function createRoom() {
    if (!socket || !nickname) return;
    socket.emit("create_room", { nickname, showHintToImpostor }, (res: any) => {
      if (res.ok) {
        setGameInfo({ 
          gameId: res.gameId, 
          code: res.code, 
          phase: "WAITING", 
          round: 0, 
          showHintToImpostor,
          createdAt: res.createdAt,
          timeoutDuration: res.timeoutDuration
        });
        setMyPlayerId(res.playerId);
        setMyNickname(nickname);
        // Redirigir a la URL de la sala
        router.push(`/room/${res.code}`);
      } else {
        toast.error(res.error || "Error al crear sala");
      }
    });
  }

  function joinRoom() {
    if (!socket || !nickname || !code) return;
    socket.emit("join_room", { code, nickname }, (res: any) => {
      if (res.ok) {
        setGameInfo({ 
          gameId: res.gameId, 
          code: res.code, 
          phase: "WAITING", 
          round: 0,
          createdAt: res.createdAt,
          timeoutDuration: res.timeoutDuration
        });
        setMyPlayerId(res.playerId);
        setMyNickname(nickname);
        // Redirigir a la URL de la sala
        router.push(`/room/${res.code}`);
      } else {
        toast.error(res.error || "Error al unirse a la sala");
      }
    });
  }

  const MIN_PLAYERS = 3;
  const canStartGame = players.length >= MIN_PLAYERS;

  function startGame() {
    if (!socket || !gameInfo.gameId) return;
    if (!canStartGame) {
      toast.warning(`Se necesitan mínimo ${MIN_PLAYERS} jugadores para iniciar`);
      return;
    }
    socket.emit("start_game", { gameId: gameInfo.gameId }, (res: any) => {
      if (!res.ok) toast.error(res.error || "Error al iniciar partida");
    });
  }

  function getShareUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${gameInfo.code}`;
  }

  async function copyShareUrl() {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback para móviles
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function shareWhatsApp() {
    const url = getShareUrl();
    const text = `¡Únete a mi partida de Impostor! 🕵️\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function shareTelegram() {
    const url = getShareUrl();
    const text = `¡Únete a mi partida de Impostor! 🕵️`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank");
  }

  function shareNative() {
    const url = getShareUrl();
    if (navigator.share) {
      navigator.share({
        title: "Impostor - Únete a mi partida",
        text: "¡Únete a mi partida de Impostor! 🕵️",
        url: url,
      });
    } else {
      copyShareUrl();
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 text-gray-200">
      {/* Header con título y botón salir */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-semibold">Impostor — Lobby</h1>
        {gameInfo.code && <LeaveGameButton variant="text" />}
      </div>

      {/* Timer de expiración de sala */}
      {gameInfo.code && gameInfo.createdAt && gameInfo.timeoutDuration && gameInfo.phase === "WAITING" && (
        <RoomExpirationTimer 
          roomCreatedAt={gameInfo.createdAt}
          timeoutDuration={gameInfo.timeoutDuration}
        />
      )}

      {/* Mostrar código de sala y opciones de compartir */}
      {gameInfo.code && (
        <div className="mb-6 p-4 bg-violet-900/50 border border-violet-500 rounded-lg">
          <div className="text-sm text-violet-300 mb-1">Código de sala:</div>
          <div className="text-3xl font-bold tracking-widest text-white mb-3">{gameInfo.code}</div>
          
          {/* URL compartible */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">O comparte este link:</div>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={getShareUrl()} 
                className="flex-1 p-2 text-sm rounded bg-gray-800 border border-gray-700 text-gray-300"
              />
              <button 
                onClick={copyShareUrl}
                className={`px-3 py-2 rounded text-sm font-medium transition ${
                  copied 
                    ? "bg-green-600 text-white" 
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                }`}
              >
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {/* Botones de compartir */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={shareWhatsApp}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </button>
            <button 
              onClick={shareTelegram}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-400 rounded text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Telegram
            </button>
            <button 
              onClick={shareNative}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Compartir
            </button>
          </div>
        </div>
      )}

      {/* Solo mostrar formulario si no hay sala creada */}
      {!gameInfo.gameId && (
        <>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="col-span-2 p-2 rounded bg-gray-800" placeholder="Nickname" value={nickname} onChange={(e)=>setNickname(e.target.value)} />
            <div className="flex gap-2">
              <button className="px-3 py-2 bg-violet-600 rounded hover:bg-violet-500 transition" onClick={() => setShowSettings(!showSettings)}>
                ⚙️ {showSettings ? "Ocultar" : "Opciones"}
              </button>
            </div>
          </div>

          {/* Opciones de configuración */}
          {showSettings && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Configuración de partida</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showHintToImpostor}
                    onChange={(e) => setShowHintToImpostor(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:bg-violet-600 transition"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-5"></div>
                </div>
                <div>
                  <div className="text-sm text-white">Pista para el impostor</div>
                  <div className="text-xs text-gray-400">
                    {showHintToImpostor 
                      ? "El impostor verá la categoría de la palabra" 
                      : "El impostor NO verá ninguna pista"}
                  </div>
                </div>
              </label>
            </div>
          )}

          <div className="mb-4">
            <button 
              className="w-full py-3 bg-violet-600 rounded-lg hover:bg-violet-500 transition font-medium text-lg"
              onClick={createRoom}
              disabled={!nickname.trim()}
            >
              🎮 Crear sala
            </button>
          </div>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-950 text-gray-400">o únete a una sala</span>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="col-span-2 p-2 rounded bg-gray-800" placeholder="Código de sala" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} />
            <button className="px-3 py-2 bg-emerald-600 rounded hover:bg-emerald-500 transition" onClick={joinRoom}>Unirse</button>
          </div>
        </>
      )}

      <div className="mb-4">
        <h2 className="text-xl mb-2">Jugadores ({players.length}/{MIN_PLAYERS} mínimo)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {players.length === 0 ? <div className="text-gray-400">Sin jugadores</div> : players.map((p:any)=> <PlayerCard key={p.id} player={p} />)}
        </div>
      </div>

      {gameInfo.gameId && (
        <div className="flex flex-col gap-4">
          {isHost ? (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
              <GameSettingsForm onStartGame={() => {
                // El formulario ya maneja el start_game
                console.log("Game starting...");
              }} />
            </div>
          ) : (
            <div className="p-6 bg-violet-900/30 border border-violet-500/50 rounded-2xl text-center">
              <div className="text-4xl mb-4">⏳</div>
              <div className="text-violet-300 text-lg mb-2">Esperando al anfitrión...</div>
              <div className="text-gray-400 text-sm">El anfitrión está configurando la partida</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
