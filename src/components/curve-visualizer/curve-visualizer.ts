import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Placeholder curve visualizer component
 * Can be expanded later to show expression curves
 */
@customElement('curve-visualizer')
export class CurveVisualizer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  @property({ type: Object })
  config: any = null;

  render() {
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'curve-visualizer': CurveVisualizer;
  }
}


