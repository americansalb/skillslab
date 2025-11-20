const sessionManager = require('../utils/session-manager');

/**
 * Get current group state
 * GET /api/get-group-state?groupId=xxx
 */
module.exports = (req, res) => {
  try {
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId parameter',
      });
    }

    const state = sessionManager.getGroupState(groupId);

    res.json({
      success: true,
      group: {
        groupId: state.group.groupId,
        groupNumber: state.group.groupNumber,
        size: state.group.size,
        status: state.group.status,
        rotationCount: state.group.rotationCount,
        participants: state.group.participants.map(p => ({
          participantId: p.participantId,
          name: p.name,
          email: p.email,
          role: state.group.currentRoles[p.participantId],
          timeAsInterpreter: state.group.timeTracking[p.participantId].totalTimeAsInterpreter,
          targetTime: state.group.timeTracking[p.participantId].targetTime,
        })),
        dailyRoomUrl: state.group.dailyRoomUrl,
      },
      session: state.session,
    });
  } catch (error) {
    console.error('Get group state error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get group state',
      error: error.message,
    });
  }
};
