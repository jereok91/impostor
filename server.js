const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: IOServer } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const GameManager = require('./src/server/gameManager');
const { sanitizeError, createSafeCallback, validateRequired, validateId, USER_FRIENDLY_MESSAGES } = require('./src/server/errorHandler');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// TTL para salas inactivas (por defecto 10 minutos)
const LOBBY_TIMEOUT_MS = parseInt(process.env.LOBBY_TIMEOUT_SECONDS || '600', 10) * 1000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// Map gameId -> GameManager instance (memory)
const games = new Map();

// Map gameId -> NodeJS.Timeout (timers de expiración de sala)
const roomTimers = new Map();

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

  /**
   * Inicia el temporizador de expiración para una sala
   * @param {string} gameId - ID del juego
   */
  function startRoomTimer(gameId) {
    // Cancelar timer existente si hay uno
    clearRoomTimer(gameId);
    
    const timeoutMs = LOBBY_TIMEOUT_MS;
    console.log(`[TTL] Starting ${timeoutMs / 1000}s timer for room ${gameId}`);
    
    const timer = setTimeout(async () => {
      console.log(`[TTL] Room ${gameId} expired due to inactivity`);
      await expireRoom(gameId);
    }, timeoutMs);
    
    roomTimers.set(gameId, timer);
  }

  /**
   * Cancela el temporizador de expiración de una sala
   * @param {string} gameId - ID del juego
   */
  function clearRoomTimer(gameId) {
    const timer = roomTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      roomTimers.delete(gameId);
      console.log(`[TTL] Timer cleared for room ${gameId}`);
    }
  }

  /**
   * Expira una sala por inactividad
   * @param {string} gameId - ID del juego
   */
  async function expireRoom(gameId) {
    try {
      // 1. Notificar a todos los sockets en la sala
      io.to(gameId).emit('room_expired', { 
        reason: 'La sala se cerró por inactividad.',
        gameId 
      });

      // 2. Obtener todos los sockets en la sala y desconectarlos de la room
      const sockets = await io.in(gameId).fetchSockets();
      for (const s of sockets) {
        s.leave(gameId);
        s.data.gameId = null;
        s.data.playerId = null;
      }

      // 3. Eliminar jugadores de la DB
      await prisma.player.deleteMany({ where: { gameId } }).catch(() => {});

      // 4. Actualizar estado del juego en DB (marcar como expirado/eliminado)
      await prisma.gameSession.update({
        where: { id: gameId },
        data: { status: 'FINISHED' }
      }).catch(() => {});

      // 5. Limpiar memoria
      games.delete(gameId);
      roomTimers.delete(gameId);

      console.log(`[TTL] Room ${gameId} cleaned up successfully`);
    } catch (err) {
      console.error(`[TTL] Error expiring room ${gameId}:`, err.message);
    }
  }

  io.on('connection', (socket) => {
    console.log('socket connected:', socket.id);

    socket.on('create_room', async (payload, cb) => {
      console.log('create_room:', payload);
      const safe = createSafeCallback(cb, 'create_room');
      
      // Validación de entrada
      const validation = validateRequired(payload, ['nickname']);
      if (!validation.valid) {
        return safe.validationError('El nickname es requerido');
      }
      
      try {
        const { nickname, rounds = 3, impostors = 1, showHintToImpostor = true } = payload;
        
        // Validar nickname no vacío
        if (nickname.trim().length === 0) {
          return safe.validationError('El nickname no puede estar vacío');
        }
        
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

        // Iniciar timer de expiración de sala
        startRoomTimer(game.id);

        socket.join(game.id);
        socket.data.userId = user.id;
        socket.data.playerId = player.id;
        socket.data.gameId = game.id;

        safe.success({ gameId: game.id, code, playerId: player.id, config: gm.getConfig() });
        io.to(game.id).emit('room_update', { 
          gameId: game.id, 
          players: [{ id: player.id, nickname, isHost: true }],
          config: gm.getConfig()
        });
      } catch (err) {
        safe.error(err, 'Error al crear la sala. Intenta de nuevo.');
      }
    });

    socket.on('join_room', async (payload, cb) => {
      console.log('join_room:', payload);
      const safe = createSafeCallback(cb, 'join_room');
      
      // Validación de entrada
      const validation = validateRequired(payload, ['code', 'nickname']);
      if (!validation.valid) {
        return safe.validationError('El código y el nickname son requeridos');
      }
      
      try {
        const { code, nickname } = payload;
        
        // Validaciones básicas
        if (nickname.trim().length === 0) {
          return safe.validationError('El nickname no puede estar vacío');
        }
        
        const game = await prisma.gameSession.findUnique({ where: { code } });
        if (!game) return safe.validationError(USER_FRIENDLY_MESSAGES.ROOM_NOT_FOUND);

        // Si el juego ya empezó, no permitir nuevos jugadores
        if (game.status !== 'WAITING') {
          return safe.validationError('La partida ya ha comenzado. Espera a que termine para unirte.');
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

        safe.success({ gameId: game.id, code: game.code, playerId: player.id });
        io.to(game.id).emit('room_update', { gameId: game.id, players: allPlayers });
      } catch (err) {
        safe.error(err, 'Error al unirse a la sala. Intenta de nuevo.');
      }
    });

    // Reconectar a una sala existente
    socket.on('rejoin_room', async (payload, cb) => {
      console.log('rejoin_room:', payload);
      const safe = createSafeCallback(cb, 'rejoin_room');
      
      // Validación de entrada
      const validation = validateRequired(payload, ['playerId', 'gameId', 'code']);
      if (!validation.valid) {
        return safe.validationError('Sesión inválida');
      }
      
      try {
        const { playerId, gameId, code } = payload;
        
        // Verificar que el jugador existe y pertenece a la sala
        const player = await prisma.player.findUnique({
          where: { id: playerId },
          include: { game: true }
        });
        
        if (!player || player.gameId !== gameId || player.game.code !== code) {
          return safe.validationError('Sesión inválida');
        }

        // Verificar que el juego aún existe
        const game = player.game;
        if (!game) {
          return safe.validationError('La sala ya no existe');
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

        safe.success({ 
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
        safe.error(err, 'Error al reconectar. Intenta crear una nueva partida.');
      }
    });

    socket.on('start_game', async (payload, cb) => {
      console.log('start_game:', payload);
      const safe = createSafeCallback(cb, 'start_game');
      
      try {
        const { gameId } = payload;
        
        // Validación de entrada
        if (!gameId) {
          return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
        }
        
        const gm = games.get(gameId);
        if (!gm) {
          console.log('Game not found in memory:', gameId);
          return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
        }
        
        // Validar que tenemos el playerId
        if (!socket.data.playerId) {
          return safe.validationError('Sesión no válida. Por favor recarga la página.');
        }
        
        // Validar que el jugador que intenta iniciar es el anfitrión
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return safe.validationError('Solo el anfitrión puede iniciar la partida');
        }
        
        // Validar usando la lógica del GameManager
        const playerCount = await prisma.player.count({ where: { gameId } });
        const validation = gm.canStartGame(playerCount);
        if (!validation.canStart) {
          return safe.validationError(validation.message);
        }
        
        // Cancelar el timer de expiración ya que la partida va a comenzar
        clearRoomTimer(gameId);
        
        await gm.startGame();
        console.log('Game started successfully');
        safe.success();
      } catch (err) {
        safe.error(err, 'Error al iniciar la partida. Intenta de nuevo.');
      }
    });

    socket.on('send_clue', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'send_clue');
      const { gameId, clue } = payload;
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      if (!clue || clue.trim().length === 0) {
        return safe.validationError('La pista no puede estar vacía');
      }
      
      try {
        await gm.submitClue(socket.data.playerId, clue);
        safe.success();
      } catch (err) {
        safe.error(err, 'Error al enviar la pista. Intenta de nuevo.');
      }
    });

    // Endpoint para que el cliente pida su tarjeta
    socket.on('get_my_card', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'get_my_card');
      const { gameId, playerId } = payload;
      console.log('get_my_card:', payload);
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      if (!playerId) {
        return safe.validationError(USER_FRIENDLY_MESSAGES.PLAYER_NOT_FOUND);
      }
      
      try {
        const card = await gm.getCardForPlayer(playerId);
        if (card) {
          safe.success({ card });
        } else {
          safe.validationError('Carta no encontrada');
        }
      } catch (err) {
        safe.error(err, 'Error al obtener la carta. Intenta de nuevo.');
      }
    });

    socket.on('submit_vote', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'submit_vote');
      const { gameId, votedForPlayerId } = payload;
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      if (!socket.data.playerId) {
        return safe.validationError('Sesión no válida');
      }
      
      if (!votedForPlayerId) {
        return safe.validationError('Debes seleccionar a un jugador');
      }
      
      try {
        await gm.submitVote(socket.data.playerId, votedForPlayerId);
        safe.success();
      } catch (err) {
        safe.error(err, 'Error al enviar el voto. Intenta de nuevo.');
      }
    });

    // Obtener packs de palabras disponibles
    socket.on('get_word_packs', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'get_word_packs');
      
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
          safe.success({ packs: [{ id: 'default', name: 'Mix Aleatorio', category: 'General' }] });
        } else {
          safe.success({ packs });
        }
      } catch (err) {
        safe.error(err, 'Error al cargar las categorías');
      }
    });

    // Actualizar configuración del ciclo (solo host)
    socket.on('update_config', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'update_config');
      const { gameId, config } = payload;
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      try {
        // Validar que el jugador es el host
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return safe.validationError('Solo el anfitrión puede cambiar la configuración');
        }
        
        const newConfig = gm.updateConfig(config);
        safe.success({ config: newConfig });
      } catch (err) {
        safe.error(err, 'Error al actualizar la configuración');
      }
    });

    // Obtener información de validación para iniciar
    socket.on('get_start_validation', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'get_start_validation');
      const { gameId } = payload;
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      try {
        const playerCount = await prisma.player.count({ where: { gameId } });
        const validation = gm.canStartGame(playerCount);
        safe.success({ ...validation, config: gm.getConfig() });
      } catch (err) {
        safe.error(err, 'Error al validar la partida');
      }
    });

    // Reiniciar partida (solo host)
    socket.on('restart_match', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'restart_match');
      const { gameId } = payload;
      
      const gm = games.get(gameId);
      if (!gm) return safe.validationError(USER_FRIENDLY_MESSAGES.GAME_NOT_FOUND);
      
      try {
        // Validar que el jugador es el host
        const currentPlayer = await prisma.player.findUnique({ 
          where: { id: socket.data.playerId },
          select: { isHost: true }
        });
        if (!currentPlayer?.isHost) {
          return safe.validationError('Solo el anfitrión puede reiniciar la partida');
        }
        
        await gm.restartMatch();
        safe.success();
      } catch (err) {
        safe.error(err, 'Error al reiniciar la partida');
      }
    });

    // Salir de la sala voluntariamente
    socket.on('leave_room', async (payload, cb) => {
      const safe = createSafeCallback(cb, 'leave_room');
      const { gameId } = payload;
      const playerId = socket.data.playerId;
      
      if (!playerId || !gameId) {
        return safe.validationError('Sesión no válida');
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

        safe.success();
      } catch (err) {
        safe.error(err, 'Error al salir de la sala');
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
                  clearRoomTimer(gameId);
                  games.delete(gameId);
                  await prisma.gameSession.delete({ where: { id: gameId } }).catch(() => {});
                  console.log(`Game ${gameId} deleted - no players remaining`);
                }
              } catch (err) {
                // Solo logueamos, no hay callback para enviar error al cliente en disconnect
                console.error('[ERROR] disconnect cleanup:', {
                  playerId,
                  gameId,
                  message: err?.message,
                  code: err?.code
                });
              }
            }, 5000); // 5 segundos de gracia para reconectar
          }
        } catch (err) {
          // Solo logueamos, no hay callback para enviar error al cliente
          console.error('[ERROR] disconnect handler:', {
            playerId,
            gameId,
            message: err?.message,
            code: err?.code
          });
        }
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Server ready on http://${hostname}:${port}`);
    console.log(`> Socket.io running on same port`);
  });
});
