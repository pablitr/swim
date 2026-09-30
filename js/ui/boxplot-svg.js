/**
 * Pure SVG Boxplot Visualizer Component for SwimCoach Tracker
 *
 * Zero external dependencies (No D3, Chart.js, or external SVG libraries).
 *
 * Renders a responsive, high-contrast horizontal boxplot compliant with
 * outdoor poolside sunlight legibility (WCAG AAA/AA).
 *
 * SVG Elements:
 *   - <rect> for IQR box (Q1 to Q3)
 *   - <line> for median
 *   - <line> whiskers with end caps (Tukey inliers)
 *   - <circle> for outlier points with data-outlier and data-value attributes
 *   - <text> labels for Min, Median, and Max in monospace font
 */

import { computeBoxplotStats } from '../analytics/stats.js';

/**
 * Generates pure SVG string for a horizontal boxplot.
 *
 * @param {number[]} lapsSeconds - Array of lap times in seconds
 * @param {Object} [options={}] - Customization options
 * @param {number} [options.width=300] - SVG viewBox width
 * @param {number} [options.height=80] - SVG viewBox height
 * @param {string} [options.className='boxplot-svg'] - CSS class name
 * @param {boolean} [options.showLabels=true] - Whether to render Min/Med/Max text labels
 * @returns {string} Pure SVG markup string
 */
