"use client";

import React from "react";

interface ResultModalProps {
  isOpen: boolean;
  result: {
    type: "impostor_found" | "innocent_eliminated" | "tie" | "no_votes";
    eliminatedName?: string;
    wasImpostor?: boolean;
  } | null;
  onClose: () => void;
}

export default function ResultModal({ isOpen, result, onClose }: ResultModalProps) {
  if (!isOpen || !result) return null;

  const getContent = () => {
    switch (result.type) {
      case "impostor_found":
        return {
          emoji: "🎉",
          title: "¡IMPOSTOR ENCONTRADO!",
          subtitle: `${result.eliminatedName} era el impostor`,
          description: "Los amigos ganan puntos esta ronda",
          bgColor: "from-green-900 via-green-800 to-green-900",
          borderColor: "border-green-500",
          textColor: "text-green-300",
          buttonColor: "bg-green-600 hover:bg-green-500",
        };
      case "innocent_eliminated":
        return {
          emoji: "😈",
          title: "¡ERA INOCENTE!",
          subtitle: `${result.eliminatedName} no era el impostor`,
          description: "El impostor gana puntos esta ronda",
          bgColor: "from-red-900 via-red-800 to-red-900",
          borderColor: "border-red-500",
          textColor: "text-red-300",
          buttonColor: "bg-red-600 hover:bg-red-500",
        };
      case "tie":
        return {
          emoji: "⚖️",
          title: "¡EMPATE!",
          subtitle: "No hubo consenso en la votación",
          description: "Nadie fue eliminado. El impostor sobrevive.",
          bgColor: "from-yellow-900 via-yellow-800 to-yellow-900",
          borderColor: "border-yellow-500",
          textColor: "text-yellow-300",
          buttonColor: "bg-yellow-600 hover:bg-yellow-500",
        };
      case "no_votes":
        return {
          emoji: "🤷",
          title: "SIN VOTOS",
          subtitle: "Nadie votó esta ronda",
          description: "El impostor sigue en el juego",
          bgColor: "from-gray-800 via-gray-700 to-gray-800",
          borderColor: "border-gray-500",
          textColor: "text-gray-300",
          buttonColor: "bg-gray-600 hover:bg-gray-500",
        };
      default:
        return {
          emoji: "❓",
          title: "Resultado",
          subtitle: "",
          description: "",
          bgColor: "from-gray-900 to-gray-800",
          borderColor: "border-gray-500",
          textColor: "text-gray-300",
          buttonColor: "bg-gray-600 hover:bg-gray-500",
        };
    }
  };

  const content = getContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-md rounded-2xl border-4 ${content.borderColor} bg-gradient-to-br ${content.bgColor} p-8 shadow-2xl transform animate-bounce-in`}
        style={{
          animation: "modalIn 0.3s ease-out"
        }}
      >
        {/* Emoji grande */}
        <div className="text-center mb-4">
          <span className="text-8xl">{content.emoji}</span>
        </div>

        {/* Título */}
        <h2 className="text-3xl font-black text-white text-center mb-2">
          {content.title}
        </h2>

        {/* Subtítulo */}
        <p className={`text-xl font-semibold ${content.textColor} text-center mb-2`}>
          {content.subtitle}
        </p>

        {/* Descripción */}
        <p className="text-gray-300 text-center mb-6">
          {content.description}
        </p>

        {/* Botón continuar */}
        <button
          onClick={onClose}
          className={`w-full py-4 rounded-xl font-bold text-white text-lg ${content.buttonColor} transition-all transform hover:scale-105 active:scale-95`}
        >
          Continuar →
        </button>
      </div>

      <style jsx>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
