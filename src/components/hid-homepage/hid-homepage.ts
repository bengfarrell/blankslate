import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-homepage.styles.js';
import { Config } from '../../models/config.js';

/**
 * Homepage component for The Learning Tablet
 * Allows users to load an existing config or create a new one
 */
@customElement('hid-homepage')
export class HidHomepage extends LitElement {
  static styles = styles;

  @state()
  private isDragOver = false;

  @state()
  private error = '';

  @state()
  private loadedConfig: Config | null = null;

  private _handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = true;
  }

  private _handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;
  }

  private async _handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;
    this.error = '';

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this._processFile(file);
  }

  private _handleFileInputClick() {
    const input = this.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  private async _handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    await this._processFile(files[0]);
    // Reset the input so the same file can be selected again
    input.value = '';
  }

  private async _processFile(file: File) {
    if (!file.name.endsWith('.json')) {
      this.error = 'Please select a JSON file';
      return;
    }

    try {
      const text = await file.text();
      const config = Config.fromJSON(text);
      this.loadedConfig = config;
      
      // Dispatch event with the loaded config
      this.dispatchEvent(new CustomEvent('config-loaded', {
        detail: { config },
        bubbles: true,
        composed: true
      }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to parse configuration file';
      this.loadedConfig = null;
    }
  }

  private _handleCreateNew() {
    this.dispatchEvent(new CustomEvent('create-new', {
      bubbles: true,
      composed: true
    }));
  }

  private async _loadExampleConfig() {
    this.error = '';
    try {
      const response = await fetch('/exampleconfigurations/xp_pen_deco_640_osx_nodriver.json');
      if (!response.ok) {
        throw new Error('Failed to fetch example configuration');
      }
      const text = await response.text();
      const config = Config.fromJSON(text);
      this.loadedConfig = config;
      
      // Dispatch event with the loaded config
      this.dispatchEvent(new CustomEvent('config-loaded', {
        detail: { config },
        bubbles: true,
        composed: true
      }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load example configuration';
      this.loadedConfig = null;
    }
  }

  render() {
    return html`
      <div class="homepage">
        <div class="hero">
          <h1>The Learning Tablet</h1>
          <p class="tagline">Configure your graphics tablet for the web</p>
        </div>

        <div class="options">
          <div class="option-card load-config">
            <div class="card-icon">📄</div>
            <h2>Load Configuration</h2>
            <p>Already have a tablet configuration file? Load it here.</p>
            
            <div 
              class="drop-zone ${this.isDragOver ? 'drag-over' : ''}"
              @dragover=${this._handleDragOver}
              @dragleave=${this._handleDragLeave}
              @drop=${this._handleDrop}>
              <div class="drop-icon">📁</div>
              <p>Drag & drop your JSON config here</p>
              <span class="or-divider">or</span>
              <button class="browse-button" @click=${this._handleFileInputClick}>
                Browse Files
              </button>
              <input 
                type="file" 
                accept=".json,application/json"
                @change=${this._handleFileSelected}
                hidden>
            </div>

            <div class="quick-load">
              <span class="or-divider">or try an example</span>
              <button class="example-button" @click=${this._loadExampleConfig}>
                <span class="example-icon">⚡</span>
                Load XP-Pen Deco 640 Config
              </button>
            </div>

            ${this.error ? html`
              <div class="error-message">
                <span class="error-icon">⚠️</span>
                ${this.error}
              </div>
            ` : ''}

            ${this.loadedConfig ? html`
              <div class="success-message">
                <span class="success-icon">✅</span>
                Loaded: ${this.loadedConfig.name}
              </div>
            ` : ''}
          </div>

          <div class="option-card create-new">
            <div class="card-icon">🔧</div>
            <h2>Create New Configuration</h2>
            <p>Don't have a config? Use our interactive walkthrough to create one for your tablet.</p>
            
            <button class="create-button" @click=${this._handleCreateNew}>
              Start Walkthrough
              <span class="arrow">→</span>
            </button>

            <div class="features">
              <div class="feature">
                <span class="feature-icon">🎯</span>
                <span>Auto-detect byte mappings</span>
              </div>
              <div class="feature">
                <span class="feature-icon">✏️</span>
                <span>Supports pressure & tilt</span>
              </div>
              <div class="feature">
                <span class="feature-icon">💾</span>
                <span>Export reusable config</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-homepage': HidHomepage;
  }
}

