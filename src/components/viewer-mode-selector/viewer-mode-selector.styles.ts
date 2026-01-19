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
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.15rem;
    color: var(--spectrum-gray-700);
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
    background: var(--spectrum-gray-50);
    border-radius: 16px;
    padding: 28px;
    
    border: 2px solid transparent;
    transition: all 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }

  .mode-card:hover {
    transform: translateY(-4px);
    
  }

  .mode-card.webhid:hover {
    border-color: var(--spectrum-accent-color-900);
  }

  .mode-card.mock-data:hover {
    border-color: var(--spectrum-notice-color-900);
  }

  .mode-card.websocket:hover {
    border-color: var(--spectrum-informative-color-900);
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
    background: var(--spectrum-notice-background-color-default);
    color: var(--spectrum-notice-color-900);
  }

  .mode-card h2 {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 0 12px 0;
    color: var(--spectrum-gray-900);
  }

  .mode-card > p {
    color: var(--spectrum-gray-700);
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
    color: var(--spectrum-gray-800);
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
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    color: var(--spectrum-white);
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-card.webhid .select-button {
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
  }

  .mode-card.mock-data .select-button {
    background: linear-gradient(135deg, var(--spectrum-notice-color-900) 0%, var(--spectrum-notice-color-1000) 100%);
  }

  .mode-card.websocket .select-button {
    background: linear-gradient(135deg, var(--spectrum-informative-color-900) 0%, var(--spectrum-informative-color-1000) 100%);
  }

  .select-button:hover {
    transform: translateY(-2px);
    
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