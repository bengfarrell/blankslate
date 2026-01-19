import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .walkthrough-container {
    width: 100%;
  }

  .section {
    background: white;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    
  }

  .section.walkthrough.active {
    border-left: 4px solid var(--spectrum-informative-color-900);
  }

  .section.walkthrough.complete {
    border-left: 4px solid var(--spectrum-positive-color-900);
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .step-header h3 {
    margin: 0;
    flex: 1;
    font-size: 18px;
    color: var(--spectrum-gray-800);
  }

  .icon-button {
    background: var(--spectrum-gray-75);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .icon-button:hover:not(:disabled) {
    background: var(--spectrum-gray-200);
  }

  .icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .step-description {
    color: var(--spectrum-gray-700);
    line-height: 1.6;
  }

  .step-description p {
    margin: 8px 0;
  }

  .simulate-button {
    background: var(--spectrum-informative-color-900);
    color: var(--spectrum-gray-50);
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
    margin-top: 12px;
  }

  .simulate-button:hover:not(:disabled) {
    background: var(--spectrum-informative-color-1000);
  }

  .simulate-button:disabled {
    background: var(--spectrum-gray-300);
    cursor: not-allowed;
  }

  .gesture-controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .button-detection-status {
    background: var(--spectrum-gray-75);
    border-radius: 4px;
    padding: 12px;
    margin: 12px 0;
  }

  .button-detection-status strong {
    color: var(--spectrum-informative-color-900);
  }

  .detected-states {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .state-badge {
    background: var(--spectrum-informative-color-900);
    color: var(--spectrum-gray-50);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
  }

  @media (max-width: 768px) {
    .step-header {
      flex-wrap: wrap;
    }

    .gesture-controls {
      flex-direction: column;
    }

    .simulate-button {
      width: 100%;
    }
  }
`;