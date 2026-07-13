"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSimulatedUserId = getSimulatedUserId;
const notification_schema_1 = require("../modules/notifications/notification.schema");
function getSimulatedUserId(request) {
    const headerUserId = request.header("x-user-id");
    if (headerUserId) {
        const parsed = notification_schema_1.userIdSchema.safeParse(headerUserId);
        return parsed.success ? parsed.data : null;
    }
    const queryUserId = request.query.userId;
    if (typeof queryUserId === "string") {
        const parsed = notification_schema_1.userIdSchema.safeParse(queryUserId);
        return parsed.success ? parsed.data : null;
    }
    return null;
}
//# sourceMappingURL=simulated-auth.js.map