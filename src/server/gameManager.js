const { PrismaClient } = require('@prisma/client');

/**
 * GameManager - Maneja la lógica completa del juego Impostor
 * 
 * Conceptos:
 * - Session: Partida persistente (sala)
 * - Match/Cycle: Un ciclo de juego completo dentro de la sesión
 * - Round: Una ronda dentro de un ciclo (dar pistas + votar)
 */
class GameManager {
  constructor(gameId, io, prisma) {
    this.gameId = gameId;
    this.io = io;
    this.prisma = prisma || new PrismaClient();
    
    // Estado del juego
    this.phase = 'WAITING'; // WAITING, DEALING, CLUES, VOTING, ROUND_RESULT, GAME_OVER
    this.players = [];
    this.playerSockets = new Map(); // playerId -> socketId
    
    // Configuración del ciclo (modificable por el host)
    this.config = {
      totalRounds: 3,      // Número de rondas por ciclo
      impostorsCount: 1,   // Número de impostores
      showHintToImpostor: true
    };
    
    // Estado del ciclo actual
    this.currentRound = 0;
    this.secretWord = undefined;
    this.category = undefined;
    this.clues = {};
    this.votes = {};
    
    // Historial para cálculo de puntuación
    this.gameHistory = {
      rounds: [],           // Array de resultados por ronda
      eliminatedPlayers: [], // IDs de jugadores eliminados
      impostorIds: [],      // IDs de los impostores en este ciclo
    };
    
    // Puntuación interna (NO se envía hasta GAME_OVER)
    this.pendingScores = {}; // { playerId: { points: 0, breakdown: [] } }
  }

  // ==================== GESTIÓN DE JUGADORES ====================
  
  addPlayer(playerId, socketId) {
    if (!this.players.includes(playerId)) this.players.push(playerId);
    if (socketId) this.playerSockets.set(playerId, socketId);
    this.broadcastRoomUpdate();
  }

  removePlayer(playerId) {
    this.playerSockets.delete(playerId);
  }

  isPlayerConnected(playerId) {
    return this.playerSockets.has(playerId);
  }

  setPlayerSocket(playerId, socketId) {
    this.playerSockets.set(playerId, socketId);
  }

  // ==================== CONFIGURACIÓN DEL CICLO ====================
  
  /**
   * Actualiza la configuración del ciclo (solo el host puede llamar esto)
   */
  updateConfig(newConfig) {
    if (this.phase !== 'WAITING' && this.phase !== 'GAME_OVER') {
      throw new Error('Solo se puede configurar antes de iniciar o después de terminar un ciclo');
    }
    
    if (newConfig.totalRounds !== undefined) {
      this.config.totalRounds = Math.max(1, Math.min(10, newConfig.totalRounds));
    }
    if (newConfig.impostorsCount !== undefined) {
      this.config.impostorsCount = Math.max(1, Math.min(5, newConfig.impostorsCount));
    }
    if (newConfig.showHintToImpostor !== undefined) {
      this.config.showHintToImpostor = newConfig.showHintToImpostor;
    }
    
    // Notificar a todos del cambio de configuración
    this.io.to(this.gameId).emit('config_updated', this.config);
    
    return this.config;
  }

  /**
   * Calcula el mínimo de jugadores requerido según los impostores configurados
   * Regla: MinPlayers = (NumImpostors * 2) + 1
   */
  getMinPlayers() {
    return (this.config.impostorsCount * 2) + 1;
  }

  /**
   * Valida si se puede iniciar el juego
   */
  canStartGame(playerCount) {
    const minPlayers = this.getMinPlayers();
    return {
      canStart: playerCount >= minPlayers,
      minPlayers,
      currentPlayers: playerCount,
      message: playerCount >= minPlayers 
        ? 'Listo para iniciar' 
        : `Se necesitan mínimo ${minPlayers} jugadores (${this.config.impostorsCount} impostor${this.config.impostorsCount > 1 ? 'es' : ''} × 2 + 1)`
    };
  }

  // ==================== INICIO DEL JUEGO ====================

  async startGame() {
    const game = await this.prisma.gameSession.findUnique({ 
      where: { id: this.gameId }, 
      include: { players: true } 
    });
    if (!game) throw new Error('Game not found');
    
    // Validar número de jugadores
    const validation = this.canStartGame(game.players.length);
    if (!validation.canStart) {
      throw new Error(validation.message);
    }
    
    // Actualizar configuración en DB
    await this.prisma.gameSession.update({
      where: { id: this.gameId },
      data: { 
        impostorsCount: this.config.impostorsCount,
        roundsTotal: this.config.totalRounds  // Campo en DB es roundsTotal
      }
    });
    
    // Inicializar ciclo
    this.phase = 'DEALING';
    this.currentRound = 1;
    this.gameHistory = { rounds: [], eliminatedPlayers: [], impostorIds: [] };
    this.pendingScores = {};
    
    // Inicializar puntuación pendiente para todos
    for (const p of game.players) {
      this.pendingScores[p.id] = { points: 0, breakdown: [] };
    }
    
    // Asignar roles
    await this.assignRoles(game.players.map(p => p.id), this.config.impostorsCount);
    
    // Obtener palabra secreta
    await this.selectNewWord();
    
    await this.emitPhase();
    
    // Enviar tarjetas después de un pequeño delay
    setTimeout(() => this.dealCardsToAll(), 500);
  }

  async selectNewWord() {
    const pack = await this.prisma.wordPack.findFirst();
    const words = (pack && pack.words && pack.words.length) ? pack.words : ['palabra', 'casa', 'perro', 'computadora'];
    this.secretWord = words[Math.floor(Math.random() * words.length)];
    this.category = pack ? pack.category : 'General';
  }

  async assignRoles(playerIds, impostorsCount) {
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const impostorIds = shuffled.slice(0, impostorsCount);
    this.gameHistory.impostorIds = impostorIds;
    
    for (const pid of playerIds) {
      const role = impostorIds.includes(pid) ? 'IMPOSTOR' : 'FRIEND';
      await this.prisma.player.update({ 
        where: { id: pid }, 
        data: { role } 
      });
    }
  }

  async dealCardsToAll() {
    const players = await this.prisma.player.findMany({ 
      where: { gameId: this.gameId } 
    });
    
    for (const p of players) {
      const isImpostor = p.role === 'IMPOSTOR';
      const cardData = {
        playerId: p.id,
        isImpostor,
        secretWord: isImpostor ? null : this.secretWord,
        category: this.category,
        showHintToImpostor: this.config.showHintToImpostor,
        currentRound: this.currentRound,
        totalRounds: this.config.totalRounds
      };
      
      this.io.to(this.gameId).emit(`secret_card_${p.id}`, cardData);
      console.log(`Sent secret card to player ${p.id} (${p.nickname}): isImpostor=${isImpostor}`);
    }
    
    this.phase = 'CLUES';
    await this.emitPhase();
  }

