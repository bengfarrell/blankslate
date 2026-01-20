import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    height: 100%;
  }

  .events-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 10px;
  }

  .events-container.empty {
    justify-content: center;
    align-items: center;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--spectrum-gray-500);
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.85rem;
  }

  .event-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .event-count {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--spectrum-gray-900);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .event-label {
    font-size: 0.75rem;
    color: var(--spectrum-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-badges {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .source-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .source-badge.mock {
    background: var(--spectrum-gray-300);
    color: var(--spectrum-gray-800);
  }

  .source-badge.translated {
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-notice-content-color-default);
  }

  .event-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px 8px;
  }

  .event-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 0.65rem;
    color: var(--spectrum-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .field-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--spectrum-gray-900);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .button-status {
    display: flex;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--spectrum-gray-200);
  }

  .button-indicator {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 6px;
    background: var(--spectrum-gray-200);
    transition: all 0.15s ease;
  }

  .button-indicator.active {
    background: var(--spectrum-positive-color-900);
  }

  .button-indicator.active .button-label {
    color: var(--spectrum-gray-50);
  }

  .button-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--spectrum-gray-700);
  }
`;
