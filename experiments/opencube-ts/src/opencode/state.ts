export type SessionStatus = "busy" | "idle"

export type OpenCodeEvent = {
  type: string
  sessionID?: string
  callID?: string
  requestID?: string
}

export type SessionState = {
  sessionID: string
  status: SessionStatus
  activeTools: Set<string>
  pendingPermissions: Set<string>
  pendingQuestions: Set<string>
}

export type OpenCodeChange =
  | { type: "session.busy"; sessionID: string }
  | { type: "session.idle"; sessionID: string }
  | { type: "tool.start"; sessionID: string; callID: string }
  | { type: "tool.finish"; sessionID: string; callID: string }
  | { type: "permission.ask"; sessionID: string; requestID: string }
  | { type: "permission.reply"; sessionID: string; requestID: string }
  | { type: "question.ask"; sessionID: string; requestID: string }
  | { type: "question.done"; sessionID: string; requestID: string }

export class OpenCodeState {
  sessions: Map<string, SessionState>

  constructor() {
    this.sessions = new Map()
  }

  getSession(sessionID: string): SessionState {
    let session = this.sessions.get(sessionID)
    if (!session) {
      session = {
        sessionID,
        status: "idle",
        activeTools: new Set(),
        pendingPermissions: new Set(),
        pendingQuestions: new Set(),
      }
      this.sessions.set(sessionID, session)
    }
    return session
  }

  applyEvent(event: OpenCodeEvent): OpenCodeChange[] {
    if (!event.sessionID) return []

    const session = this.getSession(event.sessionID)

    if (event.type === "session.busy") {
      session.status = "busy"
      return [{ type: "session.busy", sessionID: event.sessionID }]
    }

    if (event.type === "session.idle") {
      session.status = "idle"
      session.activeTools.clear()
      session.pendingPermissions.clear()
      session.pendingQuestions.clear()
      return [{ type: "session.idle", sessionID: event.sessionID }]
    }

    if (event.type === "tool.start" && event.callID) {
      session.activeTools.add(event.callID)
      return [{ type: "tool.start", sessionID: event.sessionID, callID: event.callID }]
    }

    if (event.type === "tool.finish" && event.callID) {
      session.activeTools.delete(event.callID)
      return [{ type: "tool.finish", sessionID: event.sessionID, callID: event.callID }]
    }

    if (event.type === "permission.ask" && event.requestID) {
      session.pendingPermissions.add(event.requestID)
      return [{ type: "permission.ask", sessionID: event.sessionID, requestID: event.requestID }]
    }

    if (event.type === "permission.reply" && event.requestID) {
      session.pendingPermissions.delete(event.requestID)
      return [{ type: "permission.reply", sessionID: event.sessionID, requestID: event.requestID }]
    }

    if (event.type === "question.ask" && event.requestID) {
      session.pendingQuestions.add(event.requestID)
      return [{ type: "question.ask", sessionID: event.sessionID, requestID: event.requestID }]
    }

    if ((event.type === "question.reply" || event.type === "question.reject") && event.requestID) {
      session.pendingQuestions.delete(event.requestID)
      return [{ type: "question.done", sessionID: event.sessionID, requestID: event.requestID }]
    }

    return []
  }
}
