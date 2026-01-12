"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import useSocket from "../lib/useSocket";
import useGameStore from "../lib/useGameStore";
import { useToast } from "../lib/useToast";

// ============================================
// ESQUEMA DE VALIDACIÓN ZOD
// ============================================

// Función para crear el schema dinámicamente según el número de jugadores
const createGameSettingsSchema = (totalPlayers: number) => {
  // Máximo de impostores: asegurar que siempre haya más amigos que impostores
  // Fórmula: maxImpostors = floor((totalPlayers - 1) / 2)
  // Ejemplo: 5 jugadores -> max 2 impostores (quedan 3 amigos)
  const maxImpostors = Math.max(1, Math.floor((totalPlayers - 1) / 2));

  return z.object({
    rounds: z
      .number()
      .min(1, "Mínimo 1 ronda")
      .max(5, "Máximo 5 rondas"),
    
    impostors: z
      .number()
      .min(1, "Mínimo 1 impostor")
      .max(maxImpostors, `Máximo ${maxImpostors} impostores con ${totalPlayers} jugadores`),
    
    turnTime: z
      .number()
      .min(0, "Tiempo inválido"), // 0 = sin límite
    
    wordPackId: z
      .string()
      .min(1, "Selecciona una categoría"),
    
    showHintToImpostor: z
      .boolean(),
  }).refine(
    (data) => {
      // Validación extra: asegurar que haya suficientes amigos
      const friends = totalPlayers - data.impostors;
      return friends >= data.impostors + 1;
    },
    {
      message: "Debe haber más amigos que impostores",
      path: ["impostors"],
    }
  );
};

type GameSettings = z.infer<ReturnType<typeof createGameSettingsSchema>>;

// ============================================
// OPCIONES DE TIEMPO
// ============================================

