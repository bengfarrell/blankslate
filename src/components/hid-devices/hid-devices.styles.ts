import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .hid-devices {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.connected {
    background: var(--spectrum-gray-200);
    color: var(--spectrum-gray-800);
    border: 1px solid var(--spectrum-gray-300);
  }

  .status-icon {
    font-size: 12px;
    color: var(--spectrum-positive-color-900);
  }

  .status-detail {
    font-size: 11px;
    color: var(--spectrum-gray-600);
  }

  .status-detail.warning {
    color: var(--spectrum-notice-color-900);
  }

  .button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .button:hover:not(:disabled) {
    background: var(--spectrum-accent-color-1000);
    transform: translateY(-1px);
    
  }

  .button:active:not(:disabled) {
    transform: translateY(0);
  }

  .button:disabled {
    background: var(--spectrum-gray-300);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .button.small {
    padding: 8px 16px;
    font-size: 13px;
  }

  .button.disconnect {
    background: var(--spectrum-negative-color-900) !important;
    color: var(--spectrum-white);
    padding: 8px 16px;
    border: none;
  }

  .button.disconnect:hover:not(:disabled) {
    background: var(--spectrum-negative-color-1000) !important;
  }
`;