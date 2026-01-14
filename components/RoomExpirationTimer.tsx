"use client";

import React, { useState, useEffect, useMemo, memo } from "react";

interface RoomExpirationTimerProps {
  roomCreatedAt: Date | string | number;
  timeoutDuration: number; // en milisegundos
}

function RoomExpirationTimerComponent({ roomCreatedAt, timeoutDuration }: RoomExpirationTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(timeoutDuration);
  const [showTooltip, setShowTooltip] = useState(false);

  // Calcular la fecha de expiración una sola vez
  const expirationTime = useMemo(() => {
    const createdAt = new Date(roomCreatedAt).getTime();
    return createdAt + timeoutDuration;
  }, [roomCreatedAt, timeoutDuration]);

  useEffect(() => {
    // Calcular tiempo restante inicial
    const calculateRemaining = () => {
      const now = Date.now();
      const remaining = expirationTime - now;
      return Math.max(0, remaining);
    };

    setTimeRemaining(calculateRemaining());

    // Actualizar cada segundo
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeRemaining(remaining);

      // Limpiar intervalo si llegamos a 0
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expirationTime]);

  // Calcular porcentaje restante
  const percentRemaining = Math.max(0, Math.min(100, (timeRemaining / timeoutDuration) * 100));

  // Formatear tiempo para tooltip
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
    }
    return `${seconds}s`;
  };

  // Determinar color basado en porcentaje
  const getBarColor = (): string => {
    if (percentRemaining > 50) {
      return "bg-indigo-500";
    } else if (percentRemaining > 20) {
      return "bg-amber-500";
    } else {
      return "bg-red-500";
    }
  };

  // Clase de animación para estado crítico
  const getCriticalAnimation = (): string => {
    if (percentRemaining <= 20) {
      return "animate-pulse";
    }
    return "";
  };

  // No renderizar si ya expiró
  if (timeRemaining <= 0) {
    return null;
  }

  return (
    <div 
      className="relative w-full mb-4"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-800 text-xs text-gray-200 rounded-md shadow-lg border border-slate-700 whitespace-nowrap z-10">
          <span className="text-gray-400">Tiempo restante:</span>{" "}
          <span className={percentRemaining <= 20 ? "text-red-400 font-medium" : "text-white"}>
            {formatTime(timeRemaining)}
          </span>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
      )}

      {/* Contenedor de la barra */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer">
        {/* Barra de progreso */}
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${getBarColor()} ${getCriticalAnimation()}`}
          style={{ width: `${percentRemaining}%` }}
        />
      </div>

      {/* Indicador de estado crítico */}
      {percentRemaining <= 20 && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="text-xs text-red-400 animate-pulse">
            ⚠️ La sala se cerrará pronto
          </span>
        </div>
      )}
    </div>
  );
}

// Memo para evitar re-renders innecesarios
const RoomExpirationTimer = memo(RoomExpirationTimerComponent);

export default RoomExpirationTimer;
