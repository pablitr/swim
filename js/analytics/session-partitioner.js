// Session Partitioner - SwimCoach Tracker
// Partitions chronological laps into distinct training sessions/heats
// based on lap number resets or time gaps (> 20 min).

/**
 * 20 minutes in milliseconds
 */
const SESSION_GAP_THRESHOLD_MS = 20 * 60 * 1000;

/**
 * Partitions chronological laps into training sessions by lap number reset or >20 min time gap.
 * @param {Array<Object>} allLaps - Array of lap objects.
 * @returns {Array<Array<Object>>} Array of sessions in chronological order.
 */
export function partitionLapsIntoSessions(allLaps) {
  if (!Array.isArray(allLaps) || allLaps.length === 0) return [];

  const sorted = [...allLaps].sort((a, b) => {
    const aTime = a && a.timestamp !== null && a.timestamp !== undefined ? Number(a.timestamp) : NaN;
    const bTime = b && b.timestamp !== null && b.timestamp !== undefined ? Number(b.timestamp) : NaN;
    if (!isNaN(aTime) && !isNaN(bTime)) {
      return aTime - bTime;
    }
    return 0;
  });

  const sessions = [];
  let currentSession = [];

  for (let i = 0; i < sorted.length; i++) {
    const lap = sorted[i];
    if (currentSession.length > 0) {
      const prevLap = currentSession[currentSession.length - 1];
      const isNewLapNumber = (lap.lapNumber === 1 && prevLap.lapNumber !== 1) || (lap.lapNumber <= prevLap.lapNumber);
      const isTimeGap = Boolean(
        lap.timestamp &&
        prevLap.timestamp &&
        (Number(lap.timestamp) - Number(prevLap.timestamp) > SESSION_GAP_THRESHOLD_MS)
      );

      if (isNewLapNumber || isTimeGap) {
        sessions.push(currentSession);
        currentSession = [];
      }
    }
    currentSession.push(lap);
  }

  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  return sessions;
}

/**
 * Splits laps into current session and historical sessions.
 * @param {Array<Object>} allLaps - Array of lap objects.
 * @returns {{ sessions: Array<Array<Object>>, currentSession: Array<Object>, previousSessions: Array<Array<Object>> }}
 */
export function splitCurrentAndHistoricalSessions(allLaps) {
  const sessions = partitionLapsIntoSessions(allLaps);
  if (sessions.length === 0) {
    return {
      sessions: [],
      currentSession: [],
      previousSessions: []
    };
  }

  return {
    sessions,
    currentSession: sessions[sessions.length - 1],
    previousSessions: sessions.slice(0, -1).reverse()
  };
}

export const SESSION_TAG_MAX_LENGTH = 60;

export function normalizeSessionTag(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SESSION_TAG_MAX_LENGTH);
}

export function getSessionTag(session) {
  if (!Array.isArray(session)) return '';
  for (const lap of session) {
    const t = normalizeSessionTag(lap?.sessionTag);
    if (t) return t;
  }
  return '';
}

export function getSessionKey(session) {
  return (Array.isArray(session) && session[0]?.id) ? String(session[0].id) : '';
}
