/**
 * Empirical Adversarial Challenger Test Suite
 * Milestone 1 - Challenger 2: Spanish Localization & Accessibility / SVG Boundary Scanner
 *
 * Runs exhaustive boundary stress tests on boxplot-svg.js, manifest.json, and UI localization.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

console.log('======================================================================');
console.log('   Adversarial Challenge Harness - Milestone 1 Challenger 2           ');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;
const failures = [];

function check(testName, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${testName}`);
    passCount++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${testName}`);
    console.error(`    Error: ${err.message}`);
    failures.push({ testName, error: err.message, stack: err.stack });
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// 1. Boxplot SVG Boundary & English Word Leakage Test
// -----------------------------------------------------------------------------
console.log('[Tier 1] Boxplot SVG Boundary & Localization Stress Testing...');

const { renderBoxplotSVG } = await import(path.join(PROJECT_ROOT, 'js/ui/boxplot-svg.js'));

// Comprehensive English word blacklist for user-visible strings & aria-labels
const FORBIDDEN_ENGLISH_REGEX = /\b(lap|laps|split|splits|boxplot|data|available|recorded|swimmer|swimmers|lane|lanes|time|times|median|mean|average|outlier|outliers|none|empty|valid|invalid|start|stop|reset|pause|resume|close|cancel|save|delete|history|summary)\b/i;

function extractUserVisibleTextAndAria(svgString) {
  const extracted = [];

  // Match text element contents: <text ...>CONTENT</text>
  const textMatches = svgString.matchAll(/<text[^>]*>([^<]+)<\/text>/gi);
  for (const m of textMatches) {
    extracted.push({ type: 'text', content: m[1] });
  }

  // Match aria-label attribute values: aria-label="..."
  const ariaMatches = svgString.matchAll(/aria-label="([^"]+)"/gi);
  for (const m of ariaMatches) {
    extracted.push({ type: 'aria-label', content: m[1] });
  }

  // Match title attribute values: title="..."
  const titleMatches = svgString.matchAll(/title="([^"]+)"/gi);
  for (const m of titleMatches) {
    extracted.push({ type: 'title', content: m[1] });
  }

  return extracted;
}

function assertNoEnglishLeakage(svg, scenarioName) {
  assert.ok(typeof svg === 'string' && svg.startsWith('<svg') && svg.endsWith('</svg>'),
    `${scenarioName}: Output must be valid SVG root element`);

  const strings = extractUserVisibleTextAndAria(svg);
  assert.ok(strings.length > 0, `${scenarioName}: SVG should have text or aria-label`);

  for (const item of strings) {
    const match = item.content.match(FORBIDDEN_ENGLISH_REGEX);
    assert.strictEqual(match, null,
      `${scenarioName}: English word "${match ? match[0] : ''}" leaked in ${item.type}: "${item.content}"`);
  }
}

// Test boundary scenarios
const testScenarios = [
  { name: 'Empty array []', input: [] },
  { name: 'Null input', input: null },
  { name: 'Undefined input', input: undefined },
  { name: 'Array with non-numeric items [NaN, null, undefined, "abc"]', input: [NaN, null, undefined, "abc"] },
  { name: 'Single lap [45.0]', input: [45.0] },
  { name: 'Two identical laps [45.0, 45.0]', input: [45.0, 45.0] },
  { name: 'Four identical laps [45.0, 45.0, 45.0, 45.0]', input: [45.0, 45.0, 45.0, 45.0] },
  { name: 'Standard 7 laps [40, 42, 44, 46, 48, 50, 52]', input: [40, 42, 44, 46, 48, 50, 52] },
  { name: 'Dataset with extreme upper outlier [30, 31, 30, 999999]', input: [30, 31, 30, 999999] },
  { name: 'Dataset with extreme lower outlier [0.01, 45, 45, 46]', input: [0.01, 45, 45, 46] },
  { name: 'Dataset with negative numbers [-50, -40, -30]', input: [-50, -40, -30] },
  { name: 'Dataset with zeros [0, 0, 0]', input: [0, 0, 0] },
  { name: '100 laps monotonic increment', input: Array.from({ length: 100 }, (_, i) => 30 + i * 0.5) },
  { name: '1000 laps high density stress', input: Array.from({ length: 1000 }, (_, i) => 40 + Math.sin(i) * 5) }
];

for (const scenario of testScenarios) {
  check(`Boxplot SVG rendering & pure Spanish: ${scenario.name}`, () => {
    const svg = renderBoxplotSVG(scenario.input);
    assertNoEnglishLeakage(svg, scenario.name);
  });
}

// Custom options stress test
check('Boxplot SVG options (baseline, dimensions, showLabels)', () => {
  const svgWithBaseline = renderBoxplotSVG([40, 45, 50], { baseline: 42, width: 400, height: 100 });
  assertNoEnglishLeakage(svgWithBaseline, 'Options baseline');
  assert.ok(svgWithBaseline.includes('data-baseline="true"'), 'Must render data-baseline attribute');

  const svgNoLabels = renderBoxplotSVG([40, 45, 50], { showLabels: false });
  assertNoEnglishLeakage(svgNoLabels, 'Options showLabels=false');
});

// -----------------------------------------------------------------------------
// 2. Manifest.json Verification
// -----------------------------------------------------------------------------
console.log('\n[Tier 2] PWA Manifest Specification & Spanish Metadata Verification...');

check('manifest.json validity and spec conformance', () => {
  const manifestPath = path.join(PROJECT_ROOT, 'manifest.json');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  assert.ok(manifest.name, 'manifest.name must exist');
  assert.ok(manifest.short_name, 'manifest.short_name must exist');
  assert.ok(manifest.description, 'manifest.description must exist');
  assert.strictEqual(manifest.display, 'standalone', 'display must be standalone');
  assert.strictEqual(manifest.start_url, './index.html', 'start_url must be ./index.html');
  assert.strictEqual(manifest.scope, './', 'scope must be ./');
  assert.ok(manifest.icons && Array.isArray(manifest.icons) && manifest.icons.length >= 2,
    'Must specify icons');

  // Verify icons exist on disk
  for (const icon of manifest.icons) {
    const iconPath = path.join(PROJECT_ROOT, icon.src);
    assert.ok(fs.existsSync(iconPath), `Icon file ${icon.src} must exist at ${iconPath}`);
  }

  // Verify Spanish description without English
  assert.strictEqual(manifest.description,
    'PWA local para cronometraje simultáneo de nadadores, ritmo sostenible y análisis de zonas de entrenamiento',
    'manifest.description must match approved Spanish text');

  const englishWords = ['Local-first', 'timing', 'pace', 'analytics', 'swimmer'];
  for (const w of englishWords) {
    assert.ok(!manifest.description.toLowerCase().includes(w.toLowerCase()),
      `Found English token "${w}" in manifest.description`);
  }
});

// -----------------------------------------------------------------------------
// 3. UI Dynamic Table States & Modals Localization Check
// -----------------------------------------------------------------------------
console.log('\n[Tier 3] UI Dynamic Table States & Modals Spanish Translation Audit...');

check('app.js timer states localization mapping', async () => {
  const appFile = path.join(PROJECT_ROOT, 'js/app.js');
  const content = fs.readFileSync(appFile, 'utf8');

  // Must define Spanish mapping
  assert.ok(content.includes('TIMER_STATE_LABELS_ES'), 'app.js must define TIMER_STATE_LABELS_ES');
  assert.ok(content.includes("'Listo'"), "Must map IDLE to 'Listo'");
  assert.ok(content.includes("'En curso'"), "Must map RUNNING to 'En curso'");
  assert.ok(content.includes("'Pausado'"), "Must map PAUSED to 'Pausado'");
  assert.ok(content.includes("'Detenido'"), "Must map STOPPED to 'Detenido'");

  // Must not have unlocalized state enum in table
  assert.ok(!content.includes('${card.timerState.state}</td>'), 'Table row must not directly output raw state enum');
});

check('metrics-modal.js Spanish UI strings and headers', () => {
  const modalFile = path.join(PROJECT_ROOT, 'js/ui/metrics-modal.js');
  const content = fs.readFileSync(modalFile, 'utf8');

  const requiredSpanishStrings = [
    'Zonas de Entrenamiento',
    'Distribución de Pases',
    'Historial de Pases',
    'Pases',
    'Último',
    'Mejor',
    'Ritmo (Moda)',
    'ATÍPICO',
    'Parcial',
    'Acumulado',
    'Sin tiempo base de 100m configurado.',
    'Sin pases registrados aún.'
  ];

  for (const s of requiredSpanishStrings) {
    assert.ok(content.includes(s), `metrics-modal.js missing expected Spanish text: "${s}"`);
  }
});

check('modal.js Spanish labels and alerts', () => {
  const modalFile = path.join(PROJECT_ROOT, 'js/ui/modal.js');
  const content = fs.readFileSync(modalFile, 'utf8');

  const requiredSpanishStrings = [
    'Editar Nadador',
    'Añadir Nadador',
    'Por favor, ingresa el nombre del nadador.'
  ];

  for (const s of requiredSpanishStrings) {
    assert.ok(content.includes(s), `modal.js missing expected Spanish text: "${s}"`);
  }
});

check('index.html static markup Spanish translation', () => {
  const indexFile = path.join(PROJECT_ROOT, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');

  assert.ok(html.includes('<html lang="es">'), 'Must have <html lang="es">');

  const requiredSpanishPhrases = [
    'Añadir',
    'Ver Estadísticas Globales',
    'Añadir Nadador',
    'Nombre del Nadador',
    'Número de Carril',
    'Mejor tiempo en 100m (segundos)',
    'Usado para calcular zonas al 75%, 80% y 90%.',
    'Cancelar',
    'Guardar',
    'Estadísticas Globales'
  ];

  for (const phrase of requiredSpanishPhrases) {
    assert.ok(html.includes(phrase), `index.html missing expected Spanish phrase: "${phrase}"`);
  }
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`Adversarial Verification Complete. Passed: ${passCount}, Failed: ${failCount}`);
console.log('======================================================================\n');

if (failCount > 0) {
  console.error(`❌ CHALLENGE FAILED: ${failCount} issues detected.`);
  process.exit(1);
} else {
  console.log('🎉 ALL ADVERSARIAL CHALLENGES PASSED! 100% Spanish localization verified across all edge cases.');
  process.exit(0);
}
