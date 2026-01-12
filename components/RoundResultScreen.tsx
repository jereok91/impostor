"use client";

import React, { useEffect, useState } from "react";

interface RoundResultProps {
  isOpen: boolean;
  result: {
    round: number;
    totalRounds: number;
    isTie: boolean;
    eliminatedId: string | null;
    eliminatedName: string | null;
    wasImpostor: boolean;
    gameEnds: boolean;
    winner: "FRIENDS" | "IMPOSTOR" | null;
    voteTallies?: Record<string, number>;
  } | null;
  onContinue: () => void;
}

export default function RoundResultScreen({ isOpen, result, onContinue }: RoundResultProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }
  }, [isOpen]);

  if (!isOpen || !result) return null;

  const getResultContent = () => {
    if (result.isTie) {
      return {
        emoji: "⚖️",
        title: "¡EMPATE EN LA VOTACIÓN!",
        subtitle: "No hubo consenso",
        description: "Nadie fue eliminado esta ronda. El impostor sigue entre nosotros...",
        gradient: "from-amber-900/80 via-amber-800/60 to-amber-900/80",
        borderColor: "border-amber-500/30",
        accentColor: "text-amber-400",
        buttonColor: "bg-amber-600 hover:bg-amber-500",
      };
    }

    if (result.wasImpostor) {
      return {
        emoji: "🎉",
        title: "¡IMPOSTOR DESCUBIERTO!",
        subtitle: `${result.eliminatedName} era el impostor`,
        description: result.gameEnds 
          ? "¡Los amigos han ganado la partida!" 
          : "Pero el juego continúa... ¿habrá más impostores?",
        gradient: "from-emerald-900/80 via-emerald-800/60 to-emerald-900/80",
        borderColor: "border-emerald-500/30",
        accentColor: "text-emerald-400",
        buttonColor: "bg-emerald-600 hover:bg-emerald-500",
      };
    }

    return {
      emoji: "😈",
      title: "ERA INOCENTE...",
      subtitle: `${result.eliminatedName} no era el impostor`,
      description: result.gameEnds 
        ? "El impostor ha logrado sobrevivir. ¡Victoria del impostor!" 
        : "El impostor sigue oculto entre ustedes...",
      gradient: "from-rose-900/80 via-rose-800/60 to-rose-900/80",
      borderColor: "border-rose-500/30",
      accentColor: "text-rose-400",
      buttonColor: "bg-rose-600 hover:bg-rose-500",
    };
  };

  const content = getResultContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop con blur */}
      <div 
        className={`absolute inset-0 bg-slate-950/90 backdrop-blur-md transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      />
      
      {/* Modal */}
      <div 
        className={`
          relative w-full max-w-lg rounded-2xl border ${content.borderColor}
          bg-gradient-to-br ${content.gradient} backdrop-blur-sm
          p-8 shadow-2xl transform transition-all duration-500
          ${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
      >
        {/* Indicador de ronda */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-slate-900 border border-slate-700 rounded-full text-xs text-slate-400">
            Ronda {result.round} de {result.totalRounds}
          </span>
        </div>

        {/* Emoji animado */}
        <div className="text-center mb-6 mt-2">
          <span 
            className="text-8xl inline-block animate-bounce"
            style={{ animationDuration: "1s" }}
          >
            {content.emoji}
          </span>
        </div>

        {/* Título */}
        <h2 className={`text-3xl font-bold text-center mb-2 ${content.accentColor}`}>
          {content.title}
        </h2>

        {/* Subtítulo */}
        {content.subtitle && (
          <p className="text-xl text-center text-slate-200 mb-4 font-medium">
            {content.subtitle}
          </p>
        )}

        {/* Descripción */}
        <p className="text-center text-slate-400 mb-8">
          {content.description}
        </p>

        {/* Estado del juego */}
        {result.gameEnds && (
          <div className={`
            text-center p-4 mb-6 rounded-xl border 
            ${result.winner === "FRIENDS" 
              ? "bg-emerald-950/50 border-emerald-500/30" 
              : "bg-rose-950/50 border-rose-500/30"
            }
          `}>
            <span className="text-2xl mr-2">
              {result.winner === "FRIENDS" ? "👥" : "🕵️"}
            </span>
            <span className={`text-lg font-bold ${
              result.winner === "FRIENDS" ? "text-emerald-400" : "text-rose-400"
            }`}>
              Victoria: {result.winner === "FRIENDS" ? "¡Los Amigos!" : "¡El Impostor!"}
            </span>
          </div>
        )}

        {/* Botón de acción */}
        <button
          onClick={onContinue}
          className={`
            w-full py-4 rounded-xl font-bold text-white text-lg
            transition-all duration-200 transform hover:scale-[1.02]
            ${content.buttonColor}
          `}
        >
          {result.gameEnds ? "Ver Resultados Finales" : "Siguiente Ronda →"}
        </button>
      </div>
    </div>
  );
}
