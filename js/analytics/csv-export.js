// CSV Export Engine - SwimCoach Tracker
// Pure builders for summary and detailed CSV export formats.

import { formatTime } from '../timing/timer-engine.js';
import { partitionLapsIntoSessions, getSessionTag } from './session-partitioner.js';

/**
 * Format milliseconds into Spanish decimal seconds string (e.g. 63956 -> "63,96")
 * @param {number|string|null|undefined} ms
 * @returns {string}
 */
export function secondsEs(ms) {
  if (ms === null || ms === undefined || ms === '' || isNaN(Number(ms))) return '';
  return (Number(ms) / 1000).toFixed(2).replace('.', ',');
}

/**
 * Format timestamp into YYYY-MM-DD using local time getters
 * @param {number|string|Date|null|undefined} ts
 * @returns {string}
 */
export function localDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format timestamp into HH:MM (or HH:MM:SS if withSeconds is true) using local time getters
 * @param {number|string|Date|null|undefined} ts
 * @param {boolean} [withSeconds=false]
 * @returns {string}
 */
export function localTime(ts, withSeconds = false) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (withSeconds) {
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

/**
 * Escape a cell value for CSV export (escapes quotes and prevents formula injection in Excel)
 * @param {*} value
 * @returns {string}
 */
export function csvEscape(value) {
  let cell = String(value ?? '');
  if (/^[=+@-]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

/**
 * Convert 2D array of rows to CSV string with UTF-8 BOM, semicolon delimiter, and CRLF line breaks
 * @param {Array<Array<*>>} rows
 * @returns {string}
 */
export function rowsToCsv(rows) {
  if (!Array.isArray(rows)) return '\uFEFF';
  return `\uFEFF${rows.map(row => (Array.isArray(row) ? row : []).map(csvEscape).join(';')).join('\r\n')}`;
}

/**
 * Format milliseconds into MM:SS.cc using timer-engine formatTime rounded to nearest centisecond
 * @param {number|string|null|undefined} ms
 * @returns {string}
 */
function formatLapTime(ms) {
  if (ms === null || ms === undefined || ms === '' || isNaN(Number(ms))) return '';
  return formatTime(Math.round(Number(ms) / 10) * 10);
}

/**
 * Collect and sort training sessions with swimmer metadata across all entries.
 * Sorted by first lap timestamp ascending, lane ascending, swimmer name ascending.
 * @param {Array<{ swimmer: Object, laps: Array<Object> }>} entries
 * @returns {Array<{ swimmer: Object, session: Array<Object> }>}
 */
function extractAndSortSessions(entries) {
  const sessionsWithMeta = [];

  for (const entry of (entries || [])) {
    const swimmer = entry?.swimmer || {};
    const laps = entry?.laps || [];
    const sessions = partitionLapsIntoSessions(laps);
    for (const session of sessions) {
      if (!session || session.length === 0) continue;
      sessionsWithMeta.push({ swimmer, session });
    }
  }

  sessionsWithMeta.sort((a, b) => {
    const aTime = a.session[0]?.timestamp != null ? Number(a.session[0].timestamp) : 0;
    const bTime = b.session[0]?.timestamp != null ? Number(b.session[0].timestamp) : 0;
    if (aTime !== bTime) return aTime - bTime;

    const aLane = a.swimmer.lane != null && a.swimmer.lane !== '' ? Number(a.swimmer.lane) : Infinity;
    const bLane = b.swimmer.lane != null && b.swimmer.lane !== '' ? Number(b.swimmer.lane) : Infinity;
    if (aLane !== bLane) return aLane - bLane;

    const aName = String(a.swimmer.name ?? '');
    const bName = String(b.swimmer.name ?? '');
    return aName.localeCompare(bName);
  });

  return sessionsWithMeta;
}

/**
 * Build 2D summary array (1 row per training session, split columns for Pase 1..N)
 * @param {Array<{ swimmer: Object, laps: Array<Object> }>} entries
 * @returns {Array<Array<string|number>>}
 */
export function buildSummaryRows(entries) {
  const baseHeaders = [
    'Fecha', 'Hora inicio', 'Carril', 'Nadador', 'Etiqueta',
    'Pases', 'Total', 'Total (s)', 'Mejor', 'Mejor (s)', 'Promedio', 'Promedio (s)'
  ];

  const sessionsWithMeta = extractAndSortSessions(entries);

  let maxLapNumber = 0;
  for (const { session } of sessionsWithMeta) {
    for (const lap of session) {
      const num = Number(lap?.lapNumber);
      if (!isNaN(num) && num > maxLapNumber) {
        maxLapNumber = num;
      }
    }
  }

  const pasesHeaders = [];
  for (let k = 1; k <= maxLapNumber; k++) {
    pasesHeaders.push(`Pase ${k}`);
  }

  const rows = [
    [...baseHeaders, ...pasesHeaders]
  ];

  for (const { swimmer, session } of sessionsWithMeta) {
    const firstLap = session[0];
    const totalMs = session.reduce((sum, lap) => sum + (Number(lap.splitDurationMs) || 0), 0);
    const splitDurations = session.map(l => Number(l.splitDurationMs) || 0);
    const bestMs = splitDurations.length > 0 ? Math.min(...splitDurations) : 0;
    const avgMs = session.length > 0 ? Math.round(totalMs / session.length) : 0;

    const row = [
      localDate(firstLap?.timestamp),
      localTime(firstLap?.timestamp, false),
      swimmer.lane ?? '',
      swimmer.name ?? '',
      getSessionTag(session),
      session.length,
      formatLapTime(totalMs),
      secondsEs(totalMs),
      formatLapTime(bestMs),
      secondsEs(bestMs),
      formatLapTime(avgMs),
      secondsEs(avgMs)
    ];

    for (let k = 1; k <= maxLapNumber; k++) {
      const lap = session.find(l => l.lapNumber === k);
      row.push(lap && lap.splitDurationMs != null ? formatLapTime(lap.splitDurationMs) : '');
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Build 2D detailed array (1 row per lap)
 * @param {Array<{ swimmer: Object, laps: Array<Object> }>} entries
 * @returns {Array<Array<string|number>>}
 */
export function buildDetailRows(entries) {
  const headers = [
    'Fecha', 'Hora inicio', 'Hora pase', 'Carril', 'Nadador',
    'Etiqueta', 'Pase', 'Parcial', 'Parcial (s)', 'Acumulado', 'Acumulado (s)'
  ];

  const sessionsWithMeta = extractAndSortSessions(entries);
  const rows = [headers];

  for (const { swimmer, session } of sessionsWithMeta) {
    const tag = getSessionTag(session);
    const sessionStartTs = session[0]?.timestamp;
    const sortedLaps = [...session].sort((a, b) => (Number(a.lapNumber) || 0) - (Number(b.lapNumber) || 0));

    for (const lap of sortedLaps) {
      const lapTs = lap.timestamp || sessionStartTs;
      rows.push([
        localDate(lapTs),
        localTime(sessionStartTs, false),
        localTime(lap.timestamp, true),
        swimmer.lane ?? '',
        swimmer.name ?? '',
        tag,
        lap.lapNumber,
        formatLapTime(lap.splitDurationMs),
        secondsEs(lap.splitDurationMs),
        formatLapTime(lap.cumulativeDurationMs),
        secondsEs(lap.cumulativeDurationMs)
      ]);
    }
  }

  return rows;
}
