import { Server as IOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";

type Phase = "WAITING" | "DEALING" | "CLUES" | "VOTING" | "RESULTS" | "FINISHED";

export default class GameManager {
  gameId: string;
  io: IOServer;
  prisma: PrismaClient;
  phase: Phase = "WAITING";
  players: string[] = []; // playerIds in memory
  roundNumber = 0;
  secretWord?: string;
  private clues: Record<string, string> = {};
  private votes: Record<string, string> = {};

  constructor(gameId: string, io: IOServer, prisma: PrismaClient) {
    this.gameId = gameId;
    this.io = io;
    this.prisma = prisma;
  }

  addPlayer(playerId: string) {
    if (!this.players.includes(playerId)) this.players.push(playerId);
    this.broadcastRoomUpdate();
  }

  async startGame() {
    const game = await this.prisma.gameSession.findUnique({ where: { id: this.gameId }, include: { players: true } });
    if (!game) throw new Error("Game not found");
    this.phase = "DEALING";
    this.roundNumber = 1;
    await this.assignRoles(game.players.map((p) => p.id), game.impostorsCount);
    await this.dealWords();
    this.emitPhase();
  }

  private async assignRoles(playerIds: string[], impostorsCount: number) {
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const impostors = new Set(shuffled.slice(0, impostorsCount));
    for (const pid of playerIds) {
      await this.prisma.player.update({ where: { id: pid }, data: { role: impostors.has(pid) ? "IMPOSTOR" : "FRIEND" } });
    }
  }

  private async dealWords() {
    const pack = await this.prisma.wordPack.findFirst();
    const word = pack?.words?.[Math.floor(Math.random() * (pack.words.length || 1))] ?? "palabra";
    this.secretWord = word;
    const players = await this.prisma.player.findMany({ where: { gameId: this.gameId } });
    for (const p of players) {
      if (p.role === "FRIEND") {
        this.io.to(this.gameId).emit("deal_word_" + p.id, { word });
      } else {
        this.io.to(this.gameId).emit("deal_word_" + p.id, { category: pack?.category ?? "Categoria" });
      }
    }
    this.phase = "CLUES";
    this.emitPhase();
  }

  async submitClue(playerId: string, clue: string) {
    if (this.phase !== "CLUES") throw new Error("Not in clues phase");
    this.clues[playerId] = clue;
    await this.prisma.player.update({ where: { id: playerId }, data: { clues: { push: { round: this.roundNumber, text: clue } } as any } });
    const players = await this.prisma.player.findMany({ where: { gameId: this.gameId } });
    const submittedCount = Object.keys(this.clues).length;
    if (submittedCount >= players.length) {
      this.phase = "VOTING";
      this.emitPhase();
    } else {
      this.io.to(this.gameId).emit("clue_received", { from: playerId });
    }
  }

  async submitVote(voterId: string, votedForId: string) {
    if (this.phase !== "VOTING") throw new Error("Not in voting phase");
    this.votes[voterId] = votedForId;
    await this.prisma.vote.create({
      data: {
        roundId: "TEMP",
        voterId,
        votedForId,
      },
    }).catch(() => {});
    const players = await this.prisma.player.findMany({ where: { gameId: this.gameId } });
    if (Object.keys(this.votes).length >= players.length) {
      await this.tallyVotes();
    }
  }

  private async tallyVotes() {
    const tallies: Record<string, number> = {};
    for (const v of Object.values(this.votes)) tallies[v] = (tallies[v] || 0) + 1;
    const entries = Object.entries(tallies);
    if (entries.length === 0) {
      this.io.to(this.gameId).emit("voting_result", { result: "NO_VOTES" });
      this.resetRoundState();
      return;
    }
    entries.sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = entries[0] ?? [null, 0];
    const ties = entries.filter((e) => e[1] === topCount);
    if (ties.length > 1) {
      this.io.to(this.gameId).emit("voting_result", { result: "TIE" });
    } else {
      const player = await this.prisma.player.findUnique({ where: { id: topId } });
      const wasImpostor = player?.role === "IMPOSTOR";
      this.io.to(this.gameId).emit("voting_result", { eliminated: topId, wasImpostor });
      // update scores (basic): friends +2 if correct, impostor +2 per survive etc.
      if (wasImpostor) {
        // award friends
        const friends = await this.prisma.player.findMany({ where: { gameId: this.gameId, role: "FRIEND" } });
        for (const f of friends) {
          await this.prisma.player.update({ where: { id: f.id }, data: { score: { increment: 2 } as any } }).catch(() => {});
        }
      } else {
        // impostor survived, award impostor
        const impostors = await this.prisma.player.findMany({ where: { gameId: this.gameId, role: "IMPOSTOR" } });
        for (const im of impostors) {
          await this.prisma.player.update({ where: { id: im.id }, data: { score: { increment: 2 } as any } }).catch(() => {});
        }
      }
    }
    this.resetRoundState();
  }

  private resetRoundState() {
    this.clues = {};
    this.votes = {};
    this.roundNumber += 1;
    this.phase = this.roundNumber <= 3 ? "DEALING" : "FINISHED";
    this.emitPhase();
  }

  async addPlayerToDB(playerId: string) {
    await this.prisma.player.update({ where: { id: playerId }, data: { isConnected: true } });
  }

  private emitPhase() {
    this.io.to(this.gameId).emit("phase_change", { phase: this.phase, round: this.roundNumber });
  }

  private broadcastRoomUpdate() {
    this.io.to(this.gameId).emit("room_update", { gameId: this.gameId, players: this.players });
  }
}
