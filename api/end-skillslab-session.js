const sessionManager = require('../utils/session-manager');

/**
 * End a Skills Lab session
 * POST /api/end-skillslab-session
 */
module.exports = (req, res, io) => {
  try {
    const { sessionId } = req.body;

    console.log('[END-SESSION] Ending session:', sessionId);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Missing sessionId',
      });
    }

    const session = sessionManager.endSession(sessionId);

    // Notify all groups in this session
    const groups = sessionManager.getSessionGroups(sessionId);
    groups.forEach(group => {
      console.log(`[END-SESSION] Notifying group ${group.groupId} that session ended`);
      io.to(group.groupId).emit('skillslab:session-ended', {
        message: 'Session has ended. Thank you for participating!',
        sessionId,
      });
    });

    console.log('[END-SESSION] ✓ Session ended successfully');

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
    console.error('[END-SESSION] ✗ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end session',
      error: error.message,
    });
  }
};
