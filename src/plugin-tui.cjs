module.exports = {
  id: "opencube",
  // Slash commands are registered from the server plugin via cfg.command, using
  // the same command.execute.before abort trick as @slkiser/opencode-quota.
  // Keep a no-op TUI entry so opencode can load ./tui without duplicate /pet rows.
  tui: async () => {},
}
