const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: IOServer } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const GameManager = require('./src/server/gameManager');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// Map gameId -> GameManager instance (memory)
const games = new Map();

function generateRoomCode(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Attach Socket.io to the same server
  const io = new IOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('socket connected:', socket.id);

    socket.on('create_room', async (payload, cb) => {
      console.log('create_room:', payload);
      try {
        const { nickname, rounds = 3, impostors = 1, showHintToImpostor = true } = payload;
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
        // Configurar el GameManager con los valores iniciales
        gm.updateConfig({
          totalRounds: rounds,
          impostorsCount: impostors,
          showHintToImpostor
        });
        gm.addPlayer(player.id, socket.id);
        games.set(game.id, gm);

        socket.join(game.id);
        socket.data.userId = user.id;
        socket.data.playerId = player.id;
        socket.data.gameId = game.id;

        cb({ ok: true, gameId: game.id, code, playerId: player.id, config: gm.getConfig() });
        io.to(game.id).emit('room_update', { 
          gameId: game.id, 
          players: [{ id: player.id, nickname, isHost: true }],
          config: gm.getConfig()
        });
      } catch (err) {
        console.error('create_room error:', err);
        cb({ ok: false, error: err.message });
      }
    });

    socket.on('join_room', async (payload, cb) => {
      console.log('join_room:', payload);
      try {
        const { code, nickname } = payload;
        const game = await prisma.gameSession.findUnique({ where: { code } });
        if (!game) return cb({ ok: false, error: 'Sala no encontrada' });

        // Si el juego ya empezó, no permitir nuevos jugadores
        if (game.status !== 'WAITING') {
          return cb({ ok: false, error: 'La partida ya ha comenzado. Espera a que termine para unirte.' });
        }

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
        socket.data.gameId = game.id;

        if (!games.has(game.id)) {
          games.set(game.id, new GameManager(game.id, io, prisma));
        }
        const gm = games.get(game.id);
        gm.addPlayer(player.id, socket.id);

        // Obtener todos los jugadores de la sala
        const allPlayers = await prisma.player.findMany({
          where: { gameId: game.id },
          select: { id: true, nickname: true, isHost: true, score: true }
        });

        cb({ ok: true, gameId: game.id, code: game.code, playerId: player.id });
        io.to(game.id).emit('room_update', { gameId: game.id, players: allPlayers });
      } catch (err) {
        console.error('join_room error:', err);
        cb({ ok: false, error: err.message });
      }
    });

    // Reconectar a una sala existente
    socket.on('rejoin_room', async (payload, cb) => {
      console.log('rejoin_room:', payload);
      try {
        const { playerId, gameId, code } = payload;
        
        // Verificar que el jugador existe y pertenece a la sala
        const player = await prisma.player.findUnique({
          where: { id: playerId },
          include: { game: true }
        });
        
        if (!player || player.gameId !== gameId || player.game.code !== code) {
          return cb({ ok: false, error: 'Sesión inválida' });
        }

        // Verificar que el juego aún existe
        const game = player.game;
        if (!game) {
          return cb({ ok: false, error: 'La sala ya no existe' });
        }

        // Unir al socket a la sala
        socket.join(game.id);
        socket.data.playerId = player.id;
        socket.data.gameId = game.id;
        socket.data.userId = player.userId;

        // Asegurar que existe el GameManager
        if (!games.has(game.id)) {
          const gm = new GameManager(game.id, io, prisma);
          games.set(game.id, gm);
        }
        const gm = games.get(game.id);
        gm.addPlayer(player.id, socket.id);

        // Obtener todos los jugadores
        const allPlayers = await prisma.player.findMany({
          where: { gameId: game.id },
          select: { id: true, nickname: true, isHost: true, score: true }
        });

        // Obtener las pistas enviadas en esta ronda desde el GameManager
        let cluesList = [];
        if (gm.clues && Object.keys(gm.clues).length > 0) {
          // Las pistas están en memoria en el GameManager como objeto { playerId: text }
          const playerIds = Object.keys(gm.clues);
          const playersWithClues = await prisma.player.findMany({
            where: { id: { in: playerIds } },
            select: { id: true, nickname: true }
          });
          const nicknameMap = {};
          playersWithClues.forEach(p => { nicknameMap[p.id] = p.nickname; });
          
          cluesList = playerIds.map(pid => ({
            playerId: pid,
            nickname: nicknameMap[pid] || 'Anónimo',
            text: gm.clues[pid]
          }));
        }

        // Si el juego está en progreso, obtener la carta del jugador
        let card = null;
        if (game.status !== 'WAITING') {
          card = await gm.getCardForPlayer(playerId);
        }

        const config = gm.getConfig();

        cb({ 
          ok: true, 
          gameId: game.id, 
          code: game.code, 
          phase: game.status, // Usar status de la DB, enviarlo como "phase" al cliente
          round: gm.currentRound || game.currentRound,
          totalRounds: config.totalRounds,
          config: config,
          players: allPlayers,
          card: card, // Incluir la carta si existe
          clues: cluesList // Incluir las pistas enviadas
        });

        // Notificar a todos que el jugador se reconectó
        io.to(game.id).emit('room_update', { gameId: game.id, players: allPlayers, config });
        console.log(`Player ${player.nickname} reconnected to room ${code} (status: ${game.status})`);
      } catch (err) {
        console.error('rejoin_room error:', err);
        cb({ ok: false, error: err.message });
      }
    });

    socket.on('start_game', async (payload, cb) => {
      console.log('start_game:', payload);
      try {
        const { gameId } = payload;
        const gm = games.get(gameId);
        if (!gm) {
          console.log('Game not found in memory:', gameId);
          return cb({ ok: false, error: 'Game not found' });
        }
        
        // Validar que tenemos el playerId
        if (!socket.data.playerId) {
          return cb({ ok: false, error: 'Sesión no válida. Por favor recarga la página.' });
        }
        
        // Validar que el jugador que intenta iniciar es el anfitrión
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return cb({ ok: false, error: 'Solo el anfitrión puede iniciar la partida' });
        }
        
        // Validar usando la lógica del GameManager
        const playerCount = await prisma.player.count({ where: { gameId } });
        const validation = gm.canStartGame(playerCount);
        if (!validation.canStart) {
          return cb({ ok: false, error: validation.message });
        }
        
        await gm.startGame();
        console.log('Game started successfully');
        cb({ ok: true });
      } catch (err) {
        console.error('start_game error:', err);
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

    // Endpoint para que el cliente pida su tarjeta
    socket.on('get_my_card', async (payload, cb) => {
      const { gameId, playerId } = payload;
      console.log('get_my_card:', payload);
      const gm = games.get(gameId);
      if (!gm) return cb({ ok: false, error: 'Game not found' });
      try {
        const card = await gm.getCardForPlayer(playerId);
        if (card) {
          cb({ ok: true, card });
        } else {
          cb({ ok: false, error: 'Card not found' });
        }
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

    // Obtener packs de palabras disponibles
    socket.on('get_word_packs', async (payload, cb) => {
      try {
        const packs = await prisma.wordPack.findMany({
          select: {
            id: true,
            name: true,
            category: true,
          },
          orderBy: { name: 'asc' }
        });
        
        // Si no hay packs, devolver uno por defecto
        if (packs.length === 0) {
          cb({ ok: true, packs: [{ id: 'default', name: 'Mix Aleatorio', category: 'General' }] });
        } else {
          cb({ ok: true, packs });
        }
      } catch (err) {
        cb({ ok: false, error: err.message });
      }
    });

    // Actualizar configuración del ciclo (solo host)
    socket.on('update_config', async (payload, cb) => {
      const { gameId, config } = payload;
      const gm = games.get(gameId);
      if (!gm) return cb({ ok: false, error: 'Game not found' });
      
      try {
        // Validar que el jugador es el host
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return cb({ ok: false, error: 'Solo el anfitrión puede cambiar la configuración' });
        }
        
        const newConfig = gm.updateConfig(config);
        cb({ ok: true, config: newConfig });
      } catch (err) {
        cb({ ok: false, error: err.message });
      }
    });

    // Obtener información de validación para iniciar
    socket.on('get_start_validation', async (payload, cb) => {
      const { gameId } = payload;
      const gm = games.get(gameId);
      if (!gm) return cb({ ok: false, error: 'Game not found' });
      
      try {
        const playerCount = await prisma.player.count({ where: { gameId } });
        const validation = gm.canStartGame(playerCount);
        cb({ ok: true, ...validation, config: gm.getConfig() });
      } catch (err) {
        cb({ ok: false, error: err.message });
      }
    });

    // Reiniciar partida (solo host)
    socket.on('restart_match', async (payload, cb) => {
      const { gameId } = payload;
      const gm = games.get(gameId);
      if (!gm) return cb({ ok: false, error: 'Game not found' });
      
      try {
        // Validar que el jugador es el host
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return cb({ ok: false, error: 'Solo el anfitrión puede reiniciar la partida' });
        }
        
        await gm.restartMatch();
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: err.message });
      }
    });

    // Salir de la sala voluntariamente
    socket.on('leave_room', async (payload, cb) => {
      const { gameId } = payload;
      const playerId = socket.data.playerId;
      
      if (!playerId || !gameId) {
        return cb?.({ ok: false, error: 'No session' });
      }

      try {
        const player = await prisma.player.findUnique({ 
          where: { id: playerId },
          select: { nickname: true, isHost: true }
        });
        
        if (player) {
          // Notificar a la sala que el jugador se fue
          io.to(gameId).emit('player_left', { 
            playerId, 
            nickname: player.nickname,
            wasHost: player.isHost 
          });

          // Si era el host, transferir a otro
          if (player.isHost) {
            const nextHost = await prisma.player.findFirst({
              where: { gameId, id: { not: playerId } },
              orderBy: { createdAt: 'asc' }
            });
            if (nextHost) {
              await prisma.player.update({
                where: { id: nextHost.id },
                data: { isHost: true }
              });
              io.to(gameId).emit('host_changed', { 
                newHostId: nextHost.id, 
                newHostName: nextHost.nickname 
              });
            }
          }

          // Eliminar al jugador de la DB
          await prisma.player.delete({ where: { id: playerId } });

          // Actualizar GameManager si existe
          const gm = games.get(gameId);
          if (gm) {
            gm.removePlayer(playerId);
          }

          // Emitir lista actualizada
          const remainingPlayers = await prisma.player.findMany({ 
            where: { gameId },
            select: { id: true, nickname: true, isHost: true, score: true }
          });
          io.to(gameId).emit('room_update', { players: remainingPlayers });
        }

        // Sacar el socket de la sala
        socket.leave(gameId);
        socket.data.playerId = null;
        socket.data.gameId = null;

        cb?.({ ok: true });
      } catch (err) {
        console.error('Error leaving room:', err);
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', async () => {
      console.log('disconnected:', socket.id);
      const playerId = socket.data.playerId;
      const gameId = socket.data.gameId;
      
      if (playerId && gameId) {
        try {
          // Obtener el jugador para saber a qué sala pertenece
          const player = await prisma.player.findUnique({ where: { id: playerId } });
          if (player) {
            const gm = games.get(gameId);
            
            // NO eliminar el jugador de la DB - solo marcar como desconectado
            // Esto permite reconexión al recargar la página
            if (gm) {
              gm.removePlayer(playerId);
            }
            
            // Esperar un poco antes de considerar al jugador como "ido"
            // Esto permite reconexiones rápidas (recargar página)
            setTimeout(async () => {
              try {
                // Verificar si el jugador se reconectó
                const gmCheck = games.get(gameId);
                if (gmCheck && gmCheck.isPlayerConnected(playerId)) {
                  console.log(`Player ${player.nickname} reconnected, not removing`);
                  return;
                }
                
                // Si el jugador era el host, transferir el rol a otro jugador conectado
                if (player.isHost) {
                  // Buscar otro jugador conectado para ser el nuevo host
                  const otherPlayers = await prisma.player.findMany({
                    where: { gameId, id: { not: playerId } }
                  });
                  
                  // Encontrar uno que esté conectado (tiene socket activo)
                  let newHost = null;
                  for (const p of otherPlayers) {
                    if (gmCheck && gmCheck.isPlayerConnected(p.id)) {
                      newHost = p;
                      break;
                    }
                  }
                  
                  if (newHost) {
                    await prisma.player.update({
                      where: { id: newHost.id },
                      data: { isHost: true }
                    });
                    console.log(`Host transferred from ${player.nickname} to ${newHost.nickname}`);
                    
                    // Notificar del cambio de host
                    io.to(gameId).emit('host_changed', { 
                      newHostId: newHost.id, 
                      newHostNickname: newHost.nickname 
                    });
                  }
                }
                
                // Ahora sí eliminar el jugador de la DB (después del timeout)
                await prisma.player.delete({ where: { id: playerId } }).catch(() => {});
                
                // Eliminar el usuario invitado
                const userId = socket.data.userId;
                if (userId) {
                  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
                }
                
                // Obtener jugadores restantes
                const remainingPlayers = await prisma.player.findMany({
                  where: { gameId },
                  select: { id: true, nickname: true, isHost: true, score: true }
                });
                
                // Notificar a todos en la sala
                io.to(gameId).emit('room_update', { gameId, players: remainingPlayers });
                io.to(gameId).emit('player_left', { playerId, nickname: player.nickname });
                
                console.log(`Player ${player.nickname} removed from game ${gameId}. Remaining: ${remainingPlayers.length}`);
                
                // Si no quedan jugadores, limpiar el GameManager y la sesión
                if (remainingPlayers.length === 0) {
                  games.delete(gameId);
                  await prisma.gameSession.delete({ where: { id: gameId } }).catch(() => {});
                  console.log(`Game ${gameId} deleted - no players remaining`);
                }
              } catch (err) {
                console.error('Error in delayed disconnect cleanup:', err);
              }
            }, 5000); // 5 segundos de gracia para reconectar
          }
        } catch (err) {
          console.error('Error handling disconnect:', err);
        }
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Server ready on http://${hostname}:${port}`);
    console.log(`> Socket.io running on same port`);
  });
});
