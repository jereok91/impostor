"use client";

import React, { useState, useEffect } from "react";

interface SecretCardProps {
  isImpostor: boolean;
  secretWord?: string;
  category?: string;
  showHintToImpostor: boolean;
}

export default function SecretCard({ isImpostor, secretWord, category, showHintToImpostor }: SecretCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [autoFlipTimer, setAutoFlipTimer] = useState<NodeJS.Timeout | null>(null);

  // Auto voltear después de 4 segundos
  useEffect(() => {
    if (isFlipped) {
      const timer = setTimeout(() => {
        setIsFlipped(false);
      }, 4000);
      setAutoFlipTimer(timer);
      return () => clearTimeout(timer);
    }
  }, [isFlipped]);

  function handleClick() {
    if (!isFlipped) {
      setIsFlipped(true);
    }
  }

  return (
    <div className="perspective-1000 w-full max-w-sm mx-auto">
      <div
        onClick={handleClick}
        className={`relative w-full h-56 cursor-pointer transition-transform duration-500 transform-style-3d ${
          isFlipped ? "rotate-y-180" : ""
        }`}
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.6s",
        }}
      >
        {/* Cara trasera (la que se muestra primero) */}
        <div
          className="absolute w-full h-full rounded-xl border-2 border-violet-500 bg-gradient-to-br from-violet-900 to-violet-700 flex flex-col items-center justify-center shadow-lg shadow-violet-500/30"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-6xl mb-4">🎴</div>
          <div className="text-white font-bold text-xl">Tu Tarjeta Secreta</div>
          <div className="text-violet-300 text-sm mt-2">Toca para revelar</div>
          
          {/* Indicador de temporizador */}
          <div className="absolute bottom-4 text-violet-400 text-xs">
            Se ocultará en 4 segundos
          </div>
        </div>

        {/* Cara frontal (contenido secreto) */}
        <div
          className={`absolute w-full h-full rounded-xl border-4 flex flex-col items-center justify-center shadow-xl ${
            isImpostor 
              ? "border-green-500 bg-gradient-to-br from-green-900 via-green-800 to-green-900 shadow-red-500/50" 
              : "border-green-500 bg-gradient-to-br from-green-900 via-green-800 to-green-900 shadow-green-500/50"
          }`}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {isImpostor ? (
            <>
              <div className="text-6xl mb-3">🕵️</div>
              <div className="text-green-300 text-lg font-bold mb-1">¡ERES EL!</div>
              <div className="text-white font-black text-sm mb-3 tracking-wider" style={{ textShadow: "0 0 20px rgba(239, 68, 68, 0.8)" }}>IMPOSTOR</div>
              
              {showHintToImpostor && category ? (
                <div className="mt-2 px-4 py-2 bg-black/40 rounded-lg border border-green-500/50">
                  <div className="text-green-300 text-xs">Pista - Categoría:</div>
                  <div className="text-white font-semibold text-lg">{category}</div>
                </div>
              ) : (
                <div className="text-green-200 text-sm text-center px-4">
                  Finge que conoces la palabra.<br/>
                  ¡No te descubran!
                </div>
              )}

              {/* Barra de progreso */}
              {isFlipped && (
                <div className="absolute -bottom-4 left-4 right-6">
                  <div className="h-1 bg-green-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-400 animate-shrink-width"
                      style={{
                        animation: "shrink 4s linear forwards"
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-6xl mb-3">👥</div>
              <div className="text-green-300 text-lg font-bold mb-1">TU PALABRA SECRETA:</div>
              <div className="text-white font-black text-3xl mb-3 px-4 text-center" style={{ textShadow: "0 0 20px rgba(34, 197, 94, 0.8)" }}>{secretWord}</div>
              
              <div className="text-green-200 text-sm text-center px-4 bg-black/30 py-2 rounded-lg">
                Da pistas sin revelar la palabra.<br/>
                ¡Encuentra al impostor!
              </div>

              {/* Barra de progreso */}
              {isFlipped && (
                <div className="absolute -bottom-4 left-4 right-4">
                  <div className="h-1 bg-green-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-400"
                      style={{
                        animation: "shrink 4s linear forwards"
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Instrucción */}
      <div className="text-center mt-4 text-gray-400 text-sm">
        {isFlipped ? "La tarjeta se ocultará automáticamente..." : "Toca la tarjeta para ver tu rol"}
      </div>
    </div>
  );
}
