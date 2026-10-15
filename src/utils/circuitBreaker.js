/**
 * Circuit Breaker en memoria para aislar fallas de microservicios externos o procesos pesados.
 * Evita agotamiento de sockets y conexiones a BD durante arranques en frío o indisponibilidad.
 */
class CircuitBreaker {
  constructor(threshold = 3, cooldownMs = 30000) {
    this.failureThreshold = threshold;
    this.cooldownMs = cooldownMs;
    this.failureCount = 0;
    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.nextAttempt = Date.now();
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN permite 1 prueba
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.cooldownMs;
      console.warn(`⚠️ [Circuit Breaker] Circuito IA abierto. Enfriamiento por ${this.cooldownMs / 1000}s`);
    }
  }

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }
}

module.exports = { CircuitBreaker };
