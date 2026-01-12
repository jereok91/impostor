"use client";
import React from "react";

export default function PlayerCard({ player }: { player: any }) {
  return (
    <div className="p-3 rounded bg-gray-800 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-white">{player.nickname}</div>
          <div className="text-sm text-gray-400">{player.isHost ? 'Anfitrión' : 'Jugador'}</div>
        </div>
        <div className="text-green-400 font-semibold">{player.score ?? 0} pts</div>
      </div>
    </div>
  );
}
