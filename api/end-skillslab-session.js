const sessionManager = require('../utils/session-manager');

/**
 * End a Skills Lab session
 * POST /api/end-skillslab-session
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

    const session = sessionManager.endSession(sessionId);

    res.json({
      success: true,
      message: 'Session ended',
      session: {
        sessionId: session.sessionId,
        name: session.name,
        status: session.status,
        endedAt: session.endedAt,
      },
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end session',
      error: error.message,
    });
  }
};
