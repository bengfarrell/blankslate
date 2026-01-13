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
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-label {
    color: #666;
    font-weight: 500;
  }

  .info-value {
    color: #333;
    font-weight: 600;
  }

  .info-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .info-badge.mock {
    background: #e3f2fd;
    color: #1976d2;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #999;
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
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 10px 12px;
    transition: all 0.2s ease;
  }

  .event-item.latest {
    background: #e8f5e9;
    border-color: #4caf50;
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
  }

  .event-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 0.85rem;
  }

  .event-label {
    color: #666;
    font-weight: 500;
    min-width: 80px;
  }

  .event-value {
    color: #333;
    font-weight: 600;
    font-family: 'Courier New', monospace;
    text-align: right;
  }

  .event-value.state-hover {
    color: #ff9800;
  }

  .event-value.state-touch {
    color: #4caf50;
  }

  .event-value.state-proximity {
    color: #2196f3;
  }

  .events-list::-webkit-scrollbar {
    width: 6px;
  }

  .events-list::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .events-list::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;
  }

  .events-list::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;

