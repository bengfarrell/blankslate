import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    color: var(--spectrum-gray-900);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--spectrum-gray-200);
  }

  .header-info h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--spectrum-gray-900);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
  }

  .status-badge.connected {
    background: var(--spectrum-positive-background-color-default);
    color: var(--spectrum-positive-color-1000);
    border: 2px solid var(--spectrum-positive-color-900);
  }

  .status-icon {
    font-size: 16px;
  }

  .status-detail {
    font-size: 12px;
    opacity: 0.8;
  }

  .status-detail.warning {
    color: var(--spectrum-notice-color-1000);
  }

  .button.connect {
    background: var(--spectrum-positive-color-900);
    padding: 10px 20px;
  }

  .button.connect:hover:not(:disabled) {
    background: var(--spectrum-positive-color-1000);
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

  .content {
    display: grid;
    gap: 20px;
  }

  .section {
    background: var(--spectrum-gray-75);
    border-radius: 8px;
    padding: 20px;
    border: 1px solid var(--spectrum-gray-300);
  }

  .section h3 {
    margin: 0 0 15px 0;
    color: var(--spectrum-accent-color-900);
    font-size: 18px;
  }

  .section-header-with-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    gap: 20px;
  }

  .section-header-with-actions h3 {
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .gesture-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 15px;
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

  .button.stop {
    background: var(--spectrum-negative-color-900);
  }

  .button.stop:hover:not(:disabled) {
    background: var(--spectrum-negative-color-1000);
    
  }

  .button.clear {
    background: var(--spectrum-notice-color-900);
  }

  .button.clear:hover:not(:disabled) {
    background: var(--spectrum-notice-color-1000);
    
  }

  .button.primary {
    background: var(--spectrum-positive-color-900);
    font-size: 16px;
    padding: 12px 24px;
  }

  .button.primary:hover:not(:disabled) {
    background: var(--spectrum-positive-color-1000);
    
  }

  .button.hover {
    background: var(--spectrum-accent-color-1000);
  }

  .button.hover:hover:not(:disabled) {
    background: var(--spectrum-accent-color-1100);
    
  }

  .status-indicator {
    margin: 0;
    padding: 10px 15px;
    background: var(--spectrum-informative-background-color-default);
    border: 2px solid var(--spectrum-informative-color-900);
    border-radius: 6px;
    font-weight: 500;
    color: var(--spectrum-informative-color-1000);
  }

  .byte-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    padding: 10px;
    background: var(--spectrum-white);
    border-radius: 4px;
    font-size: 13px;
    color: var(--spectrum-gray-700);
  }

  .byte-display {
    background: var(--spectrum-gray-100);
    border-radius: 6px;
    padding: 20px;
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    font-size: 14px;
  }

  .empty-message {
    color: var(--spectrum-gray-500);
    text-align: center;
    padding: 20px;
    margin: 0;
  }

  .byte-packet {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    background: var(--spectrum-gray-200);
    border-radius: 6px;
    border: 2px solid var(--spectrum-accent-color-900);
    width: 100%;
  }

  .packet-label {
    color: var(--spectrum-gray-500);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .packet-bytes {
    color: var(--spectrum-positive-color-900);
    font-weight: 500;
    font-size: 16px;
    word-break: break-all;
    line-height: 1.6;
  }

  /* Walkthrough styles */
  .walkthrough {
    border-left: 4px solid var(--spectrum-gray-400);
    background: var(--spectrum-gray-75);
  }

  .walkthrough.active {
    border-left-color: var(--spectrum-informative-color-900);
    background: var(--spectrum-gray-75);
    border: 1px solid var(--spectrum-gray-200);
    border-left: 4px solid var(--spectrum-informative-color-900);
  }

  .walkthrough.complete {
    border-left-color: var(--spectrum-gray-600);
    background: var(--spectrum-gray-100);
  }

  .walkthrough h3 {
    margin-top: 0;
    color: var(--spectrum-gray-900);
  }

  .walkthrough p {
    margin: 10px 0;
    line-height: 1.6;
  }

  .info-message {
    padding: 12px 16px;
    background: var(--spectrum-informative-background-color-default);
    border-left: 4px solid var(--spectrum-informative-color-900);
    border-radius: 4px;
    color: var(--spectrum-informative-color-1000);
    font-size: 14px;
    margin: 15px 0;
  }

  /* Device List Minimal */
  .device-list-minimal {
    margin-bottom: 20px;
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
    background: var(--spectrum-white);
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

  /* Device Details */
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
    color: var(--spectrum-gray-700);
    padding: 2px 8px;
    background: transparent;
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

  /* Active Streams Section */
  .active-streams-section {
    margin-top: 15px;
  }

  .active-streams-section h4 {
    margin: 0 0 10px 0;
    color: var(--spectrum-accent-color-900);
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Device Streams */
  .device-streams-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .device-stream-panel {
    border: 2px solid var(--spectrum-gray-300);
    border-radius: 8px;
    background: var(--spectrum-white);
    transition: all 0.3s ease;
    overflow: hidden;
  }

  .device-stream-panel.active {
    border-color: var(--spectrum-positive-color-900);
    
  }

  .device-stream-panel.inactive {
    opacity: 0.6;
  }

  .stream-header {
    padding: 15px;
    background: var(--spectrum-gray-75);
    border-bottom: 1px solid var(--spectrum-gray-300);
  }

  .device-stream-panel.active .stream-header {
    background: var(--spectrum-positive-background-color-default);
  }

  .stream-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .stream-title {
    font-weight: 600;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .active-badge {
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .stream-count {
    font-size: 14px;
    color: var(--spectrum-gray-700);
    font-weight: 500;
  }

  .stream-metadata {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
  }

  .metadata-item {
    display: flex;
    gap: 6px;
    font-size: 13px;
  }

  .metadata-label {
    color: var(--spectrum-gray-700);
    font-weight: 500;
  }

  .metadata-value {
    color: var(--spectrum-gray-900);
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }

  .metadata-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .metadata-badge.digitizer {
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
  }

  .stream-byte-display {
    padding: 15px;
    background: var(--spectrum-white);
    min-height: 60px;
  }

  /* Accumulated Results */
  .accumulated-results {
    margin-top: 20px;
    padding: 20px;
    background: var(--spectrum-gray-75);
    border-radius: 8px;
    border: 2px solid var(--spectrum-gray-300);
  }

  .accumulated-results h3 {
    margin: 0 0 15px 0;
    color: var(--spectrum-accent-color-900);
    font-size: 18px;
  }

  .result-item {
    margin-bottom: 20px;
    padding: 15px;
    background: var(--spectrum-white);
    border-radius: 6px;
    border-left: 4px solid var(--spectrum-accent-color-900);
  }

  .result-item:last-child {
    margin-bottom: 0;
  }

  .result-item h4 {
    margin: 0 0 5px 0;
    color: var(--spectrum-gray-900);
    font-size: 16px;
  }

  .result-description {
    margin: 0 0 15px 0;
    color: var(--spectrum-gray-700);
    font-size: 13px;
  }

  .byte-results {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .byte-result-card {
    flex: 0 0 auto;
    min-width: 180px;
    padding: 12px;
    background: var(--spectrum-gray-100);
    border-radius: 6px;
    border: 1px solid var(--spectrum-gray-300);
  }

  .byte-index {
    font-weight: 700;
    color: var(--spectrum-accent-color-900);
    font-size: 14px;
    margin-bottom: 8px;
  }

  .byte-range,
  .byte-variance {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    font-size: 13px;
  }

  .range-label,
  .variance-label {
    color: var(--spectrum-gray-700);
    font-weight: 500;
  }

  .range-value,
  .variance-value {
    color: var(--spectrum-gray-900);
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }

  .status-values {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .status-value-card {
    padding: 10px;
    background: var(--spectrum-gray-100);
    border-radius: 6px;
    border: 1px solid var(--spectrum-gray-300);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-state {
    font-weight: 600;
    color: var(--spectrum-accent-color-900);
    text-transform: capitalize;
  }

  .status-value {
    font-family: 'Courier New', monospace;
    color: var(--spectrum-gray-900);
    font-weight: 600;
  }

  /* Live Analysis */
  .live-analysis {
    margin-top: 20px;
    padding: 20px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    border-radius: 8px;
    color: var(--spectrum-white);
  }

  .live-analysis h4 {
    margin: 0 0 5px 0;
    color: var(--spectrum-white);
    font-size: 16px;
    font-weight: 700;
  }

  .analysis-subtitle {
    margin: 0 0 15px 0;
    color: var(--spectrum-white);
    font-size: 13px;
  }

  .analysis-subtitle.empty-state {
    padding: 46px 20px;
    text-align: center;
    font-size: 14px;
    margin: 0;
  }

  .live-bytes-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    padding: 0;
  }

  .live-byte-cell {
    position: relative;
    flex: 0 0 auto;
    min-width: 60px;
    height: 85px;
    padding: 10px 5px 6px 5px;
    background: var(--spectrum-gray-50);
    border-radius: 6px;
    text-align: center;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .live-byte-cell.best-guess {
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-notice-color-800);
    
    transform: scale(1.05);
  }

  .live-byte-cell.identified {
    background: var(--spectrum-gray-50);
    border: 2px solid var(--spectrum-accent-color-900);
    
  }

  .live-byte-cell.empty-placeholder {
    background: var(--spectrum-gray-50);
    border: 2px dashed var(--spectrum-gray-300);
  }

  .live-byte-cell.empty-placeholder .byte-label,
  .live-byte-cell.empty-placeholder .byte-value,
  .live-byte-cell.empty-placeholder .byte-hex,
  .live-byte-cell.empty-placeholder .byte-meta {
    color: var(--spectrum-white);
  }

  .byte-type-label {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 6px;
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
    border-radius: 10px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
    
  }

  .live-byte-cell.best-guess .byte-type-label {
    background: var(--spectrum-notice-color-800);
    color: var(--spectrum-gray-900);
  }

  .byte-label {
    font-size: 9px;
    font-weight: 600;
    color: var(--spectrum-gray-700);
    text-transform: uppercase;
    margin-bottom: 3px;
  }

  .live-byte-cell.best-guess .byte-label {
    color: var(--spectrum-accent-color-900);
    font-weight: 700;
  }

  .byte-value {
    font-size: 18px;
    font-weight: 900;
    color: var(--spectrum-gray-900);
    font-family: 'Courier New', monospace;
    margin-bottom: 2px;
    line-height: 1;
  }

  .live-byte-cell.best-guess .byte-value {
    color: var(--spectrum-accent-color-900);
    font-size: 20px;
  }

  .byte-hex {
    font-size: 10px;
    color: var(--spectrum-gray-600);
    font-family: 'Courier New', monospace;
    margin-bottom: 4px;
  }

  .live-byte-cell.best-guess .byte-hex {
    color: var(--spectrum-accent-color-900);
    font-weight: 600;
  }

  .byte-meta {
    font-size: 8px;
    color: var(--spectrum-gray-600);
    font-family: 'Courier New', monospace;
    line-height: 1.2;
    white-space: nowrap;
  }

  .live-byte-cell.best-guess .byte-meta {
    color: var(--spectrum-gray-700);
    font-weight: 600;
  }

  /* Button Group */
  .step-buttons {
    margin-top: 15px;
  }

  .capture-status {
    min-height: 44px;
    margin-bottom: 8px;
  }

  .packet-count {
    font-size: 14px;
    font-weight: 500;
    color: var(--spectrum-gray-800);
  }

  .filter-stats {
    font-size: 12px;
    color: var(--spectrum-gray-600);
  }

  .navigation-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
    align-items: center;
  }

  .bytes-detected-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    margin-left: auto;
  }

  .button-group {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .button.secondary {
    background: var(--spectrum-gray-700);
    color: var(--spectrum-white);
  }

  .button.secondary:hover {
    background: var(--spectrum-gray-800);
  }

  .stream-byte-display .empty-message {
    text-align: center;
    color: var(--spectrum-gray-600);
    font-size: 14px;
    font-style: italic;
    margin: 0;
    padding: 10px;
  }

  .stream-byte-display .byte-packet {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stream-byte-display .packet-label {
    font-size: 11px;
    color: var(--spectrum-gray-700);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .stream-byte-display .packet-bytes {
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: var(--spectrum-informative-color-1000);
    word-break: break-all;
    line-height: 1.6;
    padding: 10px;
    background: var(--spectrum-gray-100);
    border-radius: 4px;
    border: 1px solid var(--spectrum-gray-300);
  }

  .walkthrough .button {
    margin: 15px 0;
    width: 100%;
    max-width: 300px;
    font-size: 16px;
    padding: 12px 24px;
  }

  .walkthrough-progress {
    display: flex;
    gap: 10px;
    margin: 20px 0;
  }

  .progress-step {
    flex: 1;
    padding: 10px;
    background: var(--spectrum-gray-300);
    border-radius: 6px;
    text-align: center;
    font-size: 13px;
    font-weight: 500;
    color: var(--spectrum-gray-700);
  }

  .progress-step.active {
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
  }

  .progress-step.complete {
    background: var(--spectrum-informative-color-900);
    color: var(--spectrum-gray-50);
  }

  /* Step header with title and progress bar */
  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    gap: 15px;
  }

  .step-header h3 {
    margin: 0;
    flex: 1;
  }

  .icon-button {
    width: 32px;
    height: 32px;
    border: 2px solid var(--spectrum-accent-color-900);
    background: var(--spectrum-white);
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .icon-button:hover {
    background: var(--spectrum-accent-color-900);
    transform: scale(1.1);
    
  }

  .icon-button:active {
    transform: scale(0.95);
  }

  .icon-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Step description with simulate button */
  .step-description {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 15px;
  }

  .step-description p {
    margin: 0;
    flex: 1;
  }

  .simulate-button {
    padding: 4px 10px;
    font-size: 12px;
    border: 1px solid var(--spectrum-accent-color-900);
    background: var(--spectrum-white);
    color: var(--spectrum-accent-color-900);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .simulate-button:hover:not(:disabled) {
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
  }

  .simulate-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  /* Byte analysis styles */
  .byte-analysis {
    margin: 20px 0;
    display: grid;
    gap: 20px;
  }

  .analysis-section h4 {
    margin: 0 0 10px 0;
    color: var(--spectrum-accent-color-900);
    font-size: 16px;
  }

  .byte-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .byte-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--spectrum-white);
    border-radius: 6px;
    border-left: 3px solid var(--spectrum-accent-color-900);
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  .byte-item.pressure {
    border-left-color: var(--spectrum-accent-color-1000);
  }

  .byte-item.pressure .byte-index {
    color: var(--spectrum-accent-color-1000);
  }

  .byte-index {
    font-weight: 600;
    color: var(--spectrum-accent-color-900);
    min-width: 80px;
  }

  .byte-range {
    color: var(--spectrum-positive-color-900);
    flex: 1;
  }

  .byte-variance {
    color: var(--spectrum-gray-700);
    font-size: 12px;
  }

  .no-data {
    color: var(--spectrum-gray-600);
    font-style: italic;
    margin: 10px 0;
  }

  /* Config display styles */
  .config-section {
    margin: 20px 0;
    padding: 0;
    background: transparent;
    border: none;
  }

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 15px 20px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    border-radius: 8px;
    color: var(--spectrum-white);
  }

  .config-header h4 {
    margin: 0;
    color: var(--spectrum-white);
    font-size: 20px;
  }

  .config-actions {
    display: flex;
    gap: 10px;
  }

  .config-actions-only {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin: 20px 0;
  }

  .button.small {
    padding: 8px 16px;
    font-size: 13px;
    background: var(--spectrum-gray-50);
    backdrop-filter: blur(10px);
  }

  .button.small:hover:not(:disabled) {
    background: var(--spectrum-gray-50);
    transform: translateY(-1px);
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .config-card {
    background: var(--spectrum-white);
    border-radius: 12px;
    padding: 0;
    
    border: 1px solid var(--spectrum-gray-300);
    transition: all 0.2s ease;
    overflow: hidden;
  }

  .config-card:hover {
    
    transform: translateY(-2px);
  }

  .config-card.status-card {
    grid-column: 1 / -1;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 15px 20px;
    background: linear-gradient(135deg, var(--spectrum-gray-100) 0%, var(--spectrum-gray-400) 100%);
    border-bottom: 2px solid var(--spectrum-gray-300);
  }

  .card-icon {
    font-size: 24px;
  }

  .card-header h5 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--spectrum-gray-900);
  }

  .card-body {
    padding: 20px;
  }

  .config-detail {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--spectrum-gray-200);
  }

  .config-detail:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: 13px;
    color: var(--spectrum-gray-700);
    font-weight: 500;
  }

  .detail-value {
    font-size: 14px;
    color: var(--spectrum-gray-900);
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }

  .detail-value.highlight {
    color: var(--spectrum-positive-color-900);
    font-size: 16px;
  }

  .badge {
    padding: 4px 12px;
    background: var(--spectrum-accent-color-900);
    color: var(--spectrum-white);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-values {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 15px;
  }

  .status-value-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--spectrum-gray-75);
    border-radius: 8px;
    border-left: 3px solid var(--spectrum-accent-color-900);
  }

  .status-byte {
    font-family: 'Courier New', monospace;
    font-weight: 600;
    color: var(--spectrum-accent-color-900);
    font-size: 13px;
    min-width: 120px;
  }

  .status-state {
    padding: 4px 10px;
    background: var(--spectrum-informative-background-color-default);
    color: var(--spectrum-informative-color-1000);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-flag {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-flag.primary {
    background: var(--spectrum-positive-color-900);
    color: var(--spectrum-white);
  }

  .status-flag.secondary {
    background: var(--spectrum-notice-color-900);
    color: var(--spectrum-white);
  }

  /* Config Panel */
  .config-panel {
    margin: 20px 0;
    border: 2px solid var(--spectrum-accent-color-900);
    border-radius: 8px;
    overflow: hidden;
  }

  .config-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    color: var(--spectrum-white);
    cursor: pointer;
    user-select: none;
    transition: background 0.2s ease;
  }

  .config-panel-header:hover {
    background: linear-gradient(135deg, var(--spectrum-accent-color-1000) 0%, var(--spectrum-accent-color-1100) 100%);
  }

  .config-panel-header h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .collapse-icon {
    font-size: 12px;
    transition: transform 0.2s ease;
  }

  /* Message badges/tags */
  .message {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    width: fit-content;
    margin-bottom: 8px;
  }

  .message.info {
    background: var(--spectrum-gray-200);
    color: var(--spectrum-gray-700);
    border: 1px solid var(--spectrum-gray-300);
  }

  .message.success {
    background: var(--spectrum-positive-background-color-default);
    color: var(--spectrum-positive-color-1000);
    border: 1px solid var(--spectrum-positive-color-400);
  }

  .message.error {
    background: var(--spectrum-negative-background-color-default);
    color: var(--spectrum-negative-color-1000);
    border: 1px solid var(--spectrum-negative-color-400);
  }

  .message.warning {
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-notice-color-1000);
    border: 1px solid var(--spectrum-notice-color-400);
  }
`;