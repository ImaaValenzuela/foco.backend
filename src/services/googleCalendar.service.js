const crypto = require('crypto');
const { google } = require('googleapis');
const pool = require('../db');

// Configuración de cifrado para Refresh Tokens
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'foco-default-calendar-encryption-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptToken(cipherText) {
  if (!cipherText) return null;
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Si no está en formato cifrado iv:tag:data, devolvemos como texto plano por compatibilidad
    return cipherText;
  }
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error descifrando token:', error.message);
    return null;
  }
}

class GoogleCalendarService {
  constructor(dbPool = pool, customOAuth2Client = null) {
    this.pool = dbPool;
    this.customOAuth2Client = customOAuth2Client;
    this._tableInitialized = false;
  }

  async ensureTable() {
    if (this._tableInitialized) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_google_tokens (
          id UUID PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL UNIQUE,
          access_token TEXT,
          refresh_token TEXT,
          expiry_date BIGINT,
          scope TEXT,
          token_type VARCHAR(50) DEFAULT 'Bearer',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      this._tableInitialized = true;
    } catch (err) {
      console.warn('Aviso: no se pudo verificar/crear tabla user_google_tokens:', err.message);
    }
  }

  getOAuth2Client() {
    if (this.customOAuth2Client) {
      return this.customOAuth2Client;
    }
    const clientId = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173';
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async saveTokens(userId, { access_token, refresh_token, expiry_date, scope }) {
    await this.ensureTable();

    // Si ya existe un refresh_token para el usuario y la nueva llamada no incluye uno,
    // conservamos el refresh_token previo (Google solo devuelve refresh_token en la primera autorización)
    let encryptedRefreshToken = null;
    if (refresh_token) {
      encryptedRefreshToken = encryptToken(refresh_token);
    } else {
      const existing = await this.pool.query(
        'SELECT refresh_token FROM user_google_tokens WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (existing.rows[0]?.refresh_token) {
        encryptedRefreshToken = existing.rows[0].refresh_token;
      }
    }

    const expiry = expiry_date ? Number(expiry_date) : Date.now() + 3600 * 1000;
    const tokenId = crypto.randomUUID();

    const query = `
      INSERT INTO user_google_tokens (id, user_id, access_token, refresh_token, expiry_date, scope, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        access_token = COALESCE(EXCLUDED.access_token, user_google_tokens.access_token),
        refresh_token = COALESCE(EXCLUDED.refresh_token, user_google_tokens.refresh_token),
        expiry_date = COALESCE(EXCLUDED.expiry_date, user_google_tokens.expiry_date),
        scope = COALESCE(EXCLUDED.scope, user_google_tokens.scope),
        updated_at = NOW()
      RETURNING user_id, expiry_date, updated_at;
    `;

    const res = await this.pool.query(query, [
      tokenId,
      userId,
      access_token || null,
      encryptedRefreshToken,
      expiry,
      scope || 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'
    ]);

    return res.rows[0];
  }

  async getStoredTokens(userId) {
    await this.ensureTable();
    const res = await this.pool.query(
      'SELECT access_token, refresh_token, expiry_date, scope FROM user_google_tokens WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      access_token: row.access_token,
      refresh_token: decryptToken(row.refresh_token),
      expiry_date: Number(row.expiry_date),
      scope: row.scope
    };
  }

  async getConnectionStatus(userId) {
    const tokens = await this.getStoredTokens(userId);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return { connected: false, hasRefreshToken: false, expiryDate: null };
    }
    return {
      connected: true,
      hasRefreshToken: Boolean(tokens.refresh_token),
      expiryDate: tokens.expiry_date
    };
  }

  async disconnectCalendar(userId) {
    await this.ensureTable();
    await this.pool.query('DELETE FROM user_google_tokens WHERE user_id = $1', [userId]);
    return { success: true };
  }

  /**
   * Obtiene un cliente OAuth2 autenticado con renovación transparente de tokens si el access_token expiró.
   */
  async getAuthenticatedClient(userId) {
    const tokens = await this.getStoredTokens(userId);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      throw new Error('CALENDAR_NOT_CONNECTED: El usuario no tiene vinculado Google Calendar');
    }

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    // Escuchador para guardar automáticamente tokens refrescados en la BD
    oauth2Client.on('tokens', async (newTokens) => {
      try {
        await this.saveTokens(userId, {
          access_token: newTokens.access_token || tokens.access_token,
          refresh_token: newTokens.refresh_token || tokens.refresh_token,
          expiry_date: newTokens.expiry_date || (Date.now() + 3600 * 1000),
          scope: newTokens.scope || tokens.scope
        });
      } catch (err) {
        console.error('Error actualizando tokens renovados:', err.message);
      }
    });

