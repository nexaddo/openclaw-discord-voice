/**
 * Discord Plugin - Voice Integration
 * Main export file for Phase 7 Discord Plugin Integration
 */

// Type exports
export * from './types.js';

// Handler exports
export { CommandHandler } from './handlers/CommandHandler.js';
export { EventHandler } from './handlers/EventHandler.js';

// State management exports
export { GuildStateManager } from './state/GuildStateManager.js';

// Integration exports
export { PipelineAdapter } from './integration/PipelineAdapter.js';

/**
 * Main Discord Plugin class
 * Integrates all components for voice functionality
 */
export class DiscordPlugin {
  private commandHandler: any;
  private eventHandler: any;
  private stateManager: any;

  constructor(stateManager: any, config: any = {}) {
    // Import handlers after Phase 6
    this.stateManager = stateManager;
  }

  /**
   * Initialize plugin
   */
  async initialize(): Promise<void> {
    // Load persisted state
    await this.stateManager.loadState();
    // Start auto-save
    this.stateManager.startAutoSave(30000);
  }

  /**
   * Destroy plugin
   */
  async destroy(): Promise<void> {
    this.stateManager.stopAutoSave();
    await this.stateManager.saveState();
  }

  /**
   * Get command handler
   */
  getCommandHandler(): any {
    return this.commandHandler;
  }

  /**
   * Get event handler
   */
  getEventHandler(): any {
    return this.eventHandler;
  }

  /**
   * Get state manager
   */
  getStateManager(): any {
    return this.stateManager;
  }
}
