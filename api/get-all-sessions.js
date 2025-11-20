const sessionManager = require('../utils/session-manager');

/**
 * Get all active sessions (for TA control panel)
 * GET /api/get-all-sessions
 */
module.exports = (req, res) => {
  try {
    const sessions = Array.from(sessionManager.sessions.values());

    const sessionData = sessions.map(session => {
      const groups = sessionManager.getSessionGroups(session.sessionId);

      return {
        sessionId: session.sessionId,
        name: session.name,
        status: session.status,
        totalDuration: session.totalDuration,
        startedAt: session.startedAt,
        languageMode: session.languageMode,
        groups: groups.map(g => ({
          groupId: g.groupId,
          groupNumber: g.groupNumber,
          languageMode: g.languageMode || 'same',
          size: g.size,
          status: g.status,
          rotationCount: g.rotationCount,
          dailyRoomUrl: g.dailyRoomUrl,
          participants: g.participants.map(p => ({
            participantId: p.participantId,
            name: p.name,
            email: p.email,
            role: g.currentRoles[p.participantId],
          })),
        })),
      };
    });

    res.json({
      success: true,
      sessions: sessionData,
    });
  } catch (error) {
    console.error('Get all sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sessions',
      error: error.message,
    });
  }
};
