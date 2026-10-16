import type { ValidationResult } from './validate.js';

/** A data-only, package-local static SVG icon theme. Requires plugin API >=2.2.0. */
export interface IconThemeDefinition {
  version: 1;
  iconDefinitions: Record<string, { iconPath: string }>;
  file: string;
  folder: string;
  fileNames?: Record<string, string>;
  fileExtensions?: Record<string, string>;
  folderNames?: Record<string, string>;
}
export const iconThemeApiVersion: '2.2.0';
export function defineIconTheme<T extends IconThemeDefinition>(theme: T): T;
export function validateIconTheme(theme: unknown): ValidationResult;
export function validateIconThemeAssets(root: string, theme: unknown): ValidationResult;
export function validateIconSvg(source: string): boolean;
export function readIconThemeAssets(root: string, theme: unknown): Map<string, Uint8Array>;
