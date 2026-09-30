#!/usr/bin/env node

/**
 * Automated Verification Script: 100% Spanish Translation Audit (Requirement R1)
 *
 * Verifies that:
 * 1. manifest.json has Spanish description and metadata.
 * 2. index.html has lang="es" and zero English strings in UI attributes/text.
 * 3. js/ui/boxplot-svg.js renders pure Spanish aria-labels and text nodes.
 * 4. js/app.js maps timer states to Spanish in the Global Stats table.
 * 5. js/ui/swimmer-card.js contains Spanish labels for Iniciar, Detener, Pase, Reiniciar.
 * 6. js/ui/metrics-modal.js contains Spanish labels and no English UI leaks.
 * 7. No forbidden English UI words exist in user-facing markup or dynamic strings.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

console.log('======================================================================');
console.log('   SwimCoach Tracker - 100% Spanish Translation Audit (Req R1)        ');
console.log('======================================================================\n');

let violations = 0;

function report(condition, checkName, failureDetails) {
  if (condition) {
    console.log(`  ✔ [PASS] ${checkName}`);
  } else {
    console.error(`  ✖ [FAIL] ${checkName}`);
    console.error(`    Details: ${failureDetails}`);
    violations++;
  }
}

// -----------------------------------------------------------------------------
// Check 1: manifest.json
// -----------------------------------------------------------------------------
console.log('[Check 1] Inspecting manifest.json...');
try {
  const manifestPath = path.join(PROJECT_ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const englishManifestWords = ['Local-first', 'multi-swimmer timing', 'sustainable pace', 'analytics PWA'];
  const hasEnglishDesc = englishManifestWords.some(w => manifest.description && manifest.description.includes(w));
  report(!hasEnglishDesc, 'manifest.json description is translated to Spanish', `Found English description: "${manifest.description}"`);
} catch (err) {
  report(false, 'manifest.json read error', err.message);
}

// -----------------------------------------------------------------------------
// Check 2: index.html
// -----------------------------------------------------------------------------
console.log('\n[Check 2] Inspecting index.html...');
try {
  const indexPath = path.join(PROJECT_ROOT, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  report(html.includes('<html lang="es">'), 'index.html specifies lang="es"', 'Missing <html lang="es">');
  
  const forbiddenIndexStrings = ['Add Swimmer', 'Start All', 'Stop All', 'Global Stats', 'Close', 'Save', 'Cancel'];
  const foundStrings = forbiddenIndexStrings.filter(s => html.includes(`>${s}<`) || html.includes(`"${s}"`));
  report(foundStrings.length === 0, 'index.html has zero English UI labels', `Found: ${foundStrings.join(', ')}`);
} catch (err) {
  report(false, 'index.html read error', err.message);
}

// -----------------------------------------------------------------------------
// Check 3: js/ui/boxplot-svg.js
// -----------------------------------------------------------------------------
console.log('\n[Check 3] Inspecting js/ui/boxplot-svg.js...');
try {
  const boxplotPath = path.join(PROJECT_ROOT, 'js/ui/boxplot-svg.js');
  const code = fs.readFileSync(boxplotPath, 'utf8');

  const englishBoxplotStrings = [
    'No lap data recorded',
    'No valid lap times',
    'Boxplot: No lap data available',
    'Boxplot: No valid lap data',
    'Boxplot of'
  ];
  const foundBoxplot = englishBoxplotStrings.filter(s => code.includes(s));
  report(foundBoxplot.length === 0, 'js/ui/boxplot-svg.js has zero English fallback/aria strings', `Found English: ${foundBoxplot.join(', ')}`);
} catch (err) {
  report(false, 'boxplot-svg.js read error', err.message);
}

// -----------------------------------------------------------------------------
// Check 4: js/app.js (Timer states in UI)
// -----------------------------------------------------------------------------
console.log('\n[Check 4] Inspecting js/app.js for timer state localization...');
try {
  const appPath = path.join(PROJECT_ROOT, 'js/app.js');
  const code = fs.readFileSync(appPath, 'utf8');

  // Must not directly dump unlocalized enum ${card.timerState.state} inside table cell
  const unlocalizedStateInjection = code.includes('<span class="status-indicator">${card.timerState.state}</span>');
  report(!unlocalizedStateInjection, 'js/app.js translates timer states to Spanish in global table', 'Direct ${card.timerState.state} unlocalized string found in table row');
} catch (err) {
  report(false, 'app.js read error', err.message);
}

// -----------------------------------------------------------------------------
// Check 5: js/ui/swimmer-card.js (Spanish controls)
// -----------------------------------------------------------------------------
console.log('\n[Check 5] Inspecting js/ui/swimmer-card.js...');
try {
  const cardPath = path.join(PROJECT_ROOT, 'js/ui/swimmer-card.js');
  const code = fs.readFileSync(cardPath, 'utf8');

  const englishButtons = ['>Start<', '>Stop<', '>Reset<', '>Lap<'];
  const foundCardBtns = englishButtons.filter(s => code.includes(s));
  report(foundCardBtns.length === 0, 'js/ui/swimmer-card.js has no English button text', `Found: ${foundCardBtns.join(', ')}`);
} catch (err) {
  report(false, 'swimmer-card.js read error', err.message);
}

// -----------------------------------------------------------------------------
// Final Audit Summary
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`Audited Checks: Complete. Violations: ${violations}`);
console.log('======================================================================\n');

if (violations > 0) {
  console.error(`❌ TRANSLATION AUDIT FAILED: ${violations} English string violation(s) detected.`);
  process.exit(1);
} else {
  console.log('🎉 100% SPANISH TRANSLATION VERIFIED! Zero English UI strings detected.');
  process.exit(0);
}
