import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .device-list-minimal {
    padding: 15px;
    background: var(--spectrum-gray-75);
    border-radius: 8px;
    border: 1px solid var(--spectrum-gray-300);
  }

  .device-list-header {
    margin-bottom: 10px;
  }

  .device-count {
    font-size: 13px;
    color: var(--spectrum-gray-700);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .device-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .device-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-gray-300);
    border-radius: 20px;
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .device-chip.active {
    border-color: var(--spectrum-positive-color-900);
    background: var(--spectrum-positive-background-color-default);
  }

  .device-chip.inactive {
    opacity: 0.6;
  }

  .chip-icon {
    font-size: 12px;
    line-height: 1;
  }

  .chip-label {
    font-weight: 600;
    color: var(--spectrum-gray-900);
  }

  .chip-badge {
    padding: 2px 6px;
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .chip-badge.mock-badge {
    background: var(--spectrum-notice-color-900);
    color: var(--spectrum-white);
  }

  .chip-count {
    padding: 2px 6px;
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
  }

  .device-details {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid var(--spectrum-gray-300);
  }

  .device-detail-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    font-size: 13px;
  }

  .detail-label {
    font-weight: 600;
    color: var(--spectrum-gray-900);
    min-width: 80px;
  }

  .detail-value {
    color: var(--spectrum-gray-800);
    padding: 2px 8px;
    background: var(--spectrum-gray-200);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 4px;
    font-size: 12px;
  }

  .detail-badge {
    padding: 3px 8px;
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .detail-badge.mock-badge {
    background: var(--spectrum-notice-color-900);
    color: var(--spectrum-white);
  }
`;