import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .mode-selector {
    min-height: 100%;
    padding: 40px 20px;
  }

  .hero {
    text-align: center;
    margin-bottom: 50px;
  }

  .hero h1 {
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0 0 12px 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.15rem;
    color: #666;
    margin: 0;
    font-weight: 400;
  }

  .modes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .mode-card {
    background: white;
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    border: 2px solid transparent;
    transition: all 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }

  .mode-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  }

  .mode-card.webhid:hover {
    border-color: #667eea;
  }

  .mode-card.mock-data:hover {
    border-color: #ff9800;
  }

  .mode-card.websocket:hover {
    border-color: #00bcd4;
  }

  .card-icon {
    font-size: 2.5rem;
    margin-bottom: 16px;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 12px;
    width: fit-content;
  }

  .badge.config-required {
    background: #fff3e0;
    color: #f57c00;
  }

  .mode-card h2 {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 0 12px 0;
    color: #333;
  }

  .mode-card > p {
    color: #666;
    margin: 0 0 20px 0;
    line-height: 1.5;
    font-size: 0.95rem;
    flex-grow: 1;
  }

  .features {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.85rem;
    color: #555;
  }

  .feature-icon {
    font-size: 1rem;
  }

  .select-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-card.webhid .select-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .mode-card.mock-data .select-button {
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  }

  .mode-card.websocket .select-button {
    background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  }

  .select-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .select-button:active {
    transform: translateY(0);
  }

  .arrow {
    font-size: 1.2rem;
    transition: transform 0.2s ease;
  }

  .select-button:hover .arrow {
    transform: translateX(4px);
  }

  @media (max-width: 768px) {
    .hero h1 {
      font-size: 2rem;
    }

    .modes-grid {
      grid-template-columns: 1fr;
    }
  }
`;