import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .homepage {
    min-height: 100%;
    padding: 40px 20px;
  }

  .hero {
    text-align: center;
    margin-bottom: 50px;
  }

  .hero h1 {
    font-size: 3rem;
    font-weight: 800;
    margin: 0 0 12px 0;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.25rem;
    color: var(--spectrum-gray-700);
    margin: 0;
    font-weight: 400;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 30px;
    max-width: 900px;
    margin: 0 auto;
  }

  .option-card {
    background: var(--spectrum-gray-50);
    border-radius: 16px;
    padding: 32px;
    border: 2px solid transparent;
    transition: all 0.3s ease;
  }

  .option-card:hover {
    transform: translateY(-4px);
  }

  .option-card.load-config:hover {
    border-color: var(--spectrum-accent-color-900);
  }

  .option-card.create-new:hover {
    border-color: var(--spectrum-positive-color-900);
  }

  .card-icon {
    font-size: 3rem;
    margin-bottom: 16px;
  }

  .option-card h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 12px 0;
    color: var(--spectrum-gray-900);
  }

  .option-card > p {
    color: var(--spectrum-gray-700);
    margin: 0 0 24px 0;
    line-height: 1.6;
  }

  /* Drop Zone */
  .drop-zone {
    border: 2px dashed var(--spectrum-gray-400);
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
    transition: all 0.2s ease;
    background: var(--spectrum-gray-75);
    cursor: pointer;
  }

  .drop-zone:hover {
    border-color: var(--spectrum-accent-color-900);
    background: var(--spectrum-accent-background-color-default);
  }

  .drop-zone.drag-over {
    border-color: var(--spectrum-accent-color-900);
    background: var(--spectrum-accent-background-color-hover);
    border-style: solid;
    transform: scale(1.02);
  }

  .drop-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
    opacity: 0.7;
  }

  .drop-zone p {
    margin: 0 0 16px 0;
    color: var(--spectrum-gray-700);
    font-size: 0.95rem;
  }

  .or-divider {
    display: block;
    color: var(--spectrum-gray-600);
    font-size: 0.85rem;
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .browse-button {
    padding: 12px 28px;
    background: linear-gradient(135deg, var(--spectrum-accent-color-900) 0%, var(--spectrum-accent-color-1100) 100%);
    color: var(--spectrum-white);
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .browse-button:hover {
    transform: translateY(-2px);
  }

  .browse-button:active {
    transform: translateY(0);
  }

  /* Quick Load Example */
  .quick-load {
    margin-top: 20px;
    text-align: center;
  }

  .quick-load .or-divider {
    margin-bottom: 12px;
  }

  .example-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, var(--spectrum-notice-color-900) 0%, var(--spectrum-notice-color-1000) 100%);
    color: var(--spectrum-white);
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .example-button:hover {
    transform: translateY(-2px);
  }

  .example-button:active {
    transform: translateY(0);
  }

  .example-icon {
    font-size: 1.1rem;
  }

  /* Messages */
  .error-message,
  .success-message {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .error-message {
    background: var(--spectrum-negative-background-color-default);
    color: var(--spectrum-negative-color-1000);
    border: 1px solid var(--spectrum-negative-color-900);
  }

  .success-message {
    background: var(--spectrum-positive-background-color-default);
    color: var(--spectrum-positive-color-1000);
    border: 1px solid var(--spectrum-positive-color-900);
  }

  .error-icon,
  .success-icon {
    font-size: 1.1rem;
  }

  /* Create New Section */
  .create-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px 28px;
    background: linear-gradient(135deg, var(--spectrum-positive-color-900) 0%, var(--spectrum-positive-color-1000) 100%);
    color: var(--spectrum-white);
    border: none;
    border-radius: 10px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: 24px;
  }

  .create-button:hover {
    transform: translateY(-2px);
  }

  .create-button:active {
    transform: translateY(0);
  }

  .create-button .arrow {
    font-size: 1.3rem;
    transition: transform 0.2s ease;
  }

  .create-button:hover .arrow {
    transform: translateX(4px);
  }

  /* Features List */
  .features {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9rem;
    color: var(--spectrum-gray-800);
  }

  .feature-icon {
    font-size: 1.1rem;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .hero h1 {
      font-size: 2.2rem;
    }

    .tagline {
      font-size: 1rem;
    }

    .options {
      grid-template-columns: 1fr;
    }

    .option-card {
      padding: 24px;
    }
  }
`;