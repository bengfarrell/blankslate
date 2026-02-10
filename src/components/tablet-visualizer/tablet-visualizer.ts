import { html, LitElement, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styles } from './tablet-visualizer.css.js';
import { TabletExpressionConfig } from '../../types/config-types.js';
import { sharedTabletInteraction } from '../../controllers/index.js';

@customElement('tablet-visualizer')
export class TabletVisualizer extends LitElement {
    static styles = styles;

    @state()
    private pressure: number = 0;

    @state()
    private isPressingTablet: boolean = false;

    @state()
    private clickPosition: { x: number; y: number } | null = null;

    @state()
    private tiltX: number = 0;

    @state()
    private tiltY: number = 0;

    @state()
    private tiltPressure: number = 0;

    @state()
    private isPressingTilt: boolean = false;

    @state()
    private pressedButtons: Set<number> = new Set();

    @state()
    private lastPressedButton: number | null = null;

    @state()
    private primaryButtonPressed: boolean = false;

    @state()
    private secondaryButtonPressed: boolean = false;

    private pressureAnimationFrame: number | null = null;
    private tiltPressureAnimationFrame: number | null = null;

    @property({ 
        type: Object,
        hasChanged: () => true // Always update when property is set
    })
    noteDuration?: TabletExpressionConfig;

    @property({ 
        type: Object,
        hasChanged: () => true // Always update when property is set
    })
    pitchBend?: TabletExpressionConfig;

    @property({ 
        type: Object,
        hasChanged: () => true // Always update when property is set
    })
    noteVelocity?: TabletExpressionConfig;

    @property({ type: String })
    mode: 'both' | 'tablet' | 'tilt' = 'both';

    @property({ type: Boolean })
    socketMode: boolean = false;

    @property({ 
        type: Boolean,
        hasChanged: () => true // Always update when connection status changes
    })
    tabletConnected: boolean = false;

    @property({ 
        type: Object,
        hasChanged: () => true // Always update when device info changes
    })
    tabletDeviceInfo: any = null;

    @property({
        type: Object,
        hasChanged: () => true // Always update when Set changes
    })
    externalPressedButtons: Set<number> = new Set();

    @property({ 
        type: Object,
        hasChanged: () => true // Always update when object changes
    })
    externalTabletData: {
        x: number;
        y: number;
        pressure: number;
        tiltX: number;
        tiltY: number;
        tiltXY: number;
        primaryButtonPressed: boolean;
        secondaryButtonPressed: boolean;
    } = {
        x: 0,
        y: 0,
        pressure: 0,
        tiltX: 0,
        tiltY: 0,
        tiltXY: 0,
        primaryButtonPressed: false,
        secondaryButtonPressed: false
    };

    private handleTabletMouseMove(e: MouseEvent) {
        const rectElement = e.currentTarget as SVGRectElement;
        const svg = rectElement.ownerSVGElement as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        
        // Get SVG's viewBox dimensions
        const viewBox = svg.viewBox.baseVal;
        const viewBoxWidth = viewBox.width;
        const viewBoxHeight = viewBox.height;
        
        // Convert screen coordinates to SVG viewBox coordinates
        const scaleX = viewBoxWidth / rect.width;
        const scaleY = viewBoxHeight / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Update click position if pressing
        if (this.isPressingTablet) {
            this.clickPosition = { x, y };
        }
        
        // Calculate string area boundaries (matching renderStrings calculations)
        const activeAreaHeight = 160;
        const activeAreaY = 35;
        const buttonRadius = 8;
        const verticalPadding = 20;
        const buttonCenterY = activeAreaY + verticalPadding + buttonRadius;
        const buttonMargin = 5;
        const stringStartY = buttonCenterY + buttonRadius + buttonMargin;
        const stringEndY = activeAreaY + activeAreaHeight;
        const stringAreaHeight = stringEndY - stringStartY;
        
        // Normalize Y position within string area (0-1)
        const normalizedY = Math.max(0, Math.min(1, (y - stringStartY) / stringAreaHeight));
        sharedTabletInteraction.setTabletPosition(x, normalizedY, this.isPressingTablet);
    }

