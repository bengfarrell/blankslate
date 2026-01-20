import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 100%;
    overflow: hidden;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  /* Connection Bar */
  .connection-bar {
    display: flex;
    gap: 24px;
    padding: 16px 20px;
    background: var(--spectrum-gray-75);
    border-radius: 12px;
    border: 1px solid var(--spectrum-gray-200);
    flex-wrap: wrap;
  }

  .connection-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .connection-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--spectrum-gray-700);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .connection-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .websocket-controls-inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mock-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .data-mode-toggle {
    display: flex;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 6px;
    overflow: hidden;
  }

  .mode-btn {
    padding: 6px 10px;
    border: none;
    background: var(--spectrum-gray-75);
    color: var(--spectrum-gray-700);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .mode-btn:first-child {
    border-right: 1px solid var(--spectrum-gray-300);
  }

  .mode-btn:hover:not(.active) {
    background: var(--spectrum-gray-100);
  }

  .mode-btn.active {
    background: var(--spectrum-informative-color-900);
    color: var(--spectrum-white);
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--spectrum-gray-900);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .config-name {
    font-size: 0.875rem;
    color: var(--spectrum-gray-600);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .status-badge.disconnected {
    background: var(--spectrum-negative-background-color-default);
    color: var(--spectrum-negative-color-1000);
    border: 1px solid var(--spectrum-negative-color-900);
  }

  .status-badge.connected {
    background: var(--spectrum-positive-background-color-default);
    color: var(--spectrum-positive-color-1000);
    border: 1px solid var(--spectrum-positive-color-900);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-badge.disconnected .status-dot {
    background: var(--spectrum-negative-color-1000);
  }

  .status-badge.connected .status-dot {
    background: var(--spectrum-positive-color-900);
    animation: pulse 2s infinite;
  }

  .status-badge.warning {
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-notice-color-900);
  }

  .status-badge.warning .status-dot {
    background: var(--spectrum-notice-color-900);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .connect-button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--spectrum-informative-color-900) 0%, var(--spectrum-informative-color-1000) 100%);
    color: var(--spectrum-white);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .connect-button:hover:not(:disabled) {
    transform: translateY(-1px);
    
  }

  .connect-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--spectrum-gray-400);
  }

  .disconnect-button {
    padding: 10px 20px;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 8px;
    background: var(--spectrum-gray-50);
    color: var(--spectrum-gray-800);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .disconnect-button:hover {
    background: var(--spectrum-gray-100);
    border-color: var(--spectrum-gray-400);
  }



  .visualizers-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    max-width: 100%;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    .visualizers-grid {
      grid-template-columns: 1fr 1fr;
    }
    .visualizer-card.events-panel {
      grid-column: span 2;
    }
    .visualizer-card.bytes-panel {
      grid-column: span 2;
    }
  }

  @media (max-width: 600px) {
    .visualizers-grid {
      grid-template-columns: 1fr;
    }
    .visualizer-card.events-panel,
    .visualizer-card.bytes-panel {
      grid-column: span 1;
    }
  }

  /* Events panel - same height as visualizers */
  .visualizer-card.events-panel {
    min-height: auto;
    padding: 12px;
  }

  /* Bytes panel - full width row */
  .visualizer-card.bytes-panel {
    grid-column: 1 / -1;
  }

  .visualizer-card {
    background: var(--spectrum-gray-100);
    border-radius: 16px;
    padding: 12px;
    border: 1px solid var(--spectrum-gray-200);
    min-width: 0;
    overflow: hidden;
  }

  /* Compact panels (25% width) with constrained visualizer */
  .visualizer-card.compact {
    padding: 12px;
    display: flex;
    flex-direction: column;
  }

  /* Visualizer wrapper for constraining size */
  .visualizer-wrapper {
    flex: 1;
    max-height: 280px;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .visualizer-wrapper tablet-visualizer {
    transform: scale(0.95);
    transform-origin: top center;
  }

  /* Translated badge for data panels */
  .translated-badge {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    margin-left: 8px;
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-notice-content-color-default);
    border-radius: 4px;
    vertical-align: middle;
  }


  .data-values {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    margin-top: auto;
    padding: 8px 0;
    border-top: 1px solid var(--spectrum-gray-200);
  }

  .data-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .data-label {
    font-size: 0.6rem;
    color: var(--spectrum-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .data-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--spectrum-positive-color-900);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .data-value.zero {
    color: var(--spectrum-gray-800);
  }

  .empty-state {
    text-align: center;
    padding: 60px 40px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .empty-state-icon {
    font-size: 4rem;
    margin-bottom: 20px;
  }

  .empty-state h2 {
    color: var(--spectrum-gray-900);
    margin: 0 0 12px 0;
    font-size: 2rem;
  }

  .empty-state > p {
    margin: 0 0 40px 0;
    font-size: 1rem;
    color: var(--spectrum-gray-600);
  }

  .config-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 24px;
    margin-top: 40px;
  }

  .config-option-card {
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-gray-200);
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
    transition: all 0.3s ease;
  }

  .config-option-card:hover {
    border-color: var(--spectrum-accent-color-900);
    
    transform: translateY(-2px);
  }

  .option-icon {
    font-size: 3rem;
    margin-bottom: 16px;
  }

  .config-option-card h3 {
    margin: 0 0 8px 0;
    color: var(--spectrum-gray-900);
    font-size: 1.25rem;
  }

  .config-option-card p {
    margin: 0 0 20px 0;
    color: var(--spectrum-gray-600);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .option-button {
    padding: 12px 24px;
    border: 2px solid var(--spectrum-gray-300);
    border-radius: 8px;
    background: var(--spectrum-gray-50);
    color: var(--spectrum-gray-800);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .option-button:hover {
    background: var(--spectrum-gray-75);
    border-color: var(--spectrum-gray-400);
  }

  .option-button.primary {
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    color: var(--spectrum-white);
    border-color: var(--spectrum-accent-color-900);
  }

  .option-button.primary:hover {
    transform: translateY(-2px);
    
  }

  /* Add more visualizer placeholder styles */
  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--spectrum-gray-800);
    text-align: center;
  }

  .coming-soon-icon {
    font-size: 3rem;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .coming-soon-text {
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  /* Diagrams row layout matching tablet-visualizer */
  .diagrams-row {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .diagrams-row > * {
    flex: 1;
    min-width: 280px;
  }

  /* Data Mode Toggle */
  .data-mode-toggle {
    display: flex;
    align-items: center;
  }

  .mode-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 2px solid var(--spectrum-informative-color-900);
    border-radius: 8px;
    background: var(--spectrum-gray-50);
    color: var(--spectrum-informative-color-900);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .mode-button:hover:not(:disabled) {
    background: var(--spectrum-informative-background-color-default);
    transform: translateY(-1px);
  }

  .mode-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mode-button .button-icon {
    font-size: 1.1rem;
  }

  /* Config Dropdown */
  .config-dropdown {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .config-menu-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 8px;
    background: var(--spectrum-gray-50);
    color: var(--spectrum-gray-800);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .config-menu-button:hover {
    background: var(--spectrum-gray-75);
    border-color: var(--spectrum-gray-400);
  }

  /* Simulation Dropdown */
  .simulation-dropdown {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .load-config-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 2px solid var(--spectrum-accent-color-900);
    border-radius: 8px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    color: var(--spectrum-white);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .load-config-button:hover {
    transform: translateY(-2px);
    
  }

  .simulation-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 8px;
    background: var(--spectrum-gray-50);
    color: var(--spectrum-gray-800);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .simulation-button:hover {
    background: var(--spectrum-gray-75);
    border-color: var(--spectrum-gray-400);
  }

  .simulation-button.active {
    background: linear-gradient(135deg, var(--spectrum-positive-color-900) 0%, var(--spectrum-positive-color-1000) 100%);
    color: var(--spectrum-white);
    border-color: var(--spectrum-positive-color-1000);
  }

  .button-icon {
    font-size: 1rem;
  }

  .dropdown-arrow {
    font-size: 0.625rem;
    opacity: 0.7;
  }

  .simulation-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--spectrum-gray-300);
    border-top-color: var(--spectrum-white);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    min-width: 200px;
    background: var(--spectrum-gray-50);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 12px;
    
    z-index: 100;
    overflow: hidden;
    animation: slideDown 0.15s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header {
    padding: 12px 16px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--spectrum-gray-600);
    border-bottom: 1px solid var(--spectrum-gray-100);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: none;
    color: var(--spectrum-gray-800);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .dropdown-item:hover {
    background: var(--spectrum-gray-75);
    color: var(--spectrum-informative-color-1000);
  }

  .dropdown-item.active {
    background: var(--spectrum-informative-background-color-default);
    color: var(--spectrum-informative-color-1000);
    font-weight: 600;
  }

  .dropdown-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--spectrum-gray-200);
    margin: 8px 0;
  }

  .item-icon {
    font-size: 1rem;
    width: 24px;
    text-align: center;
  }

  .item-label {
    flex: 1;
  }

  .check-mark {
    color: var(--spectrum-informative-color-1000);
    font-weight: bold;
    margin-left: auto;
  }

  .stop-button {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--spectrum-negative-color-900) 0%, var(--spectrum-negative-color-1000) 100%);
    color: var(--spectrum-white);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .stop-button:hover {
    transform: translateY(-1px);
    
  }

  /* WebSocket Connection Styles */
  .connect-options {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .websocket-dropdown {
    position: relative;
  }

  .websocket-url-input {
    width: 180px;
  }
`;