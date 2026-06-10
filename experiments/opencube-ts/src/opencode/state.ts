export type SessionStatus = "busy" | "retry" | "idle"

export type OpenCodeEvent =
  | { type: "session.busy"; sessionID: string }
  | { type: "session.retry"; sessionID: string }
  | { type: "session.idle"; sessionID: string }
  | { type: "tool.start"; sessionID: string; callID: string; tool?: string }
  | { type: "tool.finish"; sessionID: string; callID: string; tool?: string }
  | { type: "permission.ask"; sessionID: string; requestID: string; permission?: string }
  | { type: "permission.reply"; sessionID: string; requestID: string; reply?: string }
  | { type: "question.ask"; sessionID: string; requestID: string; questionCount?: number }
  | { type: "question.reply"; sessionID: string; requestID: string }
  | { type: "question.reject"; sessionID: string; requestID: string }

export type SessionState = {
  sessionID: string
  status: SessionStatus
  activeTools: Set<string>
  pendingPermissions: Set<string>
  pendingQuestions: Set<string>
}

export type OpenCodeStateListener = (event: OpenCodeEvent, state: OpenCodeState) => void

export class OpenCodeState {
  sessions: Map<string, SessionState>
  private listeners: OpenCodeStateListener[]

  constructor() {
    this.sessions = new Map()
    this.listeners = []
  }

  onEvent(listener: OpenCodeStateListener) {
    this.listeners.push(listener)
  }

  private emitEvent(event: OpenCodeEvent) {
    for (const listener of this.listeners) listener(event, this)
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

  applyEvent(event: OpenCodeEvent) {
    this.emitEvent(event)
    this.applyEventToState(event)
  }

  private applyEventToState(event: OpenCodeEvent) {
    const session = this.getSession(event.sessionID)

    if (event.type === "session.busy") {
      session.status = "busy"
      return
    }

    if (event.type === "session.retry") {
      session.status = "retry"
      return
    }

    if (event.type === "session.idle") {
      session.status = "idle"
      session.activeTools.clear()
      session.pendingPermissions.clear()
      session.pendingQuestions.clear()
      return
    }

    if (event.type === "tool.start" && event.callID) {
      session.activeTools.add(event.callID)
      return
    }

    if (event.type === "tool.finish" && event.callID) {
      session.activeTools.delete(event.callID)
      return
    }

    if (event.type === "permission.ask" && event.requestID) {
      session.pendingPermissions.add(event.requestID)
      return
    }

    if (event.type === "permission.reply" && event.requestID) {
      session.pendingPermissions.delete(event.requestID)
      return
    }

    if (event.type === "question.ask" && event.requestID) {
      session.pendingQuestions.add(event.requestID)
      return
    }

    if ((event.type === "question.reply" || event.type === "question.reject") && event.requestID) {
      session.pendingQuestions.delete(event.requestID)
    }
  }
}
