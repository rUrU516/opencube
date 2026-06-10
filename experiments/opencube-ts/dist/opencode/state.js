"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCodeState = void 0;
class OpenCodeState {
    sessions;
    constructor() {
        this.sessions = new Map();
    }
    getSession(sessionID) {
        let session = this.sessions.get(sessionID);
        if (!session) {
            session = {
                sessionID,
                status: "idle",
                activeTools: new Set(),
                pendingPermissions: new Set(),
                pendingQuestions: new Set(),
            };
            this.sessions.set(sessionID, session);
        }
        return session;
    }
    applyEvent(event) {
        const session = this.getSession(event.sessionID);
        if (event.type === "session.busy") {
            session.status = "busy";
            return [{ type: "session.busy", sessionID: event.sessionID }];
        }
        if (event.type === "session.retry") {
            session.status = "retry";
            return [{ type: "session.retry", sessionID: event.sessionID }];
        }
        if (event.type === "session.idle") {
            session.status = "idle";
            session.activeTools.clear();
            session.pendingPermissions.clear();
            session.pendingQuestions.clear();
            return [{ type: "session.idle", sessionID: event.sessionID }];
        }
        if (event.type === "tool.start" && event.callID) {
            session.activeTools.add(event.callID);
            return [{ type: "tool.start", sessionID: event.sessionID, callID: event.callID, tool: event.tool }];
        }
        if (event.type === "tool.finish" && event.callID) {
            session.activeTools.delete(event.callID);
            return [{ type: "tool.finish", sessionID: event.sessionID, callID: event.callID, tool: event.tool }];
        }
        if (event.type === "permission.ask" && event.requestID) {
            session.pendingPermissions.add(event.requestID);
            return [{ type: "permission.ask", sessionID: event.sessionID, requestID: event.requestID, permission: event.permission }];
        }
        if (event.type === "permission.reply" && event.requestID) {
            session.pendingPermissions.delete(event.requestID);
            return [{ type: "permission.reply", sessionID: event.sessionID, requestID: event.requestID, reply: event.reply }];
        }
        if (event.type === "question.ask" && event.requestID) {
            session.pendingQuestions.add(event.requestID);
            return [{ type: "question.ask", sessionID: event.sessionID, requestID: event.requestID, questionCount: event.questionCount }];
        }
        if ((event.type === "question.reply" || event.type === "question.reject") && event.requestID) {
            session.pendingQuestions.delete(event.requestID);
            return [{ type: "question.done", sessionID: event.sessionID, requestID: event.requestID }];
        }
        return [];
    }
}
exports.OpenCodeState = OpenCodeState;
