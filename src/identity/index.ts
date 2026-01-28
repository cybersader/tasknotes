/**
 * Device Identity Module
 *
 * Provides device identification and user registry for shared vault scenarios.
 *
 * Usage:
 *   import { DeviceIdentityManager, UserRegistry } from './identity';
 *
 *   const deviceManager = new DeviceIdentityManager();
 *   const userRegistry = new UserRegistry(plugin, deviceManager);
 *
 *   // Check if device is registered
 *   if (userRegistry.isDeviceRegistered()) {
 *     const creator = userRegistry.getCreatorValueForNewTask();
 *     // Use creator when creating tasks
 *   }
 */

export { DeviceIdentityManager } from "./DeviceIdentityManager";
export {
	UserRegistry,
	type DeviceUserSettings,
	DEFAULT_DEVICE_USER_SETTINGS,
} from "./UserRegistry";
export type { DeviceUserMapping } from "../types/settings";