    private handleTabletMouseLeave() {
        // Clear position when mouse leaves
        sharedTabletInteraction.setTabletPressed(false);
    }

    private handleTabletMouseDown(e: MouseEvent) {
        const rectElement = e.currentTarget as SVGRectElement;
        const svg = rectElement.ownerSVGElement as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        
        // Get SVG's viewBox dimensions
        const viewBox = svg.viewBox.baseVal;
        const viewBoxWidth = viewBox.width;
        const viewBoxHeight = viewBox.height;
        
        // Convert screen coordinates to SVG viewBox coordinates
        const scaleX = viewBoxWidth / rect.width;
        const scaleY = viewBoxHeight / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        this.isPressingTablet = true;
        this.clickPosition = { x, y };
        this.pressure = 0;
        this.animatePressure();
        
        // Calculate string area boundaries (matching renderStrings calculations)
        const activeAreaHeight = 160;
        const activeAreaY = 35;
        const buttonRadius = 8;
        const verticalPadding = 20;
        const buttonCenterY = activeAreaY + verticalPadding + buttonRadius;
        const buttonMargin = 5;
        const stringStartY = buttonCenterY + buttonRadius + buttonMargin;
        const stringEndY = activeAreaY  + activeAreaHeight;
        const stringAreaHeight = stringEndY - stringStartY;
        
        // Normalize Y position within string area (0-1)
        const normalizedY = Math.max(0, Math.min(1, (y - stringStartY) / stringAreaHeight));
        sharedTabletInteraction.setTabletPosition(x, normalizedY, true);
    }

    private handleTabletMouseUp() {
        this.isPressingTablet = false;
        this.pressure = 0;
        this.clickPosition = null;
        if (this.pressureAnimationFrame !== null) {
            cancelAnimationFrame(this.pressureAnimationFrame);
            this.pressureAnimationFrame = null;
        }
        
        // Update shared controller
        sharedTabletInteraction.setTabletPressed(false);
    }

    private animatePressure() {
        if (!this.isPressingTablet) return;
        
        // Increase pressure over time (0 to 1 over ~1 second)
        this.pressure = Math.min(1, this.pressure + 0.02);
        
        if (this.pressure < 1) {
            this.pressureAnimationFrame = requestAnimationFrame(() => this.animatePressure());
        }
    }

    private handleTiltMouseMove(e: MouseEvent) {
        if (!this.isPressingTilt) return;
        
        const svg = e.currentTarget as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Calculate position relative to center (-1 to 1)
        const relativeX = (x - centerX) / (centerX * 0.8); // 0.8 to keep within bounds
        const relativeY = (y - centerY) / (centerY * 0.8);
        
        // Clamp to circle
        const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
        if (distance > 1) {
            this.tiltX = relativeX / distance;
            this.tiltY = relativeY / distance;
        } else {
            this.tiltX = relativeX;
            this.tiltY = relativeY;
        }
        
        // Update shared controller
        sharedTabletInteraction.setTiltPosition(this.tiltX, this.tiltY, this.tiltPressure, true);
    }

    private handleTiltMouseDown(e: MouseEvent) {
        this.isPressingTilt = true;
        this.tiltPressure = 0;
        this.handleTiltMouseMove(e);
        this.animateTiltPressure();
    }

    private handleTiltMouseUp() {
        this.isPressingTilt = false;
        this.tiltPressure = 0;
        this.tiltX = 0;
        this.tiltY = 0;
        if (this.tiltPressureAnimationFrame !== null) {
            cancelAnimationFrame(this.tiltPressureAnimationFrame);
            this.tiltPressureAnimationFrame = null;
        }
        
        // Update shared controller (resets tilt to 0)
        sharedTabletInteraction.setTiltPressed(false);
    }

