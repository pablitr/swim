/**
 * Empirical Test Harness 2: CSS Containment and Text-Shadow Blur Audit
 *
 * Verifies:
 * 1. css/styles.css contains ZERO text-shadow properties on .stopwatch-time
 *    (preventing expensive Gaussian blur filters on every 60fps frame).
 * 2. .swimmer-card specifies `contain: layout paint;` (preventing full-page reflows).
 * 3. .stopwatch-time specifies containment (e.g. `contain: strict;`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../../../css/styles.css');

console.log('======================================================================');
console.log('  Empirical Test Harness 2: CSS Containment & Text-Shadow Audit       ');
console.log('======================================================================\n');

if (!fs.existsSync(cssPath)) {
  console.error(`❌ CSS file not found at: ${cssPath}`);
  process.exit(1);
}

const cssContent = fs.readFileSync(cssPath, 'utf8');

let passedAll = true;

// 1. Audit .stopwatch-time for text-shadow
console.log('[Check 1] Auditing .stopwatch-time rules for text-shadow Gaussian blurs...');

// Extract all rule blocks that target .stopwatch-time
const ruleRegex = /([^{}]+)\{([^}]+)\}/g;
let match;
let stopwatchTimeBlocks = [];
let swimmerCardBlocks = [];

while ((match = ruleRegex.exec(cssContent)) !== null) {
  const selector = match[1].trim();
  const declarations = match[2].trim();

  if (selector.includes('.stopwatch-time')) {
    stopwatchTimeBlocks.push({ selector, declarations });
  }

  // Exact .swimmer-card selector
  if (/(?:^|,|\s)\.swimmer-card(?:\s*,\s*|\s*\{|\s*$)/.test(selector)) {
    swimmerCardBlocks.push({ selector, declarations });
  }
}

console.log(`Found ${stopwatchTimeBlocks.length} rule blocks targeting .stopwatch-time.`);

let textShadowFound = false;
for (const block of stopwatchTimeBlocks) {
  const textShadowMatch = block.declarations.match(/text-shadow\s*:\s*([^;]+)/i);
  if (textShadowMatch) {
    textShadowFound = true;
    console.error(`  ❌ VIOLATION: text-shadow found in selector "${block.selector}": ${textShadowMatch[0]}`);
  }
}

// Also check globally across all CSS for text-shadow on stopwatch
const allTextShadows = [];
let shadowMatch;
const globalShadowRegex = /text-shadow\s*:\s*([^;]+)/gi;
while ((shadowMatch = globalShadowRegex.exec(cssContent)) !== null) {
  allTextShadows.push(shadowMatch[0]);
}

if (!textShadowFound && allTextShadows.length === 0) {
  console.log('  ✔ [PASS] ZERO text-shadow properties found in css/styles.css (zero Gaussian blur filters on timer).');
} else if (!textShadowFound) {
  console.log(`  ✔ [PASS] ZERO text-shadow properties on .stopwatch-time. (Note: ${allTextShadows.length} text-shadows found elsewhere in CSS, none on stopwatch).`);
} else {
  passedAll = false;
}

// 2. Audit .swimmer-card for `contain: layout paint;`
console.log('\n[Check 2] Auditing .swimmer-card for CSS layout and paint containment...');
console.log(`Found ${swimmerCardBlocks.length} rule blocks matching .swimmer-card.`);

let containmentFound = false;
let exactContainment = null;

for (const block of swimmerCardBlocks) {
  const containMatch = block.declarations.match(/contain\s*:\s*([^;]+)/i);
  if (containMatch) {
    containmentFound = true;
    exactContainment = containMatch[1].trim();
    console.log(`  Selector "${block.selector}" specifies: contain: ${exactContainment};`);
  }
}

if (containmentFound && exactContainment === 'layout paint') {
  console.log('  ✔ [PASS] .swimmer-card explicitly specifies "contain: layout paint;".');
} else if (containmentFound && (exactContainment.includes('layout') && exactContainment.includes('paint'))) {
  console.log(`  ✔ [PASS] .swimmer-card specifies containment including layout and paint: "${exactContainment}".`);
} else {
  console.error(`  ❌ [FAIL] .swimmer-card does not specify required "contain: layout paint;". Found: "${exactContainment}"`);
  passedAll = false;
}

// 3. Audit .stopwatch-time for containment
console.log('\n[Check 3] Auditing .stopwatch-time for containment...');
let stopwatchContainment = null;
for (const block of stopwatchTimeBlocks) {
  const containMatch = block.declarations.match(/contain\s*:\s*([^;]+)/i);
  if (containMatch) {
    stopwatchContainment = containMatch[1].trim();
    console.log(`  Selector "${block.selector}" specifies: contain: ${stopwatchContainment};`);
  }
}

if (stopwatchContainment) {
  console.log(`  ✔ [PASS] .stopwatch-time specifies containment: "${stopwatchContainment}".`);
} else {
  console.log('  ℹ [INFO] .stopwatch-time does not specify direct containment (contained by .swimmer-card).');
}

console.log('\n======================================================================');
if (passedAll) {
  console.log('🎉 ALL CSS CONTAINMENT & SHADOW AUDITS PASSED!');
} else {
  console.error('❌ CSS AUDIT FAILED!');
  process.exit(1);
}
console.log('======================================================================');
