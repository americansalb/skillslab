const sessionManager = require('../utils/session-manager');

/**
 * Mark a participant as ready after role switch
 * POST /api/mark-ready
 */
module.exports = (req, res) => {
  try {
    const { groupId, participantId } = req.body;

    if (!groupId || !participantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId or participantId',
      });
    }

    const allReady = sessionManager.markParticipantReady(groupId, participantId);

    res.json({
      success: true,
      allReady,
      message: allReady ? 'All participants ready - resuming' : 'Waiting for others',
    });
  } catch (error) {
    console.error('Mark ready error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark ready',
      error: error.message,
    });
  }
};
