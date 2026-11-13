import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { Ctx } from '../types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => char + char)
        .join('')
    : normalized;

  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const mixHex = (from: string, to: string, amount: number) => {
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex({
    r: lerp(start.r, end.r, amount),
    g: lerp(start.g, end.g, amount),
    b: lerp(start.b, end.b, amount),
  });
};

const colorForPercent = (pct: number) => {
  const clamped = clamp(pct, 0, 100);

  if (clamped <= 50) {
    return mixHex('#22c55e', '#f59e0b', clamped / 50);
  }

  return mixHex('#f59e0b', '#ef4444', (clamped - 50) / 50);
};

const bar = (pct: number) => {
  const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
};

const ctx = atom({ plugin: 'context-band', key: 'ctx' } as const, null);

async function refresh($: EngineInterface) {
  const { context } = await $.session.usage();
  const next: Ctx = {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
  };
  await update($, ctx, () => next);
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const r = await next(e);
    await refresh($);
    return r;
  });

  on('turn.complete', async ($, e, next) => {
    const r = await next(e);
    await refresh($);
    return r;
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e);
    const c = await read($, ctx);
    if (e.props.hasSurvey || c === null || c.percent === undefined) {
      return below;
    }

    const { Box, Text } = $.ui.resolve(e);
    const pct = Math.round(c.percent);
    const color = colorForPercent(pct);
    const k = (n?: number) =>
      n === undefined ? '?' : `${Math.round(n / 1000)}k`;

    return (
      <Box flexDirection="column">
        {below}
        <Text>
          <Text dimColor>Context usage: </Text>
          <Text color={color}>
            {pct}% {bar(pct)}
          </Text>
          <Text dimColor>
            {' '}
            ({k(c.tokens)}/{k(c.window)})
          </Text>
        </Text>
      </Box>
    );
  });
};
