import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .bytes-container {
    margin-top: 20px;
    padding: 20px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1000) 100%);
    border-radius: 8px;
    color: var(--spectrum-gray-50);
  }

  .device-info-header {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--spectrum-gray-300);
    font-size: 13px;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-label {
    opacity: 0.8;
    font-weight: 500;
  }

  .info-value {
    font-weight: 600;
    background: var(--spectrum-gray-100);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .info-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-badge.digitizer {
    background: var(--spectrum-positive-background-color-default);
    color: var(--spectrum-positive-color-200);
    border: 1px solid var(--spectrum-positive-color-900);
  }

  .info-badge.digitizer.mock {
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-orange-200);
    border: 1px solid var(--spectrum-notice-color-900);
  }

  .bytes-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    overflow-y: visible;
    padding: 15px 0 0 0;
  }
`;