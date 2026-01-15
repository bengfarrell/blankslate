import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .progress-container {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .progress-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--spectrum-gray-300);
    transition: all 0.3s ease;
  }

  .progress-dot.complete {
    background: var(--spectrum-positive-color-900);
  }

  .progress-dot.current {
    background: var(--spectrum-accent-color-900);
    transform: scale(1.3);
  }
`;