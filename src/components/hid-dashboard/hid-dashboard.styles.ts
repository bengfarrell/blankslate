import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    width: 100%;
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
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

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: #1a1b1e;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .config-name {
    font-size: 0.875rem;
    color: #868e96;
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
    background: #fff5f5;
    color: #c92a2a;
    border: 1px solid #ffc9c9;
  }

  .status-badge.connected {
    background: #ebfbee;
    color: #2b8a3e;
    border: 1px solid #b2f2bb;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-badge.disconnected .status-dot {
    background: #c92a2a;
  }

  .status-badge.connected .status-dot {
    background: #2b8a3e;
    animation: pulse 2s infinite;
  }

  .status-badge.warning {
    background: #fff3bf;
    color: #e67700;
  }

  .status-badge.warning .status-dot {
    background: #fab005;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .connect-button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .connect-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(51, 154, 240, 0.4);
  }

  .connect-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #adb5bd;
  }

  .disconnect-button {
    padding: 10px 20px;
    border: 1px solid #ced4da;
    border-radius: 8px;
    background: white;
    color: #495057;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .disconnect-button:hover {
    background: #f1f3f5;
    border-color: #adb5bd;
  }

  .config-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .config-button {
    padding: 8px 16px;
    border: 2px solid #e9ecef;
    border-radius: 8px;
    background: white;
    color: #495057;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    white-space: nowrap;
  }

  .config-button:hover {
    background: #f8f9fa;
    border-color: #667eea;
    color: #667eea;
    transform: translateY(-1px);
  }

  .visualizers-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 2fr;
    gap: 16px;
  }

  @media (max-width: 1000px) {
    .visualizers-grid {
      grid-template-columns: 1fr 1fr;
    }
    .visualizer-card.half-width {
      grid-column: span 2;
    }
  }

  @media (max-width: 600px) {
    .visualizers-grid {
      grid-template-columns: 1fr;
    }
    .visualizer-card.half-width {
      grid-column: span 1;
    }
  }

  .visualizer-card {
    background: #1a1b1e;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    border: 1px solid #2c2e33;
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
    max-height: 320px;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .visualizer-wrapper tablet-visualizer {
    transform: scale(0.95);
    transform-origin: top center;
  }

  /* Half-width panel (50% - takes 2fr in the grid) */
  .visualizer-card.half-width {
    /* Already 2fr from grid definition */
  }

  .visualizer-card h2 {
    margin: 0 0 16px 0;
    font-size: 1rem;
    font-weight: 600;
    color: #f1f3f5;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .visualizer-card.compact h2 {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
  }

  .card-icon {
    font-size: 1.2rem;
  }

  .visualizer-card.compact .card-icon {
    font-size: 1rem;
  }

  .data-values {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    margin-top: auto;
    padding: 8px 0;
    border-top: 1px solid #2c2e33;
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
    color: #868e96;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .data-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: #51cf66;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .data-value.zero {
    color: #495057;
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
    color: #212529;
    margin: 0 0 12px 0;
    font-size: 2rem;
  }

  .empty-state > p {
    margin: 0 0 40px 0;
    font-size: 1rem;
    color: #868e96;
  }

  .config-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 24px;
    margin-top: 40px;
  }

  .config-option-card {
    background: white;
    border: 2px solid #e9ecef;
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
    transition: all 0.3s ease;
  }

  .config-option-card:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
    transform: translateY(-2px);
  }

  .option-icon {
    font-size: 3rem;
    margin-bottom: 16px;
  }

  .config-option-card h3 {
    margin: 0 0 8px 0;
    color: #212529;
    font-size: 1.25rem;
  }

  .config-option-card p {
    margin: 0 0 20px 0;
    color: #868e96;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .option-button {
    padding: 12px 24px;
    border: 2px solid #ced4da;
    border-radius: 8px;
    background: white;
    color: #495057;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .option-button:hover {
    background: #f8f9fa;
    border-color: #adb5bd;
  }

  .option-button.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-color: #667eea;
  }

  .option-button.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  /* Add more visualizer placeholder styles */
  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: #495057;
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
    border: 2px solid #339af0;
    border-radius: 8px;
    background: white;
    color: #339af0;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .mode-button:hover:not(:disabled) {
    background: #e7f5ff;
    transform: translateY(-1px);
  }

  .mode-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mode-button .button-icon {
    font-size: 1.1rem;
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
    border: 2px solid #667eea;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .load-config-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .simulation-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid #ced4da;
    border-radius: 8px;
    background: white;
    color: #495057;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .simulation-button:hover {
    background: #f8f9fa;
    border-color: #adb5bd;
  }

  .simulation-button.active {
    background: linear-gradient(135deg, #51cf66 0%, #40c057 100%);
    color: white;
    border-color: #40c057;
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
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
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
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
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
    color: #868e96;
    border-bottom: 1px solid #f1f3f5;
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
    color: #495057;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .dropdown-item:hover {
    background: #f8f9fa;
    color: #228be6;
  }

  .dropdown-item.active {
    background: #e7f5ff;
    color: #228be6;
    font-weight: 600;
  }

  .dropdown-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-divider {
    height: 1px;
    background: #e9ecef;
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
    color: #228be6;
    font-weight: bold;
    margin-left: auto;
  }

  .stop-button {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #ff6b6b 0%, #f03e3e 100%);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .stop-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(240, 62, 62, 0.4);
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

  .websocket-btn {
    background: linear-gradient(135deg, #845ef7 0%, #7950f2 100%);
  }

  .websocket-btn:hover {
    box-shadow: 0 4px 12px rgba(121, 80, 242, 0.4);
  }

  .websocket-input-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    display: flex;
    gap: 8px;
    padding: 12px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    z-index: 100;
    animation: slideDown 0.15s ease-out;
  }

  .websocket-url-input {
    width: 200px;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #495057;
  }

  .websocket-url-input:focus {
    outline: none;
    border-color: #845ef7;
    box-shadow: 0 0 0 3px rgba(121, 80, 242, 0.15);
  }

  .connect-ws-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #845ef7 0%, #7950f2 100%);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    white-space: nowrap;
  }

  .connect-ws-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(121, 80, 242, 0.4);
  }
`;