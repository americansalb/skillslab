const sessionManager = require('../utils/session-manager');

/**
 * Start a Skills Lab session (begins timers and allows role rotation)
 * POST /api/start-skillslab-session
 */
module.exports = (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Missing sessionId',
      });
    }

    sessionManager.startSession(sessionId);

    // Get all groups in session
    const groups = sessionManager.getSessionGroups(sessionId);

    res.json({
      success: true,
      message: 'Session started',
      sessionId,
      groups: groups.map(g => ({
        groupId: g.groupId,
        groupNumber: g.groupNumber,
        status: g.status,
        participants: g.participants.length,
      })),
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start session',
      error: error.message,
    });
  }
};
