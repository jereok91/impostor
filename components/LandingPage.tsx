"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";

type ActionTab = "join" | "create";

export default function LandingPage() {
  const router = useRouter();
  const socket = useSocket();
  const toast = useToast();
  const { setGameInfo, setMyPlayerId, setMyNickname } = useGameStore();
  
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [activeTab, setActiveTab] = useState<ActionTab>("join");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Verificar conexión del socket
  useEffect(() => {
    if (!socket) return;
    
    const handleConnect = () => {
      console.log("Socket connected!");
      setIsConnected(true);
    };
    
    const handleDisconnect = () => {
      console.log("Socket disconnected!");
      setIsConnected(false);
    };
    
    // Si ya está conectado
    if (socket.connected) {
      setIsConnected(true);
    }
    
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket]);

  const isNicknameValid = nickname.trim().length >= 2;
  const isCodeValid = roomCode.trim().length >= 4;
  
  const canJoin = isNicknameValid && isCodeValid && !isLoading && isConnected;
  const canCreate = isNicknameValid && !isLoading && isConnected;

  function handleCreateRoom() {
    if (!socket) {
      toast.error("Conectando al servidor... Intenta de nuevo.");
      return;
    }
    if (!canCreate) return;
    
    setIsLoading(true);
    socket.emit("create_room", { nickname: nickname.trim() }, (res: any) => {
      setIsLoading(false);
      if (res.ok) {
        setGameInfo({ 
          gameId: res.gameId, 
          code: res.code, 
          phase: "WAITING", 
          round: 0 
        });
        setMyPlayerId(res.playerId);
        setMyNickname(nickname.trim());
        router.push(`/room/${res.code}`);
      } else {
        toast.error(res.error || "Error al crear la sala");
      }
    });
  }

  function handleJoinRoom() {
    if (!socket) {
      toast.error("Conectando al servidor... Intenta de nuevo.");
      return;
    }
    if (!canJoin) return;
    
    setIsLoading(true);
    socket.emit("join_room", { code: roomCode.trim(), nickname: nickname.trim() }, (res: any) => {
      setIsLoading(false);
      if (res.ok) {
        setGameInfo({ 
          gameId: res.gameId, 
          code: res.code, 
          phase: "WAITING", 
          round: 0 
        });
        setMyPlayerId(res.playerId);
        setMyNickname(nickname.trim());
        router.push(`/room/${res.code}`);
      } else {
        toast.error(res.error || "Error al unirse a la sala");
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (activeTab === "join" && canJoin) {
        handleJoinRoom();
      } else if (activeTab === "create" && canCreate) {
        handleCreateRoom();
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo con gradiente radial */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      
      {/* Círculos decorativos de fondo */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl" />

      {/* Card principal */}
      <div className="relative w-full max-w-md">
        {/* Logo / Título */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-2">
            <span className="bg-linear-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(139,92,246,0.5)]">
              IMPOSTOR
            </span>
          </h1>
          <p className="text-slate-400 text-sm">
            Descubre quién miente antes de que sea tarde
          </p>
        </div>

        {/* Card con formulario */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-indigo-900/10">
          {/* Input de Nickname */}
          <div className="mb-6">
            <label htmlFor="nickname" className="block text-sm font-medium text-slate-300 mb-2">
              Tu nombre de jugador
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                id="nickname"
                type="text"
                placeholder="Ej: Detective_X"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={20}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  transition-all duration-200"
              />
            </div>
            {nickname.length > 0 && !isNicknameValid && (
              <p className="mt-1 text-xs text-amber-400">Mínimo 2 caracteres</p>
            )}
          </div>

          {/* Tabs de selección */}
          <div className="flex mb-6 bg-slate-950 rounded-xl p-1">
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "join"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Unirse
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "create"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Crear sala
            </button>
          </div>

          {/* Contenido según tab activo */}
          <div className="min-h-35">
            {activeTab === "join" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="roomCode" className="block text-sm font-medium text-slate-300 mb-2">
                    Código de la sala
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </span>
                    <input
                      id="roomCode"
                      type="text"
                      placeholder="ABCDE"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      onKeyDown={handleKeyDown}
                      maxLength={10}
                      className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 
                        uppercase tracking-widest font-mono text-lg
                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                        transition-all duration-200"
                    />
                  </div>
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={!canJoin}
                  className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2
                    ${canJoin 
                      ? "bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40" 
                      : "bg-slate-700 opacity-50 cursor-not-allowed"
                    }`}
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      <span>Entrar a la sala</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Crea una nueva sala y comparte el código con tus amigos
                  </p>
                </div>

                <button
                  onClick={handleCreateRoom}
                  disabled={!canCreate}
                  className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2
                    ${canCreate 
                      ? "bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40" 
                      : "bg-slate-700 opacity-50 cursor-not-allowed"
                    }`}
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Creando sala...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Crear nueva partida</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer con info */}
        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-amber-400'}`}>
              {isConnected ? 'Conectado' : 'Conectando...'}
            </span>
          </div>
          <p className="text-slate-500 text-xs">
            3-10 jugadores • Partidas de 5-15 min
          </p>
        </div>
      </div>
    </div>
  );
}
