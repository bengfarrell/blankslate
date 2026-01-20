import { css } from 'lit';

export const styles = css`
  :host {
    display: inline-flex;
    align-items: center;
  }

  .progress-container {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 10px;
    background: var(--spectrum-gray-100);
    border-radius: 20px;
    border: 1px solid var(--spectrum-gray-200);
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--spectrum-gray-300);
    transition: all 0.2s ease;
  }

  .progress-dot.complete {
    background: var(--spectrum-gray-600);
  }

  .progress-dot.current {
    background: var(--spectrum-informative-color-900);
    box-shadow: 0 0 0 2px var(--spectrum-gray-100), 0 0 0 3px var(--spectrum-informative-color-900);
  }
`;