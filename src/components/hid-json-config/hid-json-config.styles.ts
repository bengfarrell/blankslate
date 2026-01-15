import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .config-container {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .config-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .button.secondary {
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-gray-50);
  }

  .button.secondary:hover {
    background: var(--spectrum-accent-color-1000);
    transform: translateY(-1px);
    
  }

  .button.secondary:active {
    transform: translateY(0);
  }

  .config-display {
    background: var(--spectrum-gray-75);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 6px;
    padding: 20px;
    margin: 0;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--spectrum-gray-800);
  }

  .config-display code {
    font-family: inherit;
  }

  .no-config {
    padding: 20px;
    text-align: center;
    color: var(--spectrum-gray-600);
    font-style: italic;
  }
`;