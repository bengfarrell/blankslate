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
    gap: 12px;
  }

  .device-info-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    background: var(--spectrum-gray-100);
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-label {
    color: var(--spectrum-gray-700);
    font-weight: 500;
  }

  .info-value {
    color: var(--spectrum-gray-900);
    font-weight: 600;
  }

  .info-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .info-badge.mock {
    background: var(--spectrum-informative-background-color-default);
    color: var(--spectrum-informative-color-900);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--spectrum-gray-600);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.95rem;
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: 400px;
    padding: 4px;
  }

  .event-item {
    background: var(--spectrum-gray-75);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 8px;
    padding: 10px 12px;
    transition: all 0.2s ease;
  }

  .event-item.latest {
    background: var(--spectrum-positive-background-color-default);
    border-color: var(--spectrum-positive-color-900);
    
  }

  .event-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 0.85rem;
  }

  .event-label {
    color: var(--spectrum-gray-700);
    font-weight: 500;
    min-width: 80px;
  }

  .event-value {
    color: var(--spectrum-gray-900);
    font-weight: 600;
    font-family: 'Courier New', monospace;
    text-align: right;
  }

  .event-value.state-hover {
    color: var(--spectrum-notice-color-900);
  }

  .event-value.state-touch {
    color: var(--spectrum-positive-color-900);
  }

  .event-value.state-proximity {
    color: var(--spectrum-informative-color-900);
  }

  .events-list::-webkit-scrollbar {
    width: 6px;
  }

  .events-list::-webkit-scrollbar-track {
    background: var(--spectrum-gray-200);
    border-radius: 3px;
  }

  .events-list::-webkit-scrollbar-thumb {
    background: var(--spectrum-gray-500);
    border-radius: 3px;
  }

  .events-list::-webkit-scrollbar-thumb:hover {
    background: var(--spectrum-gray-700);
  }
`;