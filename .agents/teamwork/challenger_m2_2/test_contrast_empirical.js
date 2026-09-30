/**
 * Empirical Test Harness 3: WCAG 2.1 Contrast Ratio Verification
 *
 * Mathematically and empirically computes the relative luminance and contrast ratios
 * according to the W3C WCAG 2.1 specification:
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * Verifies Requirement 3:
 * "Verify that the Pase button text-to-background contrast ratio exceeds 11:1 (WCAG AAA)."
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssVarsPath = path.resolve(__dirname, '../../../css/variables.css');

console.log('======================================================================');
console.log('  Empirical Test Harness 3: WCAG 2.1 Contrast Ratio Analysis          ');
console.log('======================================================================\n');

// 1. W3C WCAG 2.1 Relative Luminance Algorithm
function srgbToLinear(val255) {
  const c = val255 / 255.0;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex) {
  let cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(ch => ch + ch).join('');
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function calculateRelativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function calculateContrastRatio(hex1, hex2) {
  const l1 = calculateRelativeLuminance(hex1);
  const l2 = calculateRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// 2. Read tokens from css/variables.css
const cssVarsContent = fs.readFileSync(cssVarsPath, 'utf8');

function extractVar(name) {
  const regex = new RegExp(`${name}\\s*:\\s*([^;]+);`, 'i');
  const match = cssVarsContent.match(regex);
  if (!match) return null;
  // strip comments
  return match[1].split('/*')[0].trim();
}

const colorLap = extractVar('--color-lap') || '#f59e0b';
const colorLapText = extractVar('--color-lap-text') || '#060b14';
const colorStart = extractVar('--color-start') || '#10b981';
const colorStop = extractVar('--color-stop') || '#ef4444';
const colorReset = extractVar('--color-reset') || '#475569';
const colorResetText = extractVar('--color-reset-text') || '#f8fafc';

console.log('[Phase 1] Token Extraction from css/variables.css:');
console.log(`  --color-lap:        ${colorLap}`);
console.log(`  --color-lap-text:   ${colorLapText}`);
console.log(`  --color-start:      ${colorStart}`);
console.log(`  --color-stop:       ${colorStop}`);
console.log(`  --color-reset:      ${colorReset}`);
console.log(`  --color-reset-text: ${colorResetText}`);

console.log('\n[Phase 2] Luminance & Contrast Computation for Pase Button (.btn-card-lap):');
const lumBgLap = calculateRelativeLuminance(colorLap);
const lumFgLap = calculateRelativeLuminance(colorLapText);
const contrastLap = calculateContrastRatio(colorLap, colorLapText);

console.log(`  Background (${colorLap}): Relative Luminance = ${lumBgLap.toFixed(5)}`);
console.log(`  Foreground (${colorLapText}): Relative Luminance = ${lumFgLap.toFixed(5)}`);
console.log(`  Calculated Contrast Ratio: ${contrastLap.toFixed(3)}:1`);

const targetRatio = 11.0;
const satisfies11to1 = contrastLap > targetRatio;

console.log(`\n  Target Requirement: > ${targetRatio}:1 (WCAG AAA high contrast requirement)`);
console.log(`  Result: ${satisfies11to1 ? '✔ SATISFIED' : '❌ VIOLATED (Deficit of ' + (targetRatio - contrastLap).toFixed(3) + ')'}`);

// Check theoretical max contrast against #000000
const contrastBlack = calculateContrastRatio(colorLap, '#000000');
console.log(`  Theoretical maximum contrast on ${colorLap} against pure black (#000000): ${contrastBlack.toFixed(3)}:1`);

console.log('\n[Phase 3] Contrast Analysis of All Primary Buttons:');

const buttons = [
  { name: 'Pase Button (.btn-card-lap)', bg: colorLap, fg: colorLapText },
  { name: 'Iniciar Button (.btn-card-start)', bg: colorStart, fg: '#ffffff' },
  { name: 'Detener Button (.btn-card-stop)', bg: colorStop, fg: '#ffffff' },
  { name: 'Reiniciar Button (.btn-card-reset)', bg: colorReset, fg: colorResetText }
];

for (const btn of buttons) {
  const cr = calculateContrastRatio(btn.bg, btn.fg);
  const wcagAA = cr >= 4.5 ? 'PASS' : 'FAIL';
  const wcagAAA = cr >= 7.0 ? 'PASS' : 'FAIL';
  const exceed11 = cr > 11.0 ? 'PASS' : 'FAIL';
  console.log(`  ${btn.name}:`);
  console.log(`    bg: ${btn.bg}, fg: ${btn.fg}`);
  console.log(`    Contrast: ${cr.toFixed(2)}:1 | WCAG AA (>=4.5): ${wcagAA} | WCAG AAA (>=7.0): ${wcagAAA} | Exceeds 11:1: ${exceed11}`);
}

console.log('\n[Phase 4] Remediation Recommendation for Pase Button:');
const candidateColors = ['#f59e0b', '#fbbf24', '#facc15', '#fde047', '#ffea00'];
for (const cand of candidateColors) {
  const candCr = calculateContrastRatio(cand, colorLapText);
  console.log(`  Candidate bg ${cand}: Contrast with ${colorLapText} = ${candCr.toFixed(2)}:1 ${candCr > 11.0 ? '✔ (> 11:1)' : '❌ (< 11:1)'}`);
}

console.log('\n======================================================================');
if (satisfies11to1) {
  console.log('🎉 PASE BUTTON CONTRAST VERIFIED (> 11:1)');
} else {
  console.log(`⚠️ FINDING: Pase button contrast is ${contrastLap.toFixed(2)}:1, which does not exceed the required 11:1.`);
}
console.log('======================================================================');
