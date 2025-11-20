const sessionManager = require('../utils/session-manager');
const dailyHelper = require('../utils/daily-helper');

/**
 * Get a Daily.co meeting token for a participant
 * POST /api/get-daily-token
 */
module.exports = async (req, res) => {
  try {
    const { groupId, participantId, isTA } = req.body;

    if (!groupId || !participantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId or participantId',
      });
    }

    const group = sessionManager.groups.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    if (!group.dailyRoomName) {
      return res.status(400).json({
        success: false,
        message: 'Daily room not created yet',
      });
    }

    // Find participant
    const participant = group.participants.find(p => p.participantId === participantId);

    if (!participant && !isTA) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found',
      });
    }

    // Create meeting token
    const token = await dailyHelper.createMeetingToken(group.dailyRoomName, {
      participantId,
      name: participant ? participant.name : 'TA',
      isTA: isTA || false,
    });

    res.json({
      success: true,
      token,
      roomUrl: group.dailyRoomUrl,
    });
  } catch (error) {
    console.error('Get Daily token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Daily token',
      error: error.message,
    });
  }
};
