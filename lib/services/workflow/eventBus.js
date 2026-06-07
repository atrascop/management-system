import { EventEmitter } from "events";

class SafeEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // avoid silent duplication issues
  }
}

export const eventBus = new SafeEventBus();
