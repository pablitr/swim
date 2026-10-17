import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  secondsEs,
  localDate,
  localTime,
  csvEscape,
  rowsToCsv,
  buildSummaryRows,
  buildDetailRows
} from '../../js/analytics/csv-export.js';

describe('CSV Export Engine (Pure Builders)', () => {
  describe('Helper Functions', () => {
    test('secondsEs formats milliseconds to Spanish decimal string with comma', () => {
      assert.strictEqual(secondsEs(63956), '63,96');
      assert.strictEqual(secondsEs(62907), '62,91');
      assert.strictEqual(secondsEs(126863), '126,86');
      assert.strictEqual(secondsEs(0), '0,00');
      assert.strictEqual(secondsEs(null), '');
      assert.strictEqual(secondsEs(undefined), '');
      assert.strictEqual(secondsEs(''), '');
      assert.strictEqual(secondsEs(NaN), '');
    });

    test('localDate formats timestamp to YYYY-MM-DD using local time', () => {
      const ts = new Date(2026, 9, 16, 21, 2, 49).getTime(); // 16 de Octubre 2026
      assert.strictEqual(localDate(ts), '2026-10-16');
      assert.strictEqual(localDate(null), '');
      assert.strictEqual(localDate(undefined), '');
      assert.strictEqual(localDate('invalid-date'), '');
    });

    test('localTime formats timestamp to HH:MM and optionally HH:MM:SS', () => {
      const ts = new Date(2026, 9, 16, 21, 2, 49).getTime();
      assert.strictEqual(localTime(ts), '21:02');
      assert.strictEqual(localTime(ts, false), '21:02');
      assert.strictEqual(localTime(ts, true), '21:02:49');
      assert.strictEqual(localTime(null), '');
      assert.strictEqual(localTime(undefined), '');
    });

    test('csvEscape wraps in double quotes and escapes internal quotes', () => {
      assert.strictEqual(csvEscape('Juan Pérez'), '"Juan Pérez"');
      assert.strictEqual(csvEscape('He said "Hello"'), '"He said ""Hello"""');
      assert.strictEqual(csvEscape(123), '"123"');
      assert.strictEqual(csvEscape(null), '""');
      assert.strictEqual(csvEscape(undefined), '""');
    });

    test('csvEscape prevents spreadsheet formula injection (=, +, -, @)', () => {
      assert.strictEqual(csvEscape('=SUM(A1:B2)'), `"'=SUM(A1:B2)"`);
      assert.strictEqual(csvEscape('+123'), `\"'+123\"`);
      assert.strictEqual(csvEscape('-5'), `\"'-5\"`);
      assert.strictEqual(csvEscape('@cmd'), `\"'@cmd\"`);
    });

    test('rowsToCsv prepends UTF-8 BOM, separates with semicolons and CRLF', () => {
      const rows = [
        ['Nadador', 'Carril'],
        ['Juan', 1],
        ['=cmd', 2]
      ];
      const csv = rowsToCsv(rows);
      assert.ok(csv.startsWith('\uFEFF'), 'CSV must begin with UTF-8 BOM');
      const lines = csv.slice(1).split('\r\n');
      assert.strictEqual(lines.length, 3);
      assert.strictEqual(lines[0], '"Nadador";"Carril"');
      assert.strictEqual(lines[1], '"Juan";"1"');
      assert.strictEqual(lines[2], `"'=cmd";"2"`);
    });

    test('rowsToCsv handles empty or invalid input', () => {
      assert.strictEqual(rowsToCsv([]), '\uFEFF');
      assert.strictEqual(rowsToCsv(null), '\uFEFF');
    });
  });

  describe('buildSummaryRows', () => {
    test('TC-CSV-01: Summary table with 2 swimmers (Juan lane 1, Ana lane 2 without laps)', () => {
      const tsLap1 = new Date(2026, 9, 16, 21, 2, 49).getTime();
      const tsLap2 = new Date(2026, 9, 16, 21, 3, 52).getTime();

      const entries = [
        {
          swimmer: { id: 'swimmer-juan', name: 'Juan Pérez', lane: 1 },
          laps: [
            {
              id: 'lap-1',
              swimmerId: 'swimmer-juan',
              lapNumber: 1,
              splitDurationMs: 63956,
              cumulativeDurationMs: 63956,
              timestamp: tsLap1,
              sessionTag: '4x100 libre'
            },
            {
              id: 'lap-2',
              swimmerId: 'swimmer-juan',
              lapNumber: 2,
              splitDurationMs: 62907,
              cumulativeDurationMs: 126863,
              timestamp: tsLap2
            }
          ]
        },
        {
          swimmer: { id: 'swimmer-ana', name: 'Ana', lane: 2 },
          laps: []
        }
      ];

      const rows = buildSummaryRows(entries);

      // Header row
      const expectedHeader = [
        'Fecha', 'Hora inicio', 'Carril', 'Nadador', 'Etiqueta',
        'Pases', 'Total', 'Total (s)', 'Mejor', 'Mejor (s)', 'Promedio', 'Promedio (s)',
        'Pase 1', 'Pase 2'
      ];
      assert.deepStrictEqual(rows[0], expectedHeader);

      // Juan row (matches exact row from plan specification)
      const expectedJuanRow = [
        '2026-10-16',
        '21:02',
        1,
        'Juan Pérez',
        '4x100 libre',
        2,
        '02:06.86',
        '126,86',
        '01:02.91',
        '62,91',
        '01:03.43',
        '63,43',
        '01:03.96',
        '01:02.91'
      ];
      assert.deepStrictEqual(rows[1], expectedJuanRow);

      // Ana has no laps -> generates 0 rows
      assert.strictEqual(rows.length, 2, 'Only header + 1 row for Juan should exist');
    });

    test('TC-CSV-02: Gap from deleted lap (lapNumber 1 and 3) leaves Pase 2 empty', () => {
      const tsLap1 = new Date(2026, 9, 16, 21, 2, 49).getTime();
      const tsLap3 = new Date(2026, 9, 16, 21, 5, 0).getTime();

      const entries = [
        {
          swimmer: { id: 's1', name: 'Carlos', lane: 3 },
          laps: [
            {
              id: 'lap-1',
              lapNumber: 1,
              splitDurationMs: 60000,
              cumulativeDurationMs: 60000,
              timestamp: tsLap1
            },
            {
              id: 'lap-3',
              lapNumber: 3,
              splitDurationMs: 62000,
              cumulativeDurationMs: 182000,
              timestamp: tsLap3
            }
          ]
        }
      ];

      const rows = buildSummaryRows(entries);
      const header = rows[0];
      assert.strictEqual(header[header.length - 3], 'Pase 1');
      assert.strictEqual(header[header.length - 2], 'Pase 2');
      assert.strictEqual(header[header.length - 1], 'Pase 3');

      const dataRow = rows[1];
      const p1Index = header.indexOf('Pase 1');
      const p2Index = header.indexOf('Pase 2');
      const p3Index = header.indexOf('Pase 3');

      assert.strictEqual(dataRow[p1Index], '01:00.00');
      assert.strictEqual(dataRow[p2Index], '', 'Pase 2 must be empty string due to gap');
      assert.strictEqual(dataRow[p3Index], '01:02.00');
    });

    test('TC-CSV-03: Multiple sessions are ordered chronologically, then lane, then name', () => {
      const ts1 = new Date(2026, 9, 16, 10, 0, 0).getTime();
      const ts2 = new Date(2026, 9, 16, 11, 0, 0).getTime();

      const entries = [
        {
          swimmer: { id: 's2', name: 'Beto', lane: 2 },
          laps: [
            { id: 'l2', lapNumber: 1, splitDurationMs: 30000, timestamp: ts1 }
          ]
        },
        {
          swimmer: { id: 's1', name: 'Ale', lane: 1 },
          laps: [
            { id: 'l1', lapNumber: 1, splitDurationMs: 31000, timestamp: ts1 }
          ]
        },
        {
          swimmer: { id: 's3', name: 'Carlos', lane: 1 },
          laps: [
            { id: 'l3', lapNumber: 1, splitDurationMs: 32000, timestamp: ts2 }
          ]
        }
      ];

      const rows = buildSummaryRows(entries);
      assert.strictEqual(rows.length, 4); // header + 3 sessions
      // ts1: lane 1 (Ale) before lane 2 (Beto)
      assert.strictEqual(rows[1][3], 'Ale');
      assert.strictEqual(rows[2][3], 'Beto');
      // ts2: later session
      assert.strictEqual(rows[3][3], 'Carlos');
    });
  });

  describe('buildDetailRows', () => {
    test('TC-CSV-04: Detailed table generates 1 row per lap and excludes internal/live columns', () => {
      const tsLap1 = new Date(2026, 9, 16, 21, 2, 49).getTime();
      const tsLap2 = new Date(2026, 9, 16, 21, 3, 52).getTime();

      const entries = [
        {
          swimmer: { id: 'swimmer-juan', name: 'Juan Pérez', lane: 1 },
          laps: [
            {
              id: 'lap-1',
              lapNumber: 1,
              splitDurationMs: 63956,
              cumulativeDurationMs: 63956,
              timestamp: tsLap1,
              sessionTag: '4x100 libre'
            },
            {
              id: 'lap-2',
              lapNumber: 2,
              splitDurationMs: 62907,
              cumulativeDurationMs: 126863,
              timestamp: tsLap2
            }
          ]
        },
        {
          swimmer: { id: 'swimmer-ana', name: 'Ana', lane: 2 },
          laps: []
        }
      ];

      const rows = buildDetailRows(entries);

      const expectedHeader = [
        'Fecha', 'Hora inicio', 'Hora pase', 'Carril', 'Nadador',
        'Etiqueta', 'Pase', 'Parcial', 'Parcial (s)', 'Acumulado', 'Acumulado (s)'
      ];
      assert.deepStrictEqual(rows[0], expectedHeader);

      // Verify forbidden columns are absent
      const headerString = rows[0].join(';');
      assert.ok(!headerString.includes('Estado'), 'Must not contain Estado');
      assert.ok(!headerString.includes('Tiempo actual'), 'Must not contain Tiempo actual');
      assert.ok(!headerString.includes('ID Nadador'), 'Must not contain ID Nadador');

      // Row 1 (Lap 1)
      assert.deepStrictEqual(rows[1], [
        '2026-10-16',
        '21:02',
        '21:02:49',
        1,
        'Juan Pérez',
        '4x100 libre',
        1,
        '01:03.96',
        '63,96',
        '01:03.96',
        '63,96'
      ]);

      // Row 2 (Lap 2)
      assert.deepStrictEqual(rows[2], [
        '2026-10-16',
        '21:02',
        '21:03:52',
        1,
        'Juan Pérez',
        '4x100 libre',
        2,
        '01:02.91',
        '62,91',
        '02:06.86',
        '126,86'
      ]);

      // Ana has no laps -> generates 0 rows
      assert.strictEqual(rows.length, 3, 'Only header + 2 lap rows');
    });

    test('TC-CSV-05: Detailed table propagates session tag to all laps in session', () => {
      const ts = new Date(2026, 9, 16, 18, 0, 0).getTime();
      const entries = [
        {
          swimmer: { id: 's1', name: 'Nadia', lane: 4 },
          laps: [
            { id: 'l1', lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000, timestamp: ts },
            { id: 'l2', lapNumber: 2, splitDurationMs: 46000, cumulativeDurationMs: 91000, timestamp: ts + 46000, sessionTag: 'Técnica' }
          ]
        }
      ];

      const rows = buildDetailRows(entries);
      // Both rows must carry the tag 'Técnica'
      assert.strictEqual(rows[1][5], 'Técnica');
      assert.strictEqual(rows[2][5], 'Técnica');
    });
  });
});
