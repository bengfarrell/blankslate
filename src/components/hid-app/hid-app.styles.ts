import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    min-height: 100vh;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .nav-bar {
    padding: 16px 24px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e0e0e0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: white;
    border: 2px solid #667eea;
    border-radius: 8px;
    color: #667eea;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .back-button:hover {
    background: #667eea;
    color: white;
  }

  .back-arrow {
    font-size: 1.2rem;
    transition: transform 0.2s ease;
  }

  .back-button:hover .back-arrow {
    transform: translateX(-3px);
  }

  .page-content {
    flex: 1;
  }

  /* Walkthrough page styling */
  .page-content hid-data-reader {
    max-width: 1000px;
    margin: 0 auto;
    padding: 30px;
  }

  /* Dashboard page styling */
  .page-content hid-dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding: 30px;
  }
`;

