import type { LengthUnit } from '../domain/types';

export const MM_PER_INCH = 25.4;

export function toDisplay(mm: number, unit: LengthUnit): number {
  return unit === 'in' ? mm / MM_PER_INCH : mm;
}

export function fromDisplay(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value * MM_PER_INCH : value;
}

export function formatLength(mm: number, unit: LengthUnit, digits = 2): string {
  const value = toDisplay(mm, unit);
  const places = unit === 'in' ? Math.max(digits, 2) : digits;
  return `${value.toFixed(places)} ${unit}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
