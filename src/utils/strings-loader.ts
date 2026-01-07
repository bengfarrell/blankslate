/**
 * Strings Loader
 * Loads localized/configurable strings from JSON at runtime
 * Works in both Node.js (CLI) and browser (web app) environments
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Step string definition
 */
export interface StepStrings {
  number: number;
  title: string;
  description: string;
  instructions: string;
}

/**
 * Complete walkthrough strings structure
 */
export interface WalkthroughStrings {
  header: {
    title: string;
    emoji: string;
  };
  steps: Record<string, StepStrings>;
  prompts: Record<string, string>;
  messages: Record<string, string>;
  errors: Record<string, string>;
  ui: {
    stepFormat: string;
    progressBar: {
      filled: string;
      empty: string;
    };
    status: Record<string, string>;
    buttons: Record<string, string>;
  };
  eventViewer: {
    header: string;
    liveViewHeader: string;
    labels: Record<string, string>;
    modes: Record<string, string>;
  };
}

// Cache the loaded strings
let cachedStrings: WalkthroughStrings | null = null;

/**
 * Find the strings JSON file path for Node.js environment
 */
function findStringsPath(): string {
  // Try multiple possible locations
  const possiblePaths = [
    // From dist/cli/ (compiled)
    resolve(dirname(fileURLToPath(import.meta.url)), '../../public/strings/walkthrough.json'),
    // From src/utils/ (source)
    resolve(dirname(fileURLToPath(import.meta.url)), '../../public/strings/walkthrough.json'),
    // From project root
    resolve(process.cwd(), 'public/strings/walkthrough.json'),
    // Relative to current file (multiple levels up)
    join(dirname(fileURLToPath(import.meta.url)), '../../../public/strings/walkthrough.json'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error(`Strings file not found. Searched: ${possiblePaths.join(', ')}`);
}

/**
 * Load strings synchronously (for Node.js/CLI)
 */
export function loadStringsSync(): WalkthroughStrings {
  if (cachedStrings) {
    return cachedStrings;
  }

  const stringsPath = findStringsPath();
  const content = readFileSync(stringsPath, 'utf-8');
  cachedStrings = JSON.parse(content) as WalkthroughStrings;
  return cachedStrings;
}

/**
 * Load strings asynchronously (for browser/web app)
 * @param basePath - Base URL path to the strings file (default: '/strings/walkthrough.json')
 */
export async function loadStringsAsync(basePath = '/strings/walkthrough.json'): Promise<WalkthroughStrings> {
  if (cachedStrings) {
    return cachedStrings;
  }

  const response = await fetch(basePath);
  if (!response.ok) {
    throw new Error(`Failed to load strings: ${response.statusText}`);
  }

  cachedStrings = await response.json() as WalkthroughStrings;
  return cachedStrings;
}

/**
 * Get cached strings (throws if not loaded)
 */
export function getStrings(): WalkthroughStrings {
  if (!cachedStrings) {
    throw new Error('Strings not loaded. Call loadStringsSync() or loadStringsAsync() first.');
  }
  return cachedStrings;
}

/**
 * Clear the cache (useful for testing or hot-reloading)
 */
export function clearStringsCache(): void {
  cachedStrings = null;
}

/**
 * Format a string template with values
 * Replaces {key} placeholders with values from the provided object
 * 
 * @example
 * format("Found {count} devices", { count: 5 }) // "Found 5 devices"
 * format("Press Button {n}", { n: 3 }) // "Press Button 3"
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in values ? String(values[key]) : match;
  });
}

