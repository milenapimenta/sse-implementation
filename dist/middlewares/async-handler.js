"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = asyncHandler;
function asyncHandler(handler) {
    return (request, response, next) => {
        void handler(request, response, next).catch(next);
    };
}
//# sourceMappingURL=async-handler.js.map