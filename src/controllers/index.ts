/**
 * Shared tablet interaction controller
 * Stub implementation for tablet-visualizer component
 */

class TabletInteractionController {
  private listeners: Set<(data: any) => void> = new Set();
  
  private currentData = {
    x: 0,
    y: 0,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    isPressed: false
  };

  setTabletPosition(x: number, y: number, isPressed: boolean) {
    this.currentData.x = x;
    this.currentData.y = y;
    this.currentData.isPressed = isPressed;
    this.notify();
  }

  setTabletPressed(isPressed: boolean) {
    this.currentData.isPressed = isPressed;
    if (!isPressed) {
      this.currentData.pressure = 0;
    }
    this.notify();
  }

  setTiltPosition(tiltX: number, tiltY: number, pressure: number, isPressed: boolean) {
    this.currentData.tiltX = tiltX;
    this.currentData.tiltY = tiltY;
    this.currentData.pressure = pressure;
    this.currentData.isPressed = isPressed;
    this.notify();
  }

  setTiltPressed(isPressed: boolean) {
    this.currentData.isPressed = isPressed;
    if (!isPressed) {
      this.currentData.tiltX = 0;
      this.currentData.tiltY = 0;
      this.currentData.pressure = 0;
    }
    this.notify();
  }

  subscribe(callback: (data: any) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach(listener => listener({ ...this.currentData }));
  }
}

export const sharedTabletInteraction = new TabletInteractionController();


