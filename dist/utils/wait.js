"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = wait;
async function wait(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=wait.js.map