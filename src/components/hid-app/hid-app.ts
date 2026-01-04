import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-app.styles.js';
import '../hid-homepage/hid-homepage.js';
import '../hid-data-reader/hid-data-reader.js';
import '../hid-dashboard/hid-dashboard.js';
import type { Config } from '../../models/config.js';

type AppPage = 'home' | 'walkthrough' | 'dashboard';

/**
 * Main application wrapper component
 * Handles navigation between homepage and walkthrough
 */
@customElement('hid-app')
export class HidApp extends LitElement {
  static styles = styles;

  @state()
  private currentPage: AppPage = 'home';

  @state()
  private loadedConfig: Config | null = null;

  private _handleConfigLoaded(e: CustomEvent) {
    this.loadedConfig = e.detail.config;
    this.currentPage = 'dashboard';
  }

  private _handleCreateNew() {
    this.currentPage = 'walkthrough';
  }

  private _handleBackToHome() {
    this.currentPage = 'home';
    this.loadedConfig = null;
  }

  render() {
    return html`
      <div class="app">
        ${this.currentPage !== 'home' ? html`
          <div class="nav-bar">
            <button class="back-button" @click=${this._handleBackToHome}>
              <span class="back-arrow">←</span>
              Back to Home
            </button>
          </div>
        ` : ''}

        <div class="page-content">
          ${this.currentPage === 'home' ? html`
            <hid-homepage
              @config-loaded=${this._handleConfigLoaded}
              @create-new=${this._handleCreateNew}>
            </hid-homepage>
          ` : ''}

          ${this.currentPage === 'walkthrough' ? html`
            <hid-data-reader></hid-data-reader>
          ` : ''}

          ${this.currentPage === 'dashboard' ? html`
            <hid-dashboard .config=${this.loadedConfig}></hid-dashboard>
          ` : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-app': HidApp;
  }
}

