/**
 * Bases Query Notifications Module
 *
 * Provides event-driven background monitoring for Bases queries,
 * with rich notification modals for user interaction.
 */

export { BasesQueryWatcher } from "./BasesQueryWatcher";
export {
	BasesNotificationModal,
	type NotificationItem,
	type BasesNotificationModalOptions,
} from "../modals/BasesNotificationModal";
