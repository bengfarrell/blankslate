import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-app.styles.js';
import '../hid-homepage/hid-homepage.js';
import '../hid-data-reader/hid-data-reader.js';
import '../hid-dashboard/hid-dashboard.js';
import '../viewer-mode-selector/viewer-mode-selector.js';
import type { Config } from '../../models/config.js';
import type { ViewerMode } from '../viewer-mode-selector/viewer-mode-selector.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/src/themes.js';

type AppPage = 'home' | 'walkthrough' | 'viewer-mode-selection' | 'config-loader' | 'dashboard';

/**
 * Main application wrapper component
 * Handles navigation between homepage, viewer mode selection, and dashboard
 */
@customElement('hid-app')
export class HidApp extends LitElement {
  static styles = styles;

  @state()
  private currentPage: AppPage = 'viewer-mode-selection';

  @state()
  private loadedConfig: Config | null = null;

  @state()
  private selectedViewerMode: ViewerMode | null = null;

  private _handleConfigLoaded(e: CustomEvent) {
    this.loadedConfig = e.detail.config;
    // Config loaded, now go to dashboard with webhid mode
    this.selectedViewerMode = 'webhid';
    this.currentPage = 'dashboard';
  }

  private _handleCreateNew() {
    this.currentPage = 'walkthrough';
  }

  private _handleModeSelected(e: CustomEvent) {
    this.selectedViewerMode = e.detail.mode;
    // All modes go directly to dashboard now
    this.currentPage = 'dashboard';
  }

  private _handleBackToHome() {
    this.currentPage = 'viewer-mode-selection';
    this.loadedConfig = null;
    this.selectedViewerMode = null;
  }

  private _handleBackToModeSelection() {
    this.currentPage = 'viewer-mode-selection';
    this.loadedConfig = null;
  }

  private _handleSkipConfig() {
    // User wants to skip config loading and create one in walkthrough
    this.currentPage = 'walkthrough';
  }

  private _handleGoToGenerator() {
    // User wants to go to the config generator from dashboard
    this.currentPage = 'walkthrough';
  }

  private _handleConfigLoadedFromDashboard(e: CustomEvent) {
    // Config loaded from dashboard, update the loaded config
    this.loadedConfig = e.detail.config;
  }

  render() {
    return html`
      <sp-theme theme="spectrum" color="light" scale="medium">
        <div class="app">
          ${this.currentPage !== 'viewer-mode-selection' ? html`
            <div class="nav-bar">
              <sp-button variant="secondary" @click=${this._handleBackToHome}>
                <span class="back-arrow">←</span>
                Back to Home
              </sp-button>
            </div>
          ` : ''}

          <div class="page-content">
            ${this.currentPage === 'viewer-mode-selection' ? html`
              <viewer-mode-selector
                @mode-selected=${this._handleModeSelected}>
              </viewer-mode-selector>
            ` : ''}

            ${this.currentPage === 'config-loader' ? html`
              <hid-homepage
                @config-loaded=${this._handleConfigLoaded}
                @create-new=${this._handleSkipConfig}>
              </hid-homepage>
            ` : ''}

            ${this.currentPage === 'walkthrough' ? html`
              <hid-data-reader></hid-data-reader>
            ` : ''}

            ${this.currentPage === 'dashboard' ? html`
              <hid-dashboard
                .config=${this.loadedConfig}
                .viewerMode=${this.selectedViewerMode}
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