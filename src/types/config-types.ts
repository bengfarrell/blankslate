/**
 * Configuration types for tablet expression mappings
 */

export interface TabletExpressionConfig {
  enabled: boolean;
  source: 'pressure' | 'tiltX' | 'tiltY' | 'tiltXY' | 'x' | 'y';
  min?: number;
  max?: number;
  curve?: 'linear' | 'exponential' | 'logarithmic';
}