const TIME_OPTIONS = [
  { value: 15, label: "15 segundos" },
  { value: 30, label: "30 segundos" },
  { value: 45, label: "45 segundos" },
  { value: 60, label: "1 minuto" },
  { value: 90, label: "1:30 minutos" },
  { value: 120, label: "2 minutos" },
  { value: 0, label: "Sin límite ∞" },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

interface GameSettingsFormProps {
  onStartGame: () => void;
}

export default function GameSettingsForm({ onStartGame }: GameSettingsFormProps) {
  const socket = useSocket();
  const toast = useToast();
  const { players, gameInfo } = useGameStore();
  const [wordPacks, setWordPacks] = useState<{ id: string; name: string; category: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalPlayers = players.length;
  const minPlayers = 3;
  const canStart = totalPlayers >= minPlayers;

  // Crear schema dinámico
  const schema = createGameSettingsSchema(Math.max(totalPlayers, minPlayers));

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<GameSettings>({
    resolver: zodResolver(schema),
    defaultValues: {
      rounds: 3,
      impostors: 1,
      turnTime: 60,
      wordPackId: "",
      showHintToImpostor: true,
    },
    mode: "onChange",
  });

  const watchImpostors = watch("impostors");
  const watchRounds = watch("rounds");

  // Cargar word packs
  useEffect(() => {
    if (!socket) return;
    
    socket.emit("get_word_packs", {}, (res: any) => {
      if (res.ok && res.packs) {
        setWordPacks(res.packs);
        // Seleccionar el primero por defecto
        if (res.packs.length > 0) {
          setValue("wordPackId", res.packs[0].id);
        }
      }
    });
  }, [socket, setValue]);

  // Ajustar impostores si cambia el número de jugadores
  useEffect(() => {
    const maxImpostors = Math.max(1, Math.floor((totalPlayers - 1) / 2));
    if (watchImpostors > maxImpostors) {
      setValue("impostors", maxImpostors);
    }
  }, [totalPlayers, watchImpostors, setValue]);

  // Enviar configuración al servidor
  async function onSubmit(data: GameSettings) {
    if (!socket || !gameInfo.gameId || !canStart) return;
    
    setIsSubmitting(true);

    // Primero actualizar la configuración
    socket.emit("update_config", {
      gameId: gameInfo.gameId,
      config: {
        totalRounds: data.rounds,
        impostorsCount: data.impostors,
        turnTime: data.turnTime,
        wordPackId: data.wordPackId,
        showHintToImpostor: data.showHintToImpostor,
      },
    }, (res: any) => {
      if (!res.ok) {
        toast.error(res.error || "Error al guardar configuración");
        setIsSubmitting(false);
        return;
      }

      // Luego iniciar el juego
      socket.emit("start_game", { gameId: gameInfo.gameId }, (startRes: any) => {
        setIsSubmitting(false);
        if (!startRes.ok) {
          toast.error(startRes.error || "Error al iniciar partida");
        } else {
          onStartGame();
        }
      });
    });
  }

  // Calcular estadísticas del juego
  const friendsCount = totalPlayers - watchImpostors;
  const maxImpostors = Math.max(1, Math.floor((totalPlayers - 1) / 2));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100">Configuración</h3>
          <p className="text-sm text-slate-400">Solo el anfitrión puede modificar</p>
        </div>
      </div>

      {/* Stats del juego */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="text-center">
          <div className="text-2xl font-bold text-violet-400">{totalPlayers}</div>
          <div className="text-xs text-slate-400">Jugadores</div>
        </div>
        <div className="text-center border-x border-slate-700">
          <div className="text-2xl font-bold text-emerald-400">{friendsCount}</div>
          <div className="text-xs text-slate-400">Amigos</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-rose-400">{watchImpostors}</div>
          <div className="text-xs text-slate-400">Impostores</div>
        </div>
      </div>

      {/* Número de Rondas */}
      <div className="space-y-2">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">Número de Rondas</span>
          <span className="text-sm text-violet-400 font-bold">{watchRounds}</span>
        </label>
        <Controller
          name="rounds"
          control={control}
          render={({ field }) => (
            <div className="space-y-2">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={field.value}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>
          )}
        />
        {errors.rounds && (
          <p className="text-xs text-rose-400">{errors.rounds.message}</p>
        )}
      </div>

      {/* Número de Impostores */}
      <div className="space-y-2">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">Impostores</span>
          <span className="text-xs text-slate-500">Máx: {maxImpostors}</span>
        </label>
        <Controller
          name="impostors"
          control={control}
          render={({ field }) => (
            <div className="flex gap-2">
              {Array.from({ length: maxImpostors }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => field.onChange(num)}
                  className={`
                    flex-1 py-3 rounded-xl font-bold transition-all
                    ${field.value === num
                      ? "bg-rose-600 text-white ring-2 ring-rose-400 ring-offset-2 ring-offset-slate-900"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }
                  `}
                >
                  {num}
                </button>
              ))}
            </div>
          )}
        />
        {errors.impostors && (
          <p className="text-xs text-rose-400">{errors.impostors.message}</p>
        )}
        {totalPlayers < minPlayers && (
          <p className="text-xs text-amber-400">
            ⚠️ Necesitas al menos {minPlayers} jugadores
          </p>
        )}
      </div>

      {/* Tiempo por Turno */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200">
          Tiempo para dar pista
        </label>
        <Controller
          name="turnTime"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-4 gap-2">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => field.onChange(opt.value)}
                  className={`
                    py-2 px-2 rounded-lg text-xs font-medium transition-all
                    ${field.value === opt.value
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      {/* Categoría de Palabras */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200">
          Categoría de palabras
        </label>
        <Controller
          name="wordPackId"
          control={control}
          render={({ field }) => (
            <select
              value={field.value}
              onChange={field.onChange}
              className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:border-violet-500 focus:outline-none transition appearance-none cursor-pointer"
            >
              <option value="" disabled>Seleccionar categoría...</option>
              {wordPacks.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name} — {pack.category}
                </option>
              ))}
              {wordPacks.length === 0 && (
                <option value="default">Mix Aleatorio (Default)</option>
              )}
            </select>
          )}
        />
        {errors.wordPackId && (
          <p className="text-xs text-rose-400">{errors.wordPackId.message}</p>
        )}
      </div>

      {/* Ayuda al Impostor */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div>
          <div className="text-sm font-medium text-slate-200">Ayuda al Impostor</div>
          <div className="text-xs text-slate-400">El impostor verá la categoría de la palabra</div>
        </div>
        <Controller
          name="showHintToImpostor"
          control={control}
          render={({ field }) => (
            <button
              type="button"
              onClick={() => field.onChange(!field.value)}
              className={`
                relative w-14 h-8 rounded-full transition-colors
                ${field.value ? "bg-violet-600" : "bg-slate-700"}
              `}
            >
              <div
                className={`
                  absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform
                  ${field.value ? "translate-x-7" : "translate-x-1"}
                `}
              />
            </button>
          )}
        />
      </div>

      {/* Botón de Iniciar */}
      <button
        type="submit"
        disabled={!canStart || !isValid || isSubmitting}
        className={`
          w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3
          ${canStart && isValid && !isSubmitting
            ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-600/30"
            : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }
        `}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Iniciando...
          </>
        ) : canStart ? (
          <>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Iniciar Partida
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Esperando jugadores ({totalPlayers}/{minPlayers})
          </>
        )}
      </button>

      {/* Info adicional */}
      {canStart && (
        <p className="text-center text-xs text-slate-500">
          Duración estimada: ~{watchRounds * 3} minutos
        </p>
      )}
    </form>
  );
}
