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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.25rem;
    color: #666;
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
    background: white;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    border: 2px solid transparent;
    transition: all 0.3s ease;
  }

  .option-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  }

  .option-card.load-config:hover {
    border-color: #667eea;
  }

  .option-card.create-new:hover {
    border-color: #4caf50;
  }

  .card-icon {
    font-size: 3rem;
    margin-bottom: 16px;
  }

  .option-card h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 12px 0;
    color: #333;
  }

  .option-card > p {
    color: #666;
    margin: 0 0 24px 0;
    line-height: 1.6;
  }

  /* Drop Zone */
  .drop-zone {
    border: 2px dashed #d0d0d0;
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
    transition: all 0.2s ease;
    background: #fafafa;
    cursor: pointer;
  }

  .drop-zone:hover {
    border-color: #667eea;
    background: #f5f7ff;
  }

  .drop-zone.drag-over {
    border-color: #667eea;
    background: #eef1ff;
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
    color: #666;
    font-size: 0.95rem;
  }

  .or-divider {
    display: block;
    color: #999;
    font-size: 0.85rem;
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .browse-button {
    padding: 12px 28px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .browse-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .example-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
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
    background: #ffebee;
    color: #c62828;
    border: 1px solid #ffcdd2;
  }

  .success-message {
    background: #e8f5e9;
    color: #2e7d32;
    border: 1px solid #c8e6c9;
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
    background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
    color: white;
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
    box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
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
    color: #555;
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

