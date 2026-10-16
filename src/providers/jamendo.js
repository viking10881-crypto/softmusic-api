const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const fs = require('fs');

const BASE = 'https://api.jamendo.com/v3.0';
const DEFAULT_TIMEOUT_MS = 6500;

// Jamendo sirve MP3 completos con licencia Creative Commons. El client_id es gratuito
// (https://devportal.jamendo.com) y viaja en las URLs de audio, así que no es un secreto.
function clientId() {
  return String(process.env.JAMENDO_CLIENT_ID || '').trim();
}

function configured() {
  return Boolean(clientId());
}

async function requestJSON(path, params = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  if (!configured()) {
    const error = new Error('Jamendo no está configurado (falta JAMENDO_CLIENT_ID)');
    error.status = 503;
    throw error;
  }
  const url = new URL(`${BASE}${path}`);
  const query = { client_id: clientId(), format: 'json', audioformat: 'mp32', imagesize: 600, ...params };
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.headers?.status === 'failed') {
      const error = new Error(payload?.headers?.error_message || `Jamendo HTTP ${response.status}`);
      error.status = response.ok ? 502 : response.status;
      throw error;
    }
    return Array.isArray(payload?.results) ? payload.results : [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTrack(track) {
  if (!track?.id || !track?.audio) return null;
  const duration = Math.max(0, Math.round(Number(track.duration || 0)));
  const genres = track.musicinfo?.tags?.genres || [];
  return {
    id: `jm_${track.id}`,
    externalId: String(track.id),
    title: track.name || '',
    artist: track.artist_name || '',
    uploader: track.artist_name || '',
    artistId: track.artist_id ? String(track.artist_id) : '',
    album: track.album_name || '',
    genre: genres[0] || '',
    mood: '',
    tags: [...genres, ...(track.musicinfo?.tags?.vartags || [])],
    duration,
    durationStr: duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '',
    thumbnail: track.album_image || track.image || '',
    source: 'jamendo',
    permalink: track.shareurl || '',
    license: track.license_ccurl || '',
    releaseDate: track.releasedate || null,
    audioUrl: track.audio,
    downloadUrl: track.audiodownload_allowed ? track.audiodownload || '' : '',
    downloadable: Boolean(track.audiodownload_allowed && track.audiodownload),
    streamable: true,
    fullStream: true,
    streamVerified: true,
    isPreview: false,
    providerMode: 'jamendo',
  };
}

function normalizeTracks(rows) {
  return (rows || []).map(normalizeTrack).filter(Boolean);
}

function safeLimit(limit, fallback = 30) {
  return Math.min(Math.max(Number(limit) || fallback, 1), 50);
}

async function searchTracks(query, limit = 30) {
  // namesearch busca solo en nombres de canción, álbum y artista: más preciso que `search`, que mira también tags.
  const rows = await requestJSON('/tracks/', { namesearch: query, limit: safeLimit(limit), order: 'relevance', include: 'musicinfo' });
  return normalizeTracks(rows);
}

async function popularTracks(limit = 30) {
  const rows = await requestJSON('/tracks/', { limit: safeLimit(limit), order: 'popularity_week', include: 'musicinfo' });
  return normalizeTracks(rows);
}

async function getTrack(trackId) {
  const rawId = rawTrackId(trackId);
  const rows = await requestJSON('/tracks/', { id: rawId, include: 'musicinfo' });
  return normalizeTrack(rows[0]);
}

function rawTrackId(trackId) {
  const raw = String(trackId || '').replace(/^jm_/, '');
  if (!/^\d{1,20}$/.test(raw)) throw Object.assign(new Error('Jamendo: ID inválido'), { status: 400 });
  return raw;
}

async function trackAudioUrl(trackId) {
  const track = await getTrack(trackId);
  if (!track) throw Object.assign(new Error('Jamendo: canción no encontrada'), { status: 404 });
  return track.audioUrl;
}

async function downloadTrackToFile(trackId, outputPath) {
  const track = await getTrack(trackId);
  if (!track?.downloadable) {
    throw Object.assign(new Error('El artista no permite descargar esta canción para uso offline.'), {
      status: 409,
      code: 'OFFLINE_NOT_ALLOWED',
    });
  }
  const response = await fetch(track.downloadUrl, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Jamendo download HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath));
}

function providerStatus() {
  return { ok: configured(), configured: configured(), mode: configured() ? 'client-id' : 'disabled-no-client-id', base: BASE };
}

module.exports = {
  BASE,
  configured,
  normalizeTrack,
  searchTracks,
  popularTracks,
  getTrack,
  trackAudioUrl,
  downloadTrackToFile,
  providerStatus,
};
