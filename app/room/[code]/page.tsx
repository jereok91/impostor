"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSocket from "../../../lib/useSocket";
import useGameStore from "../../../lib/useGameStore";
import Lobby from "../../../components/Lobby";
import GameBoard from "../../../components/GameBoard";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const socket = useSocket();
  const { 
    players, setPlayers, 
    gameInfo, setGameInfo, 
    myPlayerId, setMyPlayerId,
    myNickname, setMyNickname,
    setMyCard, setClues,
    getSession, clearSession,
    _hasHydrated
  } = useGameStore();
  
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [reconnectError, setReconnectError] = useState("");
  const [needsNickname, setNeedsNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [gameInProgress, setGameInProgress] = useState(false);
  
  const roomCode = (params.code as string)?.toUpperCase();

  // Verificar si ya estamos conectados a esta sala (después de crear/unirse)
  const alreadyConnected = gameInfo.code === roomCode && myPlayerId && gameInfo.gameId;

  // Intentar reconectar al cargar la página (solo después de hidratación)
  useEffect(() => {
    // Esperar a que el socket esté listo y el store hidratado
    if (!socket || !_hasHydrated) return;
    
    // Si ya estamos conectados a esta sala, solo necesitamos asegurar que el socket esté en la sala
    if (alreadyConnected) {
      // Re-unir el socket a la sala por si acaso (navegación interna)
      socket.emit("rejoin_room", { 
        playerId: myPlayerId, 
        gameId: gameInfo.gameId,
        code: roomCode 
      }, (res: any) => {
        if (res.ok) {
          // Actualizar datos por si hay cambios
          setPlayers(res.players || []);
          if (res.phase) {
            setGameInfo((prev: any) => ({ 
              ...prev, 
              phase: res.phase, 
              round: res.round,
              createdAt: res.createdAt,
              timeoutDuration: res.timeoutDuration
            }));
          }
          // Si hay carta (juego en progreso), restaurarla
          if (res.card) {
            setMyCard(res.card);
          }
          // Si hay pistas, restaurarlas
          if (res.clues && res.clues.length > 0) {
            setClues(res.clues);
          }
        }
        // Siempre quitar el loading, ya tenemos los datos básicos
        setIsReconnecting(false);
      });
      return;
    }
    
    let session = null;
    try {
      session = getSession();
    } catch (error) {
      // Error al leer localStorage (datos corruptos), limpiar y redirigir
      console.error("Error reading session:", error);
      clearSession();
      router.push("/");
      return;
    }
    
    // Si tenemos sesión guardada para esta sala, intentar reconectar
    if (session && session.code === roomCode) {
      socket.emit("rejoin_room", { 
        playerId: session.playerId, 
        gameId: session.gameId,
        code: roomCode 
      }, (res: any) => {
        if (res.ok) {
          // Restaurar IDs de sesión
          setMyPlayerId(session.playerId);
          setMyNickname(session.nickname);
          
          setGameInfo({ 
            gameId: res.gameId, 
            code: res.code, 
            phase: res.phase, 
            round: res.round,
            showHintToImpostor: res.showHintToImpostor,
            createdAt: res.createdAt,
            timeoutDuration: res.timeoutDuration
          });
          setPlayers(res.players || []);
          
          // Si hay carta (juego en progreso), restaurarla
          if (res.card) {
            setMyCard(res.card);
          }
          
          // Si hay pistas, restaurarlas
          if (res.clues && res.clues.length > 0) {
            setClues(res.clues);
          }
          
          setIsReconnecting(false);
        } else {
          // Sesión inválida, limpiar y pedir nickname
          clearSession();
          setNeedsNickname(true);
          setIsReconnecting(false);
        }
      });
    } else if (session && session.code !== roomCode) {
      // Tiene sesión pero de otra sala - limpiar sesión anterior y pedir nickname para esta sala
      clearSession();
      setNeedsNickname(true);
      setIsReconnecting(false);
    } else {
      // No hay sesión guardada, pedir nickname
      setNeedsNickname(true);
      setIsReconnecting(false);
    }
  }, [socket, roomCode, alreadyConnected, _hasHydrated]);

  // Listeners de socket
  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdate = (payload: any) => {
      if (Array.isArray(payload.players)) {
        setPlayers(payload.players);
      }
    };

    const handlePhaseChange = (payload: any) => {
      setGameInfo((prev: any) => ({ 
        ...prev, 
        phase: payload.phase, 
        round: payload.round,
        gameId: payload.gameId || prev.gameId 
      }));
    };

    const handleKicked = () => {
      clearSession();
      router.push("/");
    };

    const handleHostChanged = (payload: any) => {
      // Actualizar la lista de jugadores para reflejar el nuevo host
      setPlayers((prevPlayers: any[]) => 
        prevPlayers.map(p => ({
          ...p,
          isHost: p.id === payload.newHostId
        }))
      );
    };

    socket.on("room_update", handleRoomUpdate);
    socket.on("phase_change", handlePhaseChange);
    socket.on("kicked", handleKicked);
    socket.on("host_changed", handleHostChanged);

    return () => {
      socket.off("room_update", handleRoomUpdate);
      socket.off("phase_change", handlePhaseChange);
      socket.off("kicked", handleKicked);
      socket.off("host_changed", handleHostChanged);
    };
  }, [socket, setPlayers, setGameInfo, clearSession, router]);

  // Unirse a la sala con nickname
  function joinWithNickname() {
    if (!socket || !nickname.trim()) return;
    
    socket.emit("join_room", { code: roomCode, nickname: nickname.trim() }, (res: any) => {
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
        setMyNickname(nickname.trim());
        setClues([]); // Limpiar pistas al unirse
        setNeedsNickname(false);
      } else {
        // Verificar si el error es porque el juego ya comenzó
        if (res.error && res.error.includes("ya ha comenzado")) {
          setGameInProgress(true);
        }
        setReconnectError(res.error || "Error al unirse");
      }
    });
  }

  // Pantalla de carga mientras reconecta
  if (isReconnecting) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Reconectando a la sala {roomCode}...</p>
        </div>
      </div>
    );
  }

  // Pantalla cuando el juego está en progreso y el usuario no puede unirse
  if (gameInProgress) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🕵️ Impostor</h1>
            <p className="text-gray-400">Sala en partida</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-center mb-6">
              <div className="text-sm text-violet-400 mb-1">Código de sala</div>
              <div className="text-3xl font-bold tracking-widest text-white">{roomCode}</div>
            </div>

            <div className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <div className="text-yellow-400 font-medium mb-2">Partida en curso</div>
              <p className="text-gray-400 text-sm mb-4">
                La partida ya ha comenzado. Debes esperar a que termine para poder unirte.
              </p>
              <div className="animate-pulse text-violet-400 text-sm">
                Esperando que termine la partida...
              </div>
            </div>
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

  // Pantalla para ingresar nickname si es necesario
  if (needsNickname) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🕵️ Impostor</h1>
            <p className="text-gray-400">Únete a la sala</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-center mb-6">
              <div className="text-sm text-violet-400 mb-1">Código de sala</div>
              <div className="text-3xl font-bold tracking-widest text-white">{roomCode}</div>
            </div>

            {!gameInProgress && (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Tu nickname</label>
                  <input
                    className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-violet-500 focus:outline-none"
                    placeholder="Escribe tu nombre..."
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && joinWithNickname()}
                    autoFocus
                  />
                </div>

                {reconnectError && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
                    {reconnectError}
                  </div>
                )}

                <button
                  className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium text-white transition"
                  onClick={joinWithNickname}
                  disabled={!nickname.trim()}
                >
                  Unirse a la partida
                </button>
              </>
            )}
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

  // Mostrar el juego o el lobby según la fase
  const phase = gameInfo.phase || "WAITING";

  if (phase === "WAITING") {
    return <Lobby />;
  }

  return <GameBoard />;
}