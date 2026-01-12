/**
 * Utilidades de manejo de errores para el servidor
 * 
 * Este módulo proporciona funciones para:
 * 1. Sanitizar errores antes de enviarlos al cliente
 * 2. Loguear errores completos para debugging
 * 3. Mapear errores de Prisma a mensajes amigables
 */

// Códigos de error de Prisma comunes
const PRISMA_ERROR_CODES = {
  P2000: 'El valor proporcionado es demasiado largo',
  P2001: 'El registro no existe',
  P2002: 'Ya existe un registro con ese valor único',
  P2003: 'Error de restricción de clave foránea',
  P2025: 'No se encontró el registro solicitado',
};

// Mensajes amigables para el usuario
const USER_FRIENDLY_MESSAGES = {
  NOT_FOUND: 'No se encontró el recurso solicitado',
  INVALID_ID: 'Identificador no válido',
  INVALID_INPUT: 'Los datos proporcionados no son válidos',
  DB_ERROR: 'Error al procesar la solicitud. Intenta de nuevo',
  UNAUTHORIZED: 'No tienes permiso para realizar esta acción',
  GAME_NOT_FOUND: 'La partida no existe o ha terminado',
  PLAYER_NOT_FOUND: 'No se encontró el jugador',
  ROOM_NOT_FOUND: 'La sala no existe',
  ROOM_FULL: 'La sala está llena',
  ALREADY_STARTED: 'La partida ya ha comenzado',
  NOT_ENOUGH_PLAYERS: 'No hay suficientes jugadores para iniciar',
  GENERIC: 'Ocurrió un error inesperado. Intenta de nuevo',
};

/**
 * Determina si un error es de Prisma
 */
function isPrismaError(error) {
  return error?.code?.startsWith?.('P') || 
         error?.name === 'PrismaClientKnownRequestError' ||
         error?.name === 'PrismaClientValidationError';
}

/**
 * Extrae un mensaje amigable de un error de Prisma
 */
function getPrismaErrorMessage(error) {
  if (error.code && PRISMA_ERROR_CODES[error.code]) {
    return PRISMA_ERROR_CODES[error.code];
  }
  
  // Errores de validación de Prisma
  if (error.name === 'PrismaClientValidationError') {
    return USER_FRIENDLY_MESSAGES.INVALID_INPUT;
  }
  
  return USER_FRIENDLY_MESSAGES.DB_ERROR;
}

/**
 * Sanitiza un error para enviar al cliente
 * 
 * @param {Error} error - El error original
 * @param {string} context - Contexto donde ocurrió el error (para logs)
 * @param {string} fallbackMessage - Mensaje por defecto si no se puede determinar uno específico
 * @returns {string} Mensaje sanitizado para el usuario
 */
function sanitizeError(error, context = 'Unknown', fallbackMessage = USER_FRIENDLY_MESSAGES.GENERIC) {
  // Log completo para el desarrollador
  console.error(`[ERROR] ${context}:`, {
    message: error?.message,
    code: error?.code,
    name: error?.name,
    stack: error?.stack,
    meta: error?.meta,
  });
  
  // Si el error ya es un string simple (mensaje controlado), devolverlo
  if (typeof error === 'string') {
    return error;
  }
  
  // Si no hay error, devolver mensaje genérico
  if (!error) {
    return fallbackMessage;
  }
  
  // Si es un error de Prisma, mapear a mensaje amigable
  if (isPrismaError(error)) {
    return getPrismaErrorMessage(error);
  }
  
  // Si el mensaje de error contiene palabras clave de Prisma, sanitizar
  const message = error.message || '';
  if (
    message.includes('prisma') ||
    message.includes('Prisma') ||
    message.includes('Invalid') ||
    message.includes('Argument') ||
    message.includes('constraint') ||
    message.includes('ECONNREFUSED')
  ) {
    return USER_FRIENDLY_MESSAGES.DB_ERROR;
  }
  
  // Si es un error "controlado" (mensaje corto sin stack trace), devolverlo
  if (message.length < 100 && !message.includes('\n') && !message.includes('at ')) {
    return message;
  }
  
  return fallbackMessage;
}

/**
 * Wrapper para manejar callbacks de socket con errores sanitizados
 * 
 * @param {Function} cb - Callback del socket
 * @param {string} context - Contexto para logging
 * @returns {Function} Handler que sanitiza errores
 */
function createSafeCallback(cb, context) {
  return {
    success: (data = {}) => {
      cb?.({ ok: true, ...data });
    },
    error: (error, fallbackMessage) => {
      const safeMessage = sanitizeError(error, context, fallbackMessage);
      cb?.({ ok: false, error: safeMessage });
    },
    validationError: (message) => {
      cb?.({ ok: false, error: message });
    }
  };
}

/**
 * Valida que los campos requeridos existan
 * 
 * @param {Object} data - Objeto con los datos a validar
 * @param {string[]} requiredFields - Lista de campos requeridos
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateRequired(data, requiredFields) {
  const missing = requiredFields.filter(field => {
    const value = data?.[field];
    return value === undefined || value === null || value === '';
  });
  
  return {
    valid: missing.length === 0,
    missing,
    message: missing.length > 0 
      ? `Campos requeridos faltantes: ${missing.join(', ')}`
      : null
  };
}

/**
 * Valida un ID (debe ser string no vacío)
 */
function validateId(id, fieldName = 'id') {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return {
      valid: false,
      message: `${fieldName} no válido`
    };
  }
  return { valid: true };
}

module.exports = {
  sanitizeError,
  createSafeCallback,
  validateRequired,
  validateId,
  USER_FRIENDLY_MESSAGES,
  isPrismaError,
};
