"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCodeState = void 0;
class OpenCodeState {
    sessions;
    listeners;
    constructor() {
        this.sessions = new Map();
        this.listeners = [];
    }
    onEvent(listener) {
        this.listeners.push(listener);
    }
    emitEvent(event) {
        for (const listener of this.listeners)
            listener(event, this);
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
        this.emitEvent(event);
        this.applyEventToState(event);
    }
    applyEventToState(event) {
        const session = this.getSession(event.sessionID);
        if (event.type === "session.busy") {
            session.status = "busy";
            return;
        }
        if (event.type === "session.retry") {
            session.status = "retry";
            return;
        }
        if (event.type === "session.idle") {
            session.status = "idle";
            session.activeTools.clear();
            session.pendingPermissions.clear();
            session.pendingQuestions.clear();
            return;
        }
        if (event.type === "tool.start" && event.callID) {
            session.activeTools.add(event.callID);
            return;
        }
        if (event.type === "tool.finish" && event.callID) {
            session.activeTools.delete(event.callID);
            return;
        }
        if (event.type === "permission.ask" && event.requestID) {
            session.pendingPermissions.add(event.requestID);
            return;
        }
        if (event.type === "permission.reply" && event.requestID) {
            session.pendingPermissions.delete(event.requestID);
            return;
        }
        if (event.type === "question.ask" && event.requestID) {
            session.pendingQuestions.add(event.requestID);
            return;
        }
        if ((event.type === "question.reply" || event.type === "question.reject") && event.requestID) {
            session.pendingQuestions.delete(event.requestID);
        }
    }
}
exports.OpenCodeState = OpenCodeState;
