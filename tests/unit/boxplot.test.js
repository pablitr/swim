import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { renderBoxplotSVG, createBoxplotElement, renderBoxplot } from '../../js/ui/boxplot-svg.js';

describe('Boxplot Pure SVG Visualizer Unit Tests', () => {
  test('renders empty state SVG when laps array is empty', () => {
    const svg = renderBoxplotSVG([]);
    assert.ok(svg.includes('<svg viewBox="0 0 300 80"'), 'Should render svg with 300 80 viewBox');
    assert.ok(svg.includes('Sin datos de pases registrados'), 'Should contain empty state message');
    assert.ok(!svg.includes('<circle'), 'Should not contain circles');
  });

  test('renders empty state SVG when laps is null or invalid', () => {
    const svgNull = renderBoxplotSVG(null);
    assert.ok(svgNull.includes('Sin datos de pases registrados'));

    const svgInvalid = renderBoxplotSVG(['not-a-number']);
    assert.ok(svgInvalid.includes('Sin tiempos de pase válidos'));
  });

  test('renders boxplot elements for standard laps dataset', () => {
    const laps = [40, 42, 44, 46, 48, 50, 52];
    const svg = renderBoxplotSVG(laps);

    assert.ok(svg.includes('<svg viewBox="0 0 300 80"'), 'Has viewBox');
    assert.ok(svg.includes('<rect'), 'Renders IQR box <rect>');
    assert.ok(svg.includes('<line'), 'Renders whiskers and median <line>');
    assert.ok(svg.includes('46.00s') || svg.includes('46.0s'), 'Displays median label');
    // No outliers in this dataset
    assert.ok(!svg.includes('data-outlier="true"'), 'Should not flag false outliers');
  });

  test('renders outlier circle elements with data attributes when outliers exist', () => {
    const laps = [42, 44, 45, 45, 46, 48, 60];
    const svg = renderBoxplotSVG(laps);

    assert.ok(svg.includes('<circle'), 'Should render circle for outlier');
    assert.ok(svg.includes('data-outlier="true"'), 'Circle must have data-outlier attribute');
    assert.ok(svg.includes('data-value="60"'), 'Circle must store outlier value in data-value attribute');
  });

  test('handles identical laps [45, 45, 45, 45] without NaN or zero division errors', () => {
    const laps = [45, 45, 45, 45];
    const svg = renderBoxplotSVG(laps);

    assert.ok(!svg.includes('NaN'), 'SVG must never contain NaN in coordinates');
    assert.ok(svg.includes('<rect'), 'Renders box rect');
    assert.ok(svg.includes('<line'), 'Renders median line');
  });

  test('handles single lap [50.0] gracefully', () => {
    const laps = [50.0];
    const svg = renderBoxplotSVG(laps);

    assert.ok(!svg.includes('NaN'), 'Single lap must not produce NaN');
    assert.ok(svg.includes('50.00s') || svg.includes('50.0s'), 'Shows median label for single lap');
  });

  test('createBoxplotElement returns null in non-DOM environment or element in DOM', () => {
    // In Node.js environment without DOM, createBoxplotElement returns null
    const el = createBoxplotElement([40, 50]);
    if (typeof document === 'undefined') {
      assert.strictEqual(el, null);
    } else {
      assert.ok(el instanceof SVGElement || el instanceof Element);
    }
  });

  test('renderBoxplot handles missing container safely', () => {
    assert.doesNotThrow(() => {
      renderBoxplot(null, [45, 46]);
    });

    const mockContainer = { innerHTML: '' };
    renderBoxplot(mockContainer, [45, 46]);
    assert.ok(mockContainer.innerHTML.includes('<svg'));
  });

  test('renders baseline marker when options.baseline is provided within scale', () => {
    const laps = [40, 45, 50];
    const svgWithBaseline = renderBoxplotSVG(laps, { baseline: 45.0 });
    assert.ok(svgWithBaseline.includes('data-baseline="true"'), 'Should render baseline indicator line');

    const svgWithoutBaseline = renderBoxplotSVG(laps);
    assert.ok(!svgWithoutBaseline.includes('data-baseline="true"'), 'Should not render baseline indicator when omitted');
  });
});
