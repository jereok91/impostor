"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";

interface LeaveGameButtonProps {
  variant?: "icon" | "text" | "full";
  className?: string;
}

export default function LeaveGameButton({ variant = "icon", className = "" }: LeaveGameButtonProps) {
  const router = useRouter();
  const socket = useSocket();
  const toast = useToast();
  const { gameInfo, clearSession } = useGameStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  function handleLeave() {
    setIsLeaving(true);

    // 1. Emitir evento al servidor
    if (socket && gameInfo.gameId) {
      socket.emit("leave_room", { gameId: gameInfo.gameId }, (res: any) => {
        console.log("leave_room response:", res);
      });
    }

    // 2. Limpiar estado local (Zustand)
    clearSession();

    // 3. Desconectar socket
    if (socket) {
      socket.disconnect();
    }

    // 4. Mostrar toast y redirigir
    toast.info("Has abandonado la partida");
    
    // Pequeño delay para que se vea el toast
    setTimeout(() => {
      router.push("/");
    }, 300);
  }

  return (
    <>
      {/* Botón de salir */}
      <button
        onClick={() => setShowConfirm(true)}
        className={`
          group flex items-center gap-2 transition-all duration-200
          ${variant === "icon" 
            ? "p-2 rounded-lg hover:bg-rose-950/50" 
            : variant === "text"
              ? "px-3 py-1.5 rounded-lg hover:bg-rose-950/50"
              : "px-4 py-2 rounded-lg border border-slate-700 hover:border-rose-500/50 hover:bg-rose-950/30"
          }
          ${className}
        `}
        title="Salir de la sala"
      >
        {/* Icono de puerta/salida */}
        <svg 
          className="w-5 h-5 text-slate-400 group-hover:text-rose-400 transition-colors" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth={2}
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
          />
        </svg>
        
        {variant !== "icon" && (
          <span className="text-sm text-slate-400 group-hover:text-rose-400 transition-colors">
            {variant === "full" ? "Salir de la sala" : "Salir"}
          </span>
        )}
      </button>

      {/* Modal de Confirmación */}
      {showConfirm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => !isLeaving && setShowConfirm(false)}
        >
          <div 
            className="w-full max-w-sm mx-4 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-modal-in shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con icono */}
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-950/50 border-2 border-rose-500/30 flex items-center justify-center">
                <svg 
                  className="w-8 h-8 text-rose-400" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2}
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
                  />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-slate-100 mb-2">
                ¿Abandonar partida?
              </h3>
              <p className="text-slate-400 text-sm">
                Si sales ahora, perderás tu progreso y los demás jugadores serán notificados.
              </p>
            </div>

            {/* Botones */}
            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isLeaving}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-medium transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleLeave}
                disabled={isLeaving}
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLeaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saliendo...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
                    </svg>
                    Sí, salir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
