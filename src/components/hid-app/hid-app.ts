import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-app.styles.js';
import '../hid-data-reader/hid-data-reader.js';
import '../hid-dashboard/hid-dashboard.js';
import type { Config } from '../../models/config.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/src/themes.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-light.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-moon.js';

type AppPage = 'dashboard' | 'walkthrough';
type ThemeColor = 'light' | 'dark';

/**
 * Main application wrapper component
 * Single-page app that shows the unified dashboard
 */
@customElement('hid-app')
export class HidApp extends LitElement {
  static styles = styles;

  @state()
  private currentPage: AppPage = 'dashboard';

  @state()
  private loadedConfig: Config | null = null;

  @state()
  private themeColor: ThemeColor = 'light';

  constructor() {
    super();
    // Check for saved preference or system preference
    const saved = localStorage.getItem('blankslate-theme') as ThemeColor | null;
    if (saved) {
      this.themeColor = saved;
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.themeColor = 'dark';
    }
  }

  private _handleGoToGenerator() {
    // User wants to go to the config generator from dashboard
    this.currentPage = 'walkthrough';
  }

  private _handleBackToDashboard() {
    this.currentPage = 'dashboard';
  }

  private _handleConfigLoadedFromDashboard(e: CustomEvent) {
    // Config loaded from dashboard, update the loaded config
    this.loadedConfig = e.detail.config;
  }

  private _toggleTheme() {
    this.themeColor = this.themeColor === 'light' ? 'dark' : 'light';
    localStorage.setItem('blankslate-theme', this.themeColor);
  }

  render() {
    return html`
      <sp-theme system="spectrum" color=${this.themeColor} scale="medium" data-spectrum-pattern="theme">
        <div class="app">
          <div class="theme-switcher">
            <sp-action-button
              quiet
              @click=${this._toggleTheme}
              aria-label=${this.themeColor === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
              ${this.themeColor === 'light'
                ? html`<sp-icon-moon slot="icon"></sp-icon-moon>`
                : html`<sp-icon-light slot="icon"></sp-icon-light>`}
            </sp-action-button>
          </div>

          ${this.currentPage === 'walkthrough' ? html`
            <div class="nav-bar">
              <sp-button variant="secondary" data-spectrum-pattern="button-secondary" @click=${this._handleBackToDashboard}>
                ← Back to Dashboard
              </sp-button>
            </div>
          ` : ''}

          <div class="page-content">
            ${this.currentPage === 'walkthrough' ? html`
              <hid-data-reader></hid-data-reader>
            ` : ''}

            ${this.currentPage === 'dashboard' ? html`
              <hid-dashboard
                .config=${this.loadedConfig}
                @config-loaded=${this._handleConfigLoadedFromDashboard}
                @go-to-generator=${this._handleGoToGenerator}>
              </hid-dashboard>
            ` : ''}
          </div>
        </div>
      </sp-theme>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-app': HidApp;
  }
}