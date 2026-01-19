import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    overflow: visible;
  }

  .byte-cell {
    position: relative;
    flex: 0 0 auto;
    min-width: 60px;
    height: 85px;
    padding: 10px 5px 6px 5px;
    background: var(--spectrum-gray-50);
    border-radius: 6px;
    text-align: center;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .byte-cell.best-guess {
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-notice-color-800);
    
    transform: scale(1.05);
  }

  .byte-cell.identified {
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-accent-color-900);
    
  }

  .byte-cell.empty-placeholder {
    background: var(--spectrum-gray-200);
    border: 2px dashed var(--spectrum-gray-400);
  }

  .byte-cell.empty-placeholder .byte-label,
  .byte-cell.empty-placeholder .byte-value,
  .byte-cell.empty-placeholder .byte-hex,
  .byte-cell.empty-placeholder .byte-meta {
    color: var(--spectrum-gray-500);
  }

  .byte-type-label {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 6px;
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
    border-radius: 10px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
    
  }

  .byte-cell.best-guess .byte-type-label {
    background: var(--spectrum-notice-color-800);
    color: var(--spectrum-gray-900);
  }

  .byte-label {
    font-size: 9px;
    font-weight: 600;
    color: var(--spectrum-gray-700);
    text-transform: uppercase;
    margin-bottom: 3px;
  }

  .byte-cell.best-guess .byte-label {
    color: var(--spectrum-accent-color-900);
    font-weight: 700;
  }

  .byte-value {
    font-size: 18px;
    font-weight: 900;
    color: var(--spectrum-gray-900);
    font-family: 'Courier New', monospace;
    margin-bottom: 2px;
    line-height: 1;
  }

  .byte-cell.best-guess .byte-value {
    color: var(--spectrum-accent-color-900);
    font-size: 20px;
  }

  .byte-hex {
    font-size: 10px;
    color: var(--spectrum-gray-600);
    font-family: 'Courier New', monospace;
    margin-bottom: 4px;
  }

  .byte-cell.best-guess .byte-hex {
    color: var(--spectrum-accent-color-900);
    font-weight: 600;
  }

  .byte-meta {
    font-size: 8px;
    color: var(--spectrum-gray-600);
    font-family: 'Courier New', monospace;
    line-height: 1.2;
    white-space: nowrap;
  }

  .byte-cell.best-guess .byte-meta {
    color: var(--spectrum-gray-700);
    font-weight: 600;
  }
`;