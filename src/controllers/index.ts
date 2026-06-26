/**
 * Mouse-driven fallback controller used by tablet-visualizer when the user
 * pokes the SVG with a pointer. With a real tablet attached, data flows in
 * via the visualizer's `externalTabletData` property instead and this
 * controller is effectively idle.
 */

interface TabletInteractionData {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  isPressed: boolean;
}

class TabletInteractionController {
  private listeners = new Set<(data: TabletInteractionData) => void>();
  private current: TabletInteractionData = {
    x: 0, y: 0, pressure: 0, tiltX: 0, tiltY: 0, isPressed: false,
  };

  setTabletPosition(x: number, y: number, isPressed: boolean) {
    this.current = { ...this.current, x, y, isPressed };
    this.notify();
  }

  setTabletPressed(isPressed: boolean) {
    this.current = { ...this.current, isPressed, pressure: isPressed ? this.current.pressure : 0 };
    this.notify();
  }

  setTiltPosition(tiltX: number, tiltY: number, pressure: number, isPressed: boolean) {
    this.current = { ...this.current, tiltX, tiltY, pressure, isPressed };
    this.notify();
  }

  setTiltPressed(isPressed: boolean) {
    if (!isPressed) {
      this.current = { ...this.current, tiltX: 0, tiltY: 0, pressure: 0, isPressed };
    } else {
      this.current = { ...this.current, isPressed };
    }
    this.notify();
  }

  subscribe(callback: (data: TabletInteractionData) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    for (const cb of this.listeners) cb({ ...this.current });
  }
}

export const sharedTabletInteraction = new TabletInteractionController();