export function renderBoxplotSVG(lapsSeconds, options = {}) {
  const width = options.width || 300;
  const height = options.height || 80;
  const className = options.className || 'boxplot-svg';
  const showLabels = options.showLabels !== false;

  // Empty state handling
  if (!Array.isArray(lapsSeconds) || lapsSeconds.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="${className}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Boxplot: No lap data available">
  <rect width="${width}" height="${height}" fill="transparent" />
  <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" fill="var(--text-muted, #94a3b8)" font-size="12" font-family="var(--font-sans, sans-serif)">No lap data recorded</text>
</svg>`;
  }

  const stats = computeBoxplotStats(lapsSeconds);
  if (stats.count === 0 || stats.min === null) {
    return `<svg viewBox="0 0 ${width} ${height}" class="${className}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Boxplot: No valid lap data">
  <rect width="${width}" height="${height}" fill="transparent" />
  <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" fill="var(--text-muted, #94a3b8)" font-size="12" font-family="var(--font-sans, sans-serif)">No valid lap times</text>
</svg>`;
  }

  // Determine non-outlier whisker extremities
  const outlierSet = new Set(stats.outliers);
  const inliers = lapsSeconds.filter((x) => !outlierSet.has(x));
  const whiskerLower = inliers.length > 0 ? Math.min(...inliers) : stats.min;
  const whiskerUpper = inliers.length > 0 ? Math.max(...inliers) : stats.max;

  // Layout boundaries
  const plotLeft = 32;
  const plotRight = width - 32;
  const plotWidth = plotRight - plotLeft;

  let scaleMin = stats.min;
  let scaleMax = stats.max;

  if (scaleMin === scaleMax) {
    scaleMin -= 1;
    scaleMax += 1;
  } else {
    // 6% boundary padding so markers and end caps don't clip
    const span = scaleMax - scaleMin;
    scaleMin -= span * 0.06;
    scaleMax += span * 0.06;
  }

  const scaleX = (val) => {
    return plotLeft + ((val - scaleMin) / (scaleMax - scaleMin)) * plotWidth;
  };

  const boxCenterY = 32;
  const boxHeight = 26;
  const boxTop = boxCenterY - boxHeight / 2; // 19

  // Coordinates
  const q1X = scaleX(stats.q1);
  const q3X = scaleX(stats.q3);
  const medianX = scaleX(stats.median);
  const wLowerX = scaleX(whiskerLower);
  const wUpperX = scaleX(whiskerUpper);

  const rectX = Math.min(q1X, q3X);
  const rectW = Math.max(2, Math.abs(q3X - q1X));

  // Build SVG elements
  const elements = [];

  // 1. Lower Whisker line + end cap
  if (wLowerX < q1X) {
    elements.push(
      `<line x1="${wLowerX.toFixed(2)}" y1="${boxCenterY}" x2="${q1X.toFixed(2)}" y2="${boxCenterY}" stroke="var(--border-strong, #38bdf8)" stroke-width="2" stroke-linecap="round" />`
    );
    elements.push(
      `<line x1="${wLowerX.toFixed(2)}" y1="${boxCenterY - 10}" x2="${wLowerX.toFixed(2)}" y2="${boxCenterY + 10}" stroke="var(--border-strong, #38bdf8)" stroke-width="2" stroke-linecap="round" />`
    );
  }

  // 2. Upper Whisker line + end cap
  if (wUpperX > q3X) {
    elements.push(
      `<line x1="${q3X.toFixed(2)}" y1="${boxCenterY}" x2="${wUpperX.toFixed(2)}" y2="${boxCenterY}" stroke="var(--border-strong, #38bdf8)" stroke-width="2" stroke-linecap="round" />`
    );
    elements.push(
      `<line x1="${wUpperX.toFixed(2)}" y1="${boxCenterY - 10}" x2="${wUpperX.toFixed(2)}" y2="${boxCenterY + 10}" stroke="var(--border-strong, #38bdf8)" stroke-width="2" stroke-linecap="round" />`
    );
  }

  // 3. IQR Box
  elements.push(
    `<rect x="${rectX.toFixed(2)}" y="${boxTop}" width="${rectW.toFixed(2)}" height="${boxHeight}" fill="var(--bg-surface-highlight, #1b2e52)" stroke="var(--color-pool-bright, #38bdf8)" stroke-width="2" rx="4" />`
  );

  // 4. Median line
  elements.push(
    `<line x1="${medianX.toFixed(2)}" y1="${boxTop - 3}" x2="${medianX.toFixed(2)}" y2="${boxTop + boxHeight + 3}" stroke="var(--border-focus, #00f0ff)" stroke-width="3" stroke-linecap="round" />`
  );

  // 5. Outlier points (<circle> with data attributes)
  if (stats.outliers && stats.outliers.length > 0) {
    stats.outliers.forEach((outlierVal) => {
      const cx = scaleX(outlierVal);
      elements.push(
        `<circle cx="${cx.toFixed(2)}" cy="${boxCenterY}" r="5" fill="var(--color-outlier, #ec4899)" stroke="#ffffff" stroke-width="1.5" data-outlier="true" data-value="${outlierVal}" />`
      );
    });
  }

  // 6. Text Labels (Min, Median, Max)
  if (showLabels) {
    const minX = scaleX(stats.min);
    const maxX = scaleX(stats.max);

    // If Min is distinct from Median
    if (Math.abs(medianX - minX) > 28) {
      elements.push(
        `<text x="${minX.toFixed(2)}" y="68" text-anchor="middle" fill="var(--text-muted, #94a3b8)" font-size="10" font-family="var(--font-mono, monospace)">${stats.min.toFixed(1)}s</text>`
      );
    }

    // Median label (prominent)
    elements.push(
      `<text x="${medianX.toFixed(2)}" y="68" text-anchor="middle" fill="var(--border-focus, #00f0ff)" font-size="11" font-weight="700" font-family="var(--font-mono, monospace)">${stats.median.toFixed(2)}s</text>`
    );

    // If Max is distinct from Median
    if (Math.abs(maxX - medianX) > 28) {
      elements.push(
        `<text x="${maxX.toFixed(2)}" y="68" text-anchor="middle" fill="var(--text-muted, #94a3b8)" font-size="10" font-family="var(--font-mono, monospace)">${stats.max.toFixed(1)}s</text>`
      );
    }
  }

  // 7. Baseline Marker (if options.baseline is provided and within scale bounds)
  const baseline = Number(options.baseline);
  if (!isNaN(baseline) && baseline > 0 && baseline >= scaleMin && baseline <= scaleMax) {
    const bX = scaleX(baseline);
    elements.push(
      `<line x1="${bX.toFixed(2)}" y1="${boxTop - 6}" x2="${bX.toFixed(2)}" y2="${boxTop + boxHeight + 6}" stroke="var(--color-zone-100, #ef4444)" stroke-width="1.5" stroke-dasharray="3,3" data-baseline="true" />`
    );
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="${className}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Boxplot of ${stats.count} laps (Median: ${stats.median}s)">
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Creates an SVG DOM element for the boxplot (browser context).
 *
 * @param {number[]} lapsSeconds - Array of lap times in seconds
 * @param {Object} [options={}] - Customization options
 * @returns {SVGSVGElement|null} SVG Element or null if outside DOM environment
 */
export function createBoxplotElement(lapsSeconds, options = {}) {
  if (typeof document === 'undefined') return null;
  const temp = document.createElement('div');
  temp.innerHTML = renderBoxplotSVG(lapsSeconds, options);
  return temp.firstElementChild;
}

/**
 * Renders the boxplot into an HTML container element.
 *
 * @param {HTMLElement|string} container - Container element or CSS selector
 * @param {number[]} lapsSeconds - Array of lap times in seconds
 * @param {Object} [options={}] - Customization options
 */
export function renderBoxplot(container, lapsSeconds, options = {}) {
  if (!container) return;
  let target = container;
  if (typeof container === 'string' && typeof document !== 'undefined') {
    target = document.querySelector(container);
  }
  if (target && typeof target.innerHTML === 'string') {
    target.innerHTML = renderBoxplotSVG(lapsSeconds, options);
  }
}