  async getCardForPlayer(playerId) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player || player.gameId !== this.gameId) return null;
    
    // Si el jugador fue eliminado, no tiene carta
    if (this.gameHistory.eliminatedPlayers.includes(playerId)) return null;
    
    const isImpostor = player.role === 'IMPOSTOR';
    return {
      playerId: player.id,
      isImpostor,
      secretWord: isImpostor ? null : this.secretWord,
      category: this.category,
      showHintToImpostor: this.config.showHintToImpostor,
      currentRound: this.currentRound,
      totalRounds: this.config.totalRounds
    };
  }

  // ==================== FASE DE PISTAS ====================

  async submitClue(playerId, clue) {
    if (this.phase !== 'CLUES') throw new Error('Not in clues phase');
    if (this.gameHistory.eliminatedPlayers.includes(playerId)) {
      throw new Error('Jugador eliminado no puede dar pistas');
    }
    
    this.clues[playerId] = clue;
    
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    const nickname = player ? player.nickname : 'Anónimo';
    
    // Guardar pista en historial del jugador
    await this.prisma.player.update({ 
      where: { id: playerId }, 
      data: { clues: { push: { round: this.currentRound, text: clue } } } 
    }).catch(() => {});
    
    // Broadcast la pista
    this.io.to(this.gameId).emit('new_clue', { 
      from: nickname, 
      playerId,
      text: clue,
      totalClues: Object.keys(this.clues).length
    });
    console.log(`Clue from ${nickname}: "${clue}"`);
    
    // Verificar si todos enviaron pistas
    const activePlayers = await this.getActivePlayers();
    if (Object.keys(this.clues).length >= activePlayers.length) {
      await this.endCluesPhase();
    }
  }

  async endCluesPhase() {
    // Enviar todas las pistas
    const allClues = await Promise.all(
      Object.entries(this.clues).map(async ([pid, text]) => {
        const p = await this.prisma.player.findUnique({ where: { id: pid } });
        return { from: p ? p.nickname : 'Anónimo', playerId: pid, text };
      })
    );
    this.io.to(this.gameId).emit('all_clues', { clues: allClues });
    
    this.phase = 'VOTING';
    await this.emitPhase();
  }

  // ==================== FASE DE VOTACIÓN ====================

  async submitVote(voterId, votedForId) {
    if (this.phase !== 'VOTING') throw new Error('Not in voting phase');
    if (this.gameHistory.eliminatedPlayers.includes(voterId)) {
      throw new Error('Jugador eliminado no puede votar');
    }
    
    this.votes[voterId] = votedForId;
    
    // Guardar voto en DB
    await this.prisma.vote.create({ 
      data: { roundId: `${this.gameId}-R${this.currentRound}`, voterId, votedForId } 
    }).catch(() => {});
    
    // Notificar que alguien votó (sin revelar por quién)
    this.io.to(this.gameId).emit('vote_cast', { 
      voterId, 
      totalVotes: Object.keys(this.votes).length 
    });
    
    // Verificar si todos votaron
    const activePlayers = await this.getActivePlayers();
    if (Object.keys(this.votes).length >= activePlayers.length) {
      await this.calculateRoundResults();
    }
  }

  // ==================== CÁLCULO DE RESULTADOS ====================

  /**
   * Calcula los resultados de la ronda actual
   * Determina si alguien es eliminado y si el juego continúa
   */
  async calculateRoundResults() {
    const votes = { ...this.votes };
    const currentRound = this.currentRound;
    
    // Contar votos
    const tallies = {};
    for (const votedForId of Object.values(votes)) {
      tallies[votedForId] = (tallies[votedForId] || 0) + 1;
    }
    
    const entries = Object.entries(tallies).sort((a, b) => b[1] - a[1]);
    
    // Determinar resultado
    let roundResult = {
      round: currentRound,
      votes: votes,
      tallies: tallies,
      eliminatedId: null,
      eliminatedName: null,
      wasImpostor: false,
      isTie: false,
      gameEnds: false,
      winner: null // 'FRIENDS' | 'IMPOSTOR' | null
    };
    
    if (entries.length === 0) {
      // Nadie votó
      roundResult.isTie = true;
    } else {
      const [topId, topCount] = entries[0];
      const ties = entries.filter(e => e[1] === topCount);
      
      if (ties.length > 1) {
        // EMPATE - Nadie es eliminado, impostor sobrevive la ronda
        roundResult.isTie = true;
      } else {
        // Hay un eliminado
        const eliminatedPlayer = await this.prisma.player.findUnique({ 
          where: { id: topId } 
        });
        
        roundResult.eliminatedId = topId;
        roundResult.eliminatedName = eliminatedPlayer?.nickname || 'Jugador';
        roundResult.wasImpostor = eliminatedPlayer?.role === 'IMPOSTOR';
        
        // Marcar como eliminado
        this.gameHistory.eliminatedPlayers.push(topId);
      }
    }
    
    // Calcular puntuación de la ronda
    await this.calculateRoundScores(roundResult, votes);
    
    // Determinar si el juego termina
    const gameEndResult = await this.checkGameEnd(roundResult);
    roundResult.gameEnds = gameEndResult.ends;
    roundResult.winner = gameEndResult.winner;
    
    // Guardar en historial
    this.gameHistory.rounds.push(roundResult);
    
    // Emitir resultado de la ronda
    this.phase = 'ROUND_RESULT';
    await this.emitPhase();
    
    this.io.to(this.gameId).emit('round_result', {
      round: currentRound,
      totalRounds: this.config.totalRounds,
      isTie: roundResult.isTie,
      eliminatedId: roundResult.eliminatedId,
      eliminatedName: roundResult.eliminatedName,
      wasImpostor: roundResult.wasImpostor,
      voteTallies: tallies,
      gameEnds: roundResult.gameEnds,
      winner: roundResult.winner
    });
    
    // Si el juego termina, enviar puntuaciones finales
    if (roundResult.gameEnds) {
      await this.endGame(roundResult.winner);
    } else {
      // Continuar a siguiente ronda después de un delay
      setTimeout(() => this.startNextRound(), 5000);
    }
  }

  /**
   * Calcula puntos de la ronda (internamente, no se envían aún)
   */
  async calculateRoundScores(roundResult, votes) {
    const impostorIds = this.gameHistory.impostorIds;
    
    if (roundResult.wasImpostor && roundResult.eliminatedId) {
      // CASO A: Impostor eliminado - Amigos ganan
      for (const [voterId, votedForId] of Object.entries(votes)) {
        if (!this.pendingScores[voterId]) continue;
        
        if (votedForId === roundResult.eliminatedId) {
          // Voto decisivo: +10 puntos (eliminar al impostor)
          this.pendingScores[voterId].points += 10;
          this.pendingScores[voterId].breakdown.push({
            round: roundResult.round,
            reason: 'DECISIVE_VOTE',
            points: 10,
            description: `Voto decisivo - Eliminó al impostor`
          });
        }
      }
    } else {
      // CASO B: Impostor sobrevive (empate o eliminaron a amigo)
      
      // Impostor: +3 puntos por sobrevivir la ronda
      for (const impostorId of impostorIds) {
        if (this.gameHistory.eliminatedPlayers.includes(impostorId)) continue;
        if (!this.pendingScores[impostorId]) continue;
        
        this.pendingScores[impostorId].points += 3;
        this.pendingScores[impostorId].breakdown.push({
          round: roundResult.round,
          reason: 'SURVIVAL',
          points: 3,
          description: `Supervivencia - Ronda ${roundResult.round}`
        });
      }
      
      // Amigos que votaron correctamente (aunque no eliminaron): +3 puntos
      for (const [voterId, votedForId] of Object.entries(votes)) {
        if (!this.pendingScores[voterId]) continue;
        if (impostorIds.includes(voterId)) continue; // Impostores no ganan por votar
        
        if (impostorIds.includes(votedForId)) {
          // Votó por un impostor (voto correcto parcial)
          this.pendingScores[voterId].points += 3;
          this.pendingScores[voterId].breakdown.push({
            round: roundResult.round,
            reason: 'CORRECT_VOTE',
            points: 3,
            description: `Voto correcto - Identificó al impostor`
          });
        }
      }
    }
  }

  /**
   * Verifica si el juego debe terminar
   */
  async checkGameEnd(roundResult) {
    // Caso A: Impostor eliminado - Amigos ganan
    if (roundResult.wasImpostor) {
      // Verificar si quedan impostores vivos
      const aliveImpostors = this.gameHistory.impostorIds.filter(
        id => !this.gameHistory.eliminatedPlayers.includes(id)
      );
      
      if (aliveImpostors.length === 0) {
        return { ends: true, winner: 'FRIENDS' };
      }
    }
    
    // Caso B: Verificar si se agotaron las rondas
    if (this.currentRound >= this.config.totalRounds) {
      // Se acabaron las rondas - Gana el impostor
      return { ends: true, winner: 'IMPOSTOR' };
    }
    
    // El juego continúa
    return { ends: false, winner: null };
  }

  /**
   * Finaliza el juego y envía puntuaciones
   */
  async endGame(winner) {
    // Si el impostor ganó (sobrevivió todas las rondas), +10 puntos extra
    if (winner === 'IMPOSTOR') {
      for (const impostorId of this.gameHistory.impostorIds) {
        if (this.gameHistory.eliminatedPlayers.includes(impostorId)) continue;
        if (!this.pendingScores[impostorId]) continue;
        
        this.pendingScores[impostorId].points += 10;
        this.pendingScores[impostorId].breakdown.push({
          round: this.currentRound,
          reason: 'TOTAL_VICTORY',
          points: 10,
          description: 'Victoria total - Sobrevivió todas las rondas'
        });
      }
    }
    
    // Actualizar puntuaciones en DB
    for (const [playerId, scoreData] of Object.entries(this.pendingScores)) {
      await this.prisma.player.update({
        where: { id: playerId },
        data: { score: { increment: scoreData.points } }
      }).catch(() => {});
    }
    
    // Obtener jugadores con puntuaciones actualizadas
    const players = await this.prisma.player.findMany({
      where: { gameId: this.gameId },
      select: { id: true, nickname: true, role: true, score: true }
    });
    
    // Construir objeto de resultado final
    const finalResult = this.buildFinalResult(winner, players);
    
    this.phase = 'GAME_OVER';
    await this.emitPhase();
    
    // Enviar resultado final con desglose de puntos
    this.io.to(this.gameId).emit('game_over', finalResult);
    
    console.log(`Game ${this.gameId} ended. Winner: ${winner}`);
  }

  /**
   * Construye el objeto de resultado final para enviar al cliente
   */
  buildFinalResult(winner, players) {
    const playerResults = players.map(p => {
      const scoreData = this.pendingScores[p.id] || { points: 0, breakdown: [] };
      const wasImpostor = this.gameHistory.impostorIds.includes(p.id);
      const wasEliminated = this.gameHistory.eliminatedPlayers.includes(p.id);
      
      return {
        playerId: p.id,
        nickname: p.nickname,
        role: wasImpostor ? 'IMPOSTOR' : 'FRIEND',
        wasEliminated,
        totalScore: p.score,
        matchPoints: scoreData.points,
        breakdown: scoreData.breakdown
      };
    });
    
    // Ordenar por puntos del match (descendente)
    playerResults.sort((a, b) => b.matchPoints - a.matchPoints);
    
    return {
      winner, // 'FRIENDS' | 'IMPOSTOR'
      winnerMessage: winner === 'FRIENDS' 
        ? '¡Los Amigos han ganado! Descubrieron al Impostor.' 
        : '¡El Impostor ha ganado! Sobrevivió todas las rondas.',
      secretWord: this.secretWord,
      impostors: this.gameHistory.impostorIds,
      totalRounds: this.config.totalRounds,
      roundsPlayed: this.currentRound,
      players: playerResults,
      gameHistory: this.gameHistory.rounds.map(r => ({
        round: r.round,
        eliminatedId: r.eliminatedId,
        eliminatedName: r.eliminatedName,
        wasImpostor: r.wasImpostor,
        isTie: r.isTie
      }))
    };
  }

  // ==================== SIGUIENTE RONDA ====================

  async startNextRound() {
    this.clues = {};
    this.votes = {};
    this.currentRound += 1;
    
    this.phase = 'DEALING';
    
    // Nueva palabra para la ronda
    await this.selectNewWord();
    
    await this.emitPhase();
    
    // Enviar nuevas tarjetas
    setTimeout(() => this.dealCardsToAll(), 1000);
  }

  // ==================== REINICIAR CICLO ====================

  /**
   * Reinicia para un nuevo ciclo (llamado por el host)
   */
  async restartMatch() {
    this.phase = 'WAITING';
    this.currentRound = 0;
    this.clues = {};
    this.votes = {};
    this.gameHistory = { rounds: [], eliminatedPlayers: [], impostorIds: [] };
    this.pendingScores = {};
    
    // Resetear roles de jugadores
    await this.prisma.player.updateMany({
      where: { gameId: this.gameId },
      data: { role: 'FRIEND' }
    });
    
    await this.emitPhase();
    
    this.io.to(this.gameId).emit('match_restarted', { 
      config: this.config,
      message: 'El anfitrión ha reiniciado la partida. Configurando nuevo ciclo...'
    });
  }

  // ==================== UTILIDADES ====================

  async getActivePlayers() {
    const allPlayers = await this.prisma.player.findMany({ 
      where: { gameId: this.gameId } 
    });
    return allPlayers.filter(p => !this.gameHistory.eliminatedPlayers.includes(p.id));
  }

  async emitPhase() { 
    console.log(`Emitting phase_change to room ${this.gameId}: phase=${this.phase}, round=${this.currentRound}`);
    
    await this.prisma.gameSession.update({ 
      where: { id: this.gameId }, 
      data: { status: this.phase, currentRound: this.currentRound } 
    }).catch(err => console.error('Error updating game status:', err));
    
    this.io.to(this.gameId).emit('phase_change', { 
      phase: this.phase, 
      round: this.currentRound, 
      totalRounds: this.config.totalRounds,
      gameId: this.gameId 
    }); 
  }

  broadcastRoomUpdate() { 
    this.io.to(this.gameId).emit('room_update', { 
      gameId: this.gameId, 
      players: this.players,
      config: this.config
    }); 
  }

  // Para reconexión
  getConfig() {
    return this.config;
  }
}

module.exports = GameManager;