    private animateTiltPressure() {
        if (!this.isPressingTilt) return;
        
        // Increase pressure over time (0 to 1 over ~1 second)
        this.tiltPressure = Math.min(1, this.tiltPressure + 0.02);
        
        // Update shared controller with new pressure
        sharedTabletInteraction.setTiltPosition(this.tiltX, this.tiltY, this.tiltPressure, true);
        
        if (this.tiltPressure < 1) {
            this.tiltPressureAnimationFrame = requestAnimationFrame(() => this.animateTiltPressure());
        }
    }

    private handleButtonMouseDown(buttonIndex: number, e: MouseEvent) {
        e.stopPropagation(); // Prevent tablet events
        this.pressedButtons = new Set(this.pressedButtons).add(buttonIndex);
        this.lastPressedButton = buttonIndex;
    }

    private handleButtonMouseUp(buttonIndex: number, e: MouseEvent) {
        e.stopPropagation(); // Prevent tablet events
        const newSet = new Set(this.pressedButtons);
        newSet.delete(buttonIndex);
        this.pressedButtons = newSet;
    }

    private handleStylusButtonMouseDown(isPrimary: boolean, e: MouseEvent) {
        e.stopPropagation(); // Prevent tilt events
        if (isPrimary) {
            this.primaryButtonPressed = true;
        } else {
            this.secondaryButtonPressed = true;
        }
    }