    // Verificación proactiva de expiración (con margen de 3 minutos)
    const isExpired = !tokens.expiry_date || tokens.expiry_date <= (Date.now() + 180000);
    if (isExpired && tokens.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        await this.saveTokens(userId, {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokens.refresh_token,
          expiry_date: credentials.expiry_date,
          scope: credentials.scope || tokens.scope
        });
      } catch (refreshErr) {
        console.warn('Aviso: fallo al refrescar token proactivamente:', refreshErr.message);
      }
    }

    return oauth2Client;
  }

  /**
   * Lista los eventos de Google Calendar del día solicitado (por defecto Hoy).
   * Considera la zona horaria del cliente y rangos timeMin / timeMax para evitar desfases UTC.
   */
  async listTodayEvents(userId, targetDate = new Date(), options = {}) {
    const authClient = await this.getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    let timeMin;
    let timeMax;

    if (options && options.timeMin && options.timeMax) {
      timeMin = options.timeMin;
      timeMax = options.timeMax;
    } else {
      let startOfDay;
      let endOfDay;

      if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
        const [y, m, d] = targetDate.trim().split('-').map(Number);
        startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
        endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
      } else {
        const date = targetDate instanceof Date ? targetDate : new Date(targetDate);
        startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      }

      timeMin = startOfDay.toISOString();
      timeMax = endOfDay.toISOString();
    }

    const listParams = {
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    };

    if (options && options.timeZone) {
      listParams.timeZone = options.timeZone;
    }

    const response = await calendar.events.list(listParams);

    const items = response.data.items || [];
    return items.map(event => {
      const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      return {
        id: event.id,
        title: event.summary || 'Sin título',
        description: event.description || '',
        start,
        end,
        allDay: isAllDay,
        location: event.location || '',
        htmlLink: event.htmlLink || ''
      };
    });
  }

  /**
   * Crea un evento en el Google Calendar primario del usuario.
   */
  async createCalendarEvent(userId, { summary, description, start, end, location }) {
    const authClient = await this.getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // Si start o end no son provistos, por defecto creamos el evento en la próxima hora completa
    let startDateTime = start;
    let endDateTime = end;

    if (!startDateTime) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      startDateTime = now.toISOString();
    }

    if (!endDateTime) {
      const s = new Date(startDateTime);
      s.setHours(s.getHours() + 1);
      endDateTime = s.toISOString();
    }

    const eventPayload = {
      summary: summary || 'Nuevo evento FOCO',
      description: description || 'Creado desde F.O.C.O.',
      start: { dateTime: new Date(startDateTime).toISOString() },
      end: { dateTime: new Date(endDateTime).toISOString() },
      location: location || ''
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventPayload
    });

    return {
      id: res.data.id,
      title: res.data.summary,
      description: res.data.description,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      htmlLink: res.data.htmlLink
    };
  }

  /**
   * Resumen para enriquecer el RAG y el motor de inferencia sin ambigüedad en Supabase
   */
  async getTodayEventsSummary(userId, targetDate = new Date()) {
    try {
      const events = await this.listTodayEvents(userId, targetDate);
      let busyHours = 0;
      let hasNightEvents = false;

      events.forEach(ev => {
        if (ev.start && ev.end && !ev.allDay) {
          const s = new Date(ev.start);
          const e = new Date(ev.end);
          const diffMs = e.getTime() - s.getTime();
          if (diffMs > 0) {
            busyHours += diffMs / (1000 * 60 * 60);
          }
          if (e.getHours() >= 18) {
            hasNightEvents = true;
          }
        }
      });

      return {
        connected: true,
        totalCount: events.length,
        busyHours: Math.round(busyHours * 10) / 10,
        hasNightEvents,
        events: events.map(e => ({ title: e.title, start: e.start, end: e.end }))
      };
    } catch (error) {
      return {
        connected: false,
        totalCount: 0,
        busyHours: 0,
        hasNightEvents: false,
        events: []
      };
    }
  }
}

const googleCalendarService = new GoogleCalendarService();

module.exports = {
  GoogleCalendarService,
  googleCalendarService,
  encryptToken,
  decryptToken
};
