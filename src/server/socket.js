const express = require('express');
const http = require('http');
const { Server: IOServer } = require('socket.io');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const GameManager = require('./gameManager');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = Number(process.env.SOCKET_PORT) || 4000;

// Map gameId -> GameManager instance (memory)
const games = new Map();

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('create_room', async (payload, cb) => {
    try {
      const { nickname, rounds = 3, impostors = 1 } = payload;
      const user = await prisma.user.create({ data: { nickname } });
      const code = generateRoomCode();
      const game = await prisma.gameSession.create({
        data: {
          code,
          hostId: user.id,
          roundsTotal: rounds,
          impostorsCount: impostors,
        },
      });
      const player = await prisma.player.create({
        data: {
          userId: user.id,
          gameId: game.id,
          nickname,
          isHost: true,
        },
      });

      const gm = new GameManager(game.id, io, prisma);
      games.set(game.id, gm);

      socket.join(game.id);
      socket.data.userId = user.id;
      socket.data.playerId = player.id;

      cb({ ok: true, gameId: game.id, code });
      io.to(game.id).emit('room_update', { gameId: game.id, players: [{ id: player.id, nickname }] });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('join_room', async (payload, cb) => {
    console.log('join_room:', payload);
    try {
      const { code, nickname } = payload;
      const game = await prisma.gameSession.findUnique({ where: { code } });
      if (!game) return cb({ ok: false, error: 'Room not found' });

      const user = await prisma.user.create({ data: { nickname } });
      const player = await prisma.player.create({
        data: {
          userId: user.id,
          gameId: game.id,
          nickname,
        },
      });

      socket.join(game.id);
      socket.data.userId = user.id;
      socket.data.playerId = player.id;

      if (!games.has(game.id)) {
        games.set(game.id, new GameManager(game.id, io, prisma));
      }
      const gm = games.get(game.id);
      gm.addPlayer(player.id);

      // Obtener todos los jugadores de la sala
      const allPlayers = await prisma.player.findMany({
        where: { gameId: game.id },
        select: { id: true, nickname: true, isHost: true, score: true }
      });

      cb({ ok: true, gameId: game.id, code: game.code });
      // Emitir lista completa de jugadores a todos en la sala
      io.to(game.id).emit('room_update', { gameId: game.id, players: allPlayers });
    } catch (err) {
      console.error('join_room error:', err);
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('start_game', async (payload, cb) => {
    try {
      const { gameId } = payload;
      const gm = games.get(gameId);
      if (!gm) return cb({ ok: false, error: 'Game not found' });
      await gm.startGame();
      cb({ ok: true });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('send_clue', async (payload, cb) => {
    const { gameId, clue } = payload;
    const gm = games.get(gameId);
    if (!gm) return cb({ ok: false, error: 'Game not found' });
    try {
      await gm.submitClue(socket.data.playerId, clue);
      cb({ ok: true });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('submit_vote', async (payload, cb) => {
    const { gameId, votedForPlayerId } = payload;
    const gm = games.get(gameId);
    if (!gm) return cb({ ok: false, error: 'Game not found' });
    try {
      await gm.submitVote(socket.data.playerId, votedForPlayerId);
      cb({ ok: true });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id);
  });
});

// Escuchar en todas las interfaces (0.0.0.0) para que dispositivos en la red local puedan conectarse
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.io server listening on port ${PORT} (all interfaces)`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://192.168.44.226:${PORT}`);
});

function generateRoomCode(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