    private handleStylusButtonMouseUp(isPrimary: boolean, e: MouseEvent) {
        e.stopPropagation(); // Prevent tilt events
        if (isPrimary) {
            this.primaryButtonPressed = false;
        } else {
            this.secondaryButtonPressed = false;
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // Add global mouseup listener to handle releases outside the SVG
        window.addEventListener('mouseup', this.handleGlobalMouseUp);
    }

    updated(changedProperties: Map<string, unknown>) {
        super.updated(changedProperties);
        // Track last pressed button when external buttons change in socket mode
        if (changedProperties.has('externalPressedButtons') && this.socketMode) {
            if (this.externalPressedButtons.size > 0) {
                // Update lastPressedButton with the first pressed button
                this.lastPressedButton = Array.from(this.externalPressedButtons)[0];
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.pressureAnimationFrame !== null) {
            cancelAnimationFrame(this.pressureAnimationFrame);
        }
        if (this.tiltPressureAnimationFrame !== null) {
            cancelAnimationFrame(this.tiltPressureAnimationFrame);
        }
        window.removeEventListener('mouseup', this.handleGlobalMouseUp);
    }

    private handleGlobalMouseUp = () => {
        if (this.isPressingTablet) {
            this.handleTabletMouseUp();
        }
        if (this.isPressingTilt) {
            this.handleTiltMouseUp();
        }
        // Clear all button presses on global mouse up
        if (this.pressedButtons.size > 0) {
            this.pressedButtons = new Set();
        }
        // Clear stylus button presses
        if (this.primaryButtonPressed) {
            this.primaryButtonPressed = false;
        }
        if (this.secondaryButtonPressed) {
            this.secondaryButtonPressed = false;
        }
    }

    protected renderButtonIndicator() {
        // Use external pressed buttons when in socket mode, otherwise use internal state
        const pressedButtonsSet = this.socketMode ? this.externalPressedButtons : this.pressedButtons;
        const isAnyPressed = pressedButtonsSet.size > 0;

        // Track last pressed button - update when a button is pressed
        let displayButton: number | null = null;
        if (isAnyPressed) {
            // Get the first (or any) pressed button from the set
            displayButton = Array.from(pressedButtonsSet)[0];
        } else {
            displayButton = this.lastPressedButton;
        }

        return html`
            <div class="button-indicator ${isAnyPressed ? 'pressed' : ''}">
                <span class="button-label">Btn</span>
                <span class="button-value">${displayButton !== null ? displayButton : '–'}</span>
            </div>
        `;
    }

    protected renderTablet() {
        const tabletWidth = 240;
        const tabletHeight = 200;
        const tabletX = 20;
        const tabletY = 20;
        const activeAreaX = tabletX + 20;
        const activeAreaY = tabletY + 20;
        const activeAreaWidth = tabletWidth - 40;
        const activeAreaHeight = tabletHeight - 40;

        return html`
            <div class="tablet-container">
                <svg width="100%" height="100%"
                     viewBox="0 0 ${tabletWidth + 40} ${tabletHeight + 40}"
                     preserveAspectRatio="xMidYMid meet"
                 xmlns="http://www.w3.org/2000/svg"
                     class="tablet-svg">

                <!-- Tablet body (with pointer events for the main area) -->
                <rect x="${tabletX}" y="${tabletY}" width="${tabletWidth}" height="${tabletHeight}"
                    class="tablet-body" rx="15"
                    pointer-events="${this.socketMode ? 'none' : 'auto'}"
                 @mousemove=${this.handleTabletMouseMove}
                 @mouseleave=${this.handleTabletMouseLeave}
                 @mousedown=${this.handleTabletMouseDown}
                    @mouseup=${this.handleTabletMouseUp} />

                <!-- Active area (darker rectangle) -->
                <rect x="${activeAreaX}" y="${activeAreaY}" width="${activeAreaWidth}" height="${activeAreaHeight}"
                    class="tablet-surface" rx="8"
                    pointer-events="none" />

                ${(() => {
                    // Use external data when in socket mode, otherwise use internal state
                    if (this.socketMode) {
                        // Show position when pen is in range (x or y > 0)
                        const penInRange = this.externalTabletData.x > 0 || this.externalTabletData.y > 0;
                        if (!penInRange) return '';

                        const isContact = this.externalTabletData.pressure > 0;
                        // Convert normalized coordinates to SVG coordinates
                        const x = activeAreaX + (this.externalTabletData.x * activeAreaWidth);
                        const y = activeAreaY + (this.externalTabletData.y * activeAreaHeight);

                        // Contact: red with pressure-based opacity
                        // Hover: blue with fixed opacity
                        const color = isContact ? '#ff6b6b' : '#74c0fc';
                        const opacity = isContact ? Math.max(0.3, this.externalTabletData.pressure) : 0.6;
                        const radius = isContact ? 12 : 8;

                        return svg`
                            <!-- Position indicator dot -->
                            <circle cx="${x}"
                                    cy="${y}"
                                    r="${radius}"
                                    fill="${color}"
                                    opacity="${opacity}"
                                    pointer-events="none" />
                        `;
                    } else {
                        // Local mouse interaction - only show when pressing
                        if (!(this.clickPosition && this.isPressingTablet)) return '';

                        return svg`
                            <!-- Pressure indicator dot -->
                            <circle cx="${this.clickPosition!.x}"
                                    cy="${this.clickPosition!.y}"
                                    r="12"
                                    fill="var(--svg-negative-900)"
                                    opacity="${this.pressure}"
                                    pointer-events="none" />
                        `;
                    }
                })()}
                </svg>
            </div>
        `;
    }

    private renderStylusButtons(svgWidth: number, yPosition: number) {
        const penWidth = 15;
        const penLength = 220; // Increased from 100 to fill more horizontal space
        const centerX = svgWidth / 2;
        const centerY = yPosition + 20;
        
        // Button dimensions
        const buttonWidth = 8; // Reduced from 12 to inset from pen edges
        const buttonHeight = 18;
        const buttonSpacing = 8;
        
        // Position buttons on the pen body (before rotation)
        const button1X = 60;
        const button2X = button1X + buttonHeight + buttonSpacing;
        
        return svg`
            <g class="stylus-pen" transform="translate(${centerX - penLength/2}, ${centerY - penWidth/2})">
                <!-- Pen tip (pointing left) -->
                <path d="M 2 ${penWidth/2} 
                         L 15 ${penWidth/2 - 4}
                         L 15 ${penWidth/2 + 4}
                         Z"
                      fill="none"
                      stroke="var(--svg-gray-600)"
                      stroke-width="1.5"
                      stroke-linejoin="round"
                      pointer-events="none" />
                <!-- Rounded tip cap -->
                <circle cx="6" cy="${penWidth/2}" r="2"
                        fill="var(--svg-gray-600)"
                        pointer-events="none" />
                
                <!-- Pen body -->
                <rect x="15" y="0"
                      width="${penLength - 30}" height="${penWidth}"
                      rx="2"
                      fill="none"
                      stroke="var(--svg-gray-600)"
                      stroke-width="1.5"
                      pointer-events="none" />

                <!-- Pen eraser end (right side) -->
                <ellipse cx="${penLength - 12}" cy="${penWidth/2}"
                         rx="3" ry="${penWidth / 2}"
                         fill="none"
                         stroke="var(--svg-gray-600)"
                         stroke-width="1.5"
                         pointer-events="none" />
                <rect x="${penLength - 15}" y="0"
                      width="8" height="${penWidth}"
                      fill="var(--svg-gray-300)"
                      stroke="var(--svg-gray-600)"
                      stroke-width="1.5"
                      pointer-events="none" />
                
                <!-- Primary Button (closer to tip, on top of pen) -->
                <rect x="${button1X}" y="${penWidth/2 - buttonWidth/2}"
                      width="${buttonHeight}" height="${buttonWidth}"
                      rx="2"
                      fill="${(this.socketMode ? this.externalTabletData.secondaryButtonPressed : this.secondaryButtonPressed) ? 'var(--svg-positive-900)' : 'var(--svg-gray-300)'}"
                      stroke="${(this.socketMode ? this.externalTabletData.secondaryButtonPressed : this.secondaryButtonPressed) ? 'var(--svg-positive-1000)' : 'var(--svg-gray-600)'}"
                      stroke-width="1.5"
                      pointer-events="${this.socketMode ? 'none' : 'auto'}"
                      @mousedown=${(e: MouseEvent) => this.handleStylusButtonMouseDown(true, e)}
                      @mouseup=${(e: MouseEvent) => this.handleStylusButtonMouseUp(true, e)}
                      class="button-rect" />
                
                <!-- Secondary Button (further from tip, on top of pen) -->
                <rect x="${button2X}" y="${penWidth/2 - buttonWidth/2}"
                      width="${buttonHeight}" height="${buttonWidth}"
                      rx="2"
                      fill="${(this.socketMode ? this.externalTabletData.primaryButtonPressed : this.primaryButtonPressed) ? 'var(--svg-positive-900)' : 'var(--svg-gray-300)'}"
                      stroke="${(this.socketMode ? this.externalTabletData.primaryButtonPressed : this.primaryButtonPressed) ? 'var(--svg-positive-1000)' : 'var(--svg-gray-600)'}"
                      stroke-width="1.5"
                      pointer-events="${this.socketMode ? 'none' : 'auto'}"
                      @mousedown=${(e: MouseEvent) => this.handleStylusButtonMouseDown(false, e)}
                      @mouseup=${(e: MouseEvent) => this.handleStylusButtonMouseUp(false, e)}
                      class="button-rect" />
            </g>
        `;
    }

    private renderTilt() {
        const viewBoxWidth = 300;
        const viewBoxHeight = 230; // Reduced since labels are removed
        const centerX = viewBoxWidth / 2;
        const centerY = viewBoxHeight / 2 + 15; // Adjusted for new height
        const maxRadius = 80;
        const buttonsY = 10;
        
        // Use external data when in socket mode, otherwise use internal state
        const tiltX = this.socketMode ? this.externalTabletData.tiltX : this.tiltX;
        const tiltY = this.socketMode ? this.externalTabletData.tiltY : this.tiltY;
        const tiltPressure = this.socketMode ? this.externalTabletData.pressure : this.tiltPressure;
        const isPressingTilt = this.socketMode ? this.externalTabletData.pressure > 0 : this.isPressingTilt;
        
        // Calculate pressure rings
        const pressureRings = 5;
        const activeRing = Math.floor(tiltPressure * pressureRings);
        
        // Calculate tilt indicator position
        const tiltLineEndX = centerX + tiltX * maxRadius;
        const tiltLineEndY = centerY + tiltY * maxRadius;
        
        // Use tiltXY from external data in socket mode, otherwise calculate locally
        const tiltMagnitude = this.socketMode ? this.externalTabletData.tiltXY : (() => {
            // Calculate combined tilt magnitude with sign based on tiltX * tiltY
            const magnitude = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
            const sign = (tiltX * tiltY) >= 0 ? 1 : -1;
            // Clamp to [-1, 1] range (magnitude can exceed 1 at corners)
            return Math.max(-1, Math.min(1, magnitude * sign));
        })();
        
        return html`
            <div style="width: 100%; height: 100%;">
                ${svg`
                    <svg width="100%" height="100%" 
                         viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}"
                         preserveAspectRatio="xMidYMid meet"
                         xmlns="http://www.w3.org/2000/svg"
                         class="tilt-svg">
                
                <!-- Stylus Buttons -->
                ${this.renderStylusButtons(viewBoxWidth, buttonsY)}
                
                <!-- Interactive area for tilt (invisible circle that captures events) -->
                <circle cx="${centerX}" cy="${centerY}" r="${maxRadius}"
                    fill="transparent"
                    pointer-events="${this.socketMode ? 'none' : 'auto'}"
                    @mousemove=${this.handleTiltMouseMove}
                    @mousedown=${this.handleTiltMouseDown}
                    @mouseup=${this.handleTiltMouseUp}
                    style="cursor: ${this.socketMode ? 'default' : 'crosshair'};" />
                
                <!-- Pressure rings (from outside to inside) -->
                ${Array.from({ length: pressureRings }, (_, i) => {
                    const ringIndex = pressureRings - i - 1;
                    const radius = maxRadius * ((ringIndex + 1) / pressureRings);
                    const isActive = isPressingTilt && ringIndex <= activeRing;
                    const opacity = isActive ? 0.3 + (ringIndex / pressureRings) * 0.4 : 0.4;
                    const strokeWidth = isActive ? 2 : 1;
                    
                    return svg`
                        <circle cx="${centerX}" cy="${centerY}" r="${radius}"
                            class="pressure-ring"
                            fill="none"
                            stroke="${isActive ? 'var(--svg-negative-900)' : 'var(--svg-gray-800)'}"
                            stroke-width="${strokeWidth}"
                            opacity="${opacity}"
                            pointer-events="none" />
                    `;
                })}
                
                <!-- Center point -->
                <circle cx="${centerX}" cy="${centerY}" r="4"
                    fill="var(--svg-gray-500)"
                    pointer-events="none" />

                <!-- Tilt direction line -->
                ${isPressingTilt || tiltX !== 0 || tiltY !== 0 ? svg`
                    <line x1="${centerX}" y1="${centerY}"
                          x2="${tiltLineEndX}" y2="${tiltLineEndY}"
                          stroke="var(--svg-informative-900)"
                          stroke-width="3"
                          stroke-linecap="round"
                          pointer-events="none" />

                    <!-- Tilt indicator dot -->
                    <circle cx="${tiltLineEndX}" cy="${tiltLineEndY}" r="6"
                        fill="var(--svg-informative-900)"
                        pointer-events="none" />
                ` : ''}
                `}
            </div>
        `;
    }

    render() {
        // If mode is 'both', show everything in the original layout
        if (this.mode === 'both') {
            return html`
                <div class="diagrams-keyboard-row">
                    <div class="tablet-container">
                        ${this.renderTablet()}
                    </div>
                    <div class="tilt-container">
                        ${this.renderTilt()}
                    </div>
                    <div class="keyboard-slot">
                        <slot name="keyboard"></slot>
                    </div>
                </div>
            `;
        }

        // Otherwise, render only the requested mode
        if (this.mode === 'tablet') {
            return html`<div class="tablet-container">${this.renderTablet()}</div>`;
        }
        
        if (this.mode === 'tilt') {
            return html`<div class="tilt-container">${this.renderTilt()}</div>`;
        }
        
        return html``;
    }
}