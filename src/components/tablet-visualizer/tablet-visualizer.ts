import { html, LitElement, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styles } from './tablet-visualizer.css';
import '../curve-visualizer/curve-visualizer';
import { TabletExpressionConfig } from '../../types/config-types.js';
import { sharedTabletInteraction } from '../../controllers';

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
    private primaryButtonPressed: boolean = false;

    @state()
    private secondaryButtonPressed: boolean = false;

    @state()
    private lastHoveredString: number | null = null;

    // Dummy hardware config - will be replaced with actual config later
    private hardwareConfig = {
        buttonCount: 8
    };

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

    @property({ type: Number })
    stringCount: number = 6;

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
        type: Array,
        hasChanged: () => true // Always update when notes array changes
    })
    notes: any[] = [];

    @property({ type: Number })
    externalLastPluckedString: number | null = null;

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
        const stringEndY = activeAreaY + activeAreaHeight;
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

    private renderStrings(activeAreaWidth: number, activeAreaHeight: number, activeAreaX: number, activeAreaY: number) {
        if (this.stringCount === 0) return svg``;
        
        const stringSpacing = activeAreaWidth / (this.stringCount + 1);
        
        // Button area dimensions (from renderButtons)
        const buttonRadius = 8;
        const verticalPadding = 20;
        const buttonCenterY = activeAreaY + verticalPadding + buttonRadius;
        const buttonMargin = 5; // Extra margin around buttons
        const stringStartY = buttonCenterY + buttonRadius + buttonMargin;
        
        // Use external last plucked string when in socket mode, otherwise use internal hover state
        const lastPluckedString = this.socketMode ? this.externalLastPluckedString : this.lastHoveredString;
        
        return svg`
            ${Array.from({ length: this.stringCount }, (_, i) => {
                const stringX = activeAreaX + stringSpacing * (i + 1);
                
                // Get note label for this string
                const note = this.notes[i];
                const noteLabel = note ? `${note.notation}${note.octave}` : '';
                
                // Check if this string is the one that was just plucked
                const isPlucked = lastPluckedString === i;
                
                return svg`
                    <!-- Visible string - non-interactive -->
                    <line 
                        x1="${stringX}" 
                        y1="${stringStartY}" 
                        x2="${stringX}" 
                        y2="${activeAreaY + activeAreaHeight}"
                        stroke="#6c757d"
                        stroke-width="1"
                        opacity="0.5"
                        class="${isPlucked ? 'string-plucked' : ''}"
                        pointer-events="none" />
                    
                    <!-- Note label at bottom of string -->
                    ${noteLabel ? svg`
                        <text 
                            x="${stringX}" 
                            y="${activeAreaY + activeAreaHeight - 5}"
                            text-anchor="middle"
                            font-size="10"
                            fill="#adb5bd"
                            font-weight="500"
                            pointer-events="none">
                            ${noteLabel}
                        </text>
                    ` : ''}
                `;
            })}
        `;
    }

    private renderButtons(activeAreaWidth: number, activeAreaX: number, activeAreaY: number) {
        const buttonCount = this.hardwareConfig.buttonCount;
        if (buttonCount === 0) return svg``;
        
        // Smaller buttons to fit within active area with padding
        const buttonRadius = 8;
        const buttonGap = 6; // Reduced gap to fit all buttons
        const horizontalPadding = 10; // Padding from left/right edges
        const verticalPadding = 20; // Padding from top edge
        
        const totalButtonsWidth = (buttonRadius * 2 * buttonCount) + (buttonGap * (buttonCount - 1));
        // For 8 buttons: (8*2*8) + (6*7) = 128 + 42 = 170px, fits in 200px - 20px padding = 180px
        
        // Center within the active area, accounting for horizontal padding
        const availableWidth = activeAreaWidth - (horizontalPadding * 2);
        const startX = activeAreaX + horizontalPadding + (availableWidth - totalButtonsWidth) / 2;
        const buttonY = activeAreaY + verticalPadding + buttonRadius;
        
        return svg`
            ${Array.from({ length: buttonCount }, (_, i) => {
                const buttonCx = startX + buttonRadius + (i * (buttonRadius * 2 + buttonGap));
                // Use external pressed buttons when in socket mode, otherwise use internal state
                const pressedButtonsSet = this.socketMode ? this.externalPressedButtons : this.pressedButtons;
                const isPressed = pressedButtonsSet.has(i);
                
                return svg`
                    <g class="tablet-button">
                        <!-- Circular button -->
                        <circle cx="${buttonCx}" cy="${buttonY}" 
                              r="${buttonRadius}"
                              fill="${isPressed ? '#51cf66' : '#495057'}"
                              stroke="#adb5bd"
                              stroke-width="1.5"
                              pointer-events="${this.socketMode ? 'none' : 'auto'}"
                              @mousedown=${(e: MouseEvent) => this.handleButtonMouseDown(i, e)}
                              @mouseup=${(e: MouseEvent) => this.handleButtonMouseUp(i, e)}
                              class="button-rect" />
                        
                        <!-- Button number label -->
                        <text x="${buttonCx}" y="${buttonY + 4}"
                              text-anchor="middle"
                              font-size="11"
                              fill="${isPressed ? '#000' : '#f8f9fa'}"
                              font-weight="600"
                              pointer-events="none">
                            ${i + 1}
                        </text>
                    </g>
                `;
            })}
        `;
    }

    private renderTablet() {
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
                
                <!-- Strings (vertical lines) -->
                ${this.renderStrings(activeAreaWidth, activeAreaHeight, activeAreaX, activeAreaY)}
                
                <!-- Buttons rendered AFTER strings to appear on top -->
                ${this.renderButtons(activeAreaWidth, activeAreaX, activeAreaY)}
                
                ${(() => {
                    // Use external data when in socket mode, otherwise use internal state
                    const shouldShow = this.socketMode 
                        ? this.externalTabletData.pressure > 0
                        : (this.clickPosition && this.isPressingTablet);
                    
                    if (!shouldShow) return '';
                    
                    if (this.socketMode) {
                        // Convert normalized coordinates to SVG coordinates
                        const x = activeAreaX + (this.externalTabletData.x * activeAreaWidth);
                        const y = activeAreaY + (this.externalTabletData.y * activeAreaHeight);
                        return svg`
                            <!-- Pressure indicator dot -->
                            <circle cx="${x}" 
                                    cy="${y}" 
                                    r="12" 
                                    fill="#ff6b6b"
                                    opacity="${this.externalTabletData.pressure}"
                                    pointer-events="none" />
                        `;
                    } else {
                        return svg`
                            <!-- Pressure indicator dot -->
                            <circle cx="${this.clickPosition!.x}" 
                                    cy="${this.clickPosition!.y}" 
                                    r="12" 
                                    fill="#ff6b6b"
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
                      fill="#6c757d"
                      stroke="#495057"
                      stroke-width="1"
                      stroke-linejoin="round"
                      pointer-events="none" />
                <!-- Rounded tip cap -->
                <circle cx="6" cy="${penWidth/2}" r="2"
                        fill="#6c757d"
                        pointer-events="none" />
                
                <!-- Pen body -->
                <rect x="15" y="0" 
                      width="${penLength - 30}" height="${penWidth}"
                      rx="2"
                      fill="#343a40"
                      stroke="#495057"
                      stroke-width="1"
                      pointer-events="none" />
                
                <!-- Pen eraser end (right side) -->
                <ellipse cx="${penLength - 12}" cy="${penWidth/2}"
                         rx="3" ry="${penWidth / 2}"
                         fill="#495057"
                         pointer-events="none" />
                <rect x="${penLength - 15}" y="0" 
                      width="8" height="${penWidth}"
                      fill="#495057"
                      pointer-events="none" />
                
                <!-- Primary Button (closer to tip, on top of pen) -->
                <rect x="${button1X}" y="${penWidth/2 - buttonWidth/2}" 
                      width="${buttonHeight}" height="${buttonWidth}"
                      rx="2"
                      fill="${(this.socketMode ? this.externalTabletData.secondaryButtonPressed : this.secondaryButtonPressed) ? '#51cf66' : '#495057'}"
                      stroke="${(this.socketMode ? this.externalTabletData.secondaryButtonPressed : this.secondaryButtonPressed) ? '#40c057' : '#6c757d'}"
                      stroke-width="1"
                      pointer-events="${this.socketMode ? 'none' : 'auto'}"
                      @mousedown=${(e: MouseEvent) => this.handleStylusButtonMouseDown(true, e)}
                      @mouseup=${(e: MouseEvent) => this.handleStylusButtonMouseUp(true, e)}
                      class="button-rect" />
                
                <!-- Secondary Button (further from tip, on top of pen) -->
                <rect x="${button2X}" y="${penWidth/2 - buttonWidth/2}" 
                      width="${buttonHeight}" height="${buttonWidth}"
                      rx="2"
                      fill="${(this.socketMode ? this.externalTabletData.primaryButtonPressed : this.primaryButtonPressed) ? '#51cf66' : '#495057'}"
                      stroke="${(this.socketMode ? this.externalTabletData.primaryButtonPressed : this.primaryButtonPressed) ? '#40c057' : '#6c757d'}"
                      stroke-width="1"
                      pointer-events="${this.socketMode ? 'none' : 'auto'}"
                      @mousedown=${(e: MouseEvent) => this.handleStylusButtonMouseDown(false, e)}
                      @mouseup=${(e: MouseEvent) => this.handleStylusButtonMouseUp(false, e)}
                      class="button-rect" />
            </g>
        `;
    }

    private renderTilt() {
        const viewBoxWidth = 300;
        const viewBoxHeight = 320; // Increased from 300 to make room for labels
        const centerX = viewBoxWidth / 2;
        const centerY = viewBoxHeight / 2 + 5; // Moved down for better spacing
        const maxRadius = 80; // Reduced from 100 for more breathing room
        const buttonsY = 30;
        
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
                            stroke="${isActive ? '#ff6b6b' : '#495057'}"
                            stroke-width="${strokeWidth}"
                            opacity="${opacity}"
                            pointer-events="none" />
                    `;
                })}
                
                <!-- Center point -->
                <circle cx="${centerX}" cy="${centerY}" r="4" 
                    fill="#adb5bd"
                    pointer-events="none" />
                
                <!-- Tilt direction line -->
                ${isPressingTilt || tiltX !== 0 || tiltY !== 0 ? svg`
                    <line x1="${centerX}" y1="${centerY}" 
                          x2="${tiltLineEndX}" y2="${tiltLineEndY}"
                          stroke="#339af0"
                          stroke-width="3"
                          stroke-linecap="round"
                          pointer-events="none" />
                    
                    <!-- Tilt indicator dot -->
                    <circle cx="${tiltLineEndX}" cy="${tiltLineEndY}" r="6" 
                        fill="#339af0"
                        pointer-events="none" />
                ` : ''}
                
                <!-- Axis labels with more vertical separation -->
                <text x="${centerX}" y="${viewBoxHeight - 45}" class="axis-label" text-anchor="middle">
                    Tilt X: ${tiltX.toFixed(2)} | Tilt Y: ${tiltY.toFixed(2)}
                </text>
                <text x="${centerX}" y="${viewBoxHeight - 30}" class="axis-label" text-anchor="middle">
                    Tilt X + Y: ${tiltMagnitude.toFixed(2)}
                </text>
                <text x="${centerX}" y="${viewBoxHeight - 15}" class="axis-label" text-anchor="middle">
                    Pressure: ${tiltPressure.toFixed(2)}
                </text>
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

