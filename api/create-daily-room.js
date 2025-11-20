const sessionManager = require('../utils/session-manager');
const dailyHelper = require('../utils/daily-helper');

/**
 * Create a Daily.co room for a group
 * POST /api/create-daily-room
 */
module.exports = async (req, res) => {
  try {
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId',
      });
    }

    const group = sessionManager.groups.get(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Check if room already exists
    if (group.dailyRoomName && group.dailyRoomUrl) {
      return res.json({
        success: true,
        roomName: group.dailyRoomName,
        roomUrl: group.dailyRoomUrl,
        message: 'Room already exists',
      });
    }

    // Create Daily room
    const roomInfo = await dailyHelper.createRoom(groupId, {
      expirationTime: Math.floor(Date.now() / 1000) + 14400, // 4 hours
    });

    // Update group with room info
    group.dailyRoomName = roomInfo.roomName;
    group.dailyRoomUrl = roomInfo.roomUrl;
    group.dailyRoomId = roomInfo.roomId;

    // Start recording immediately
    const recordingInfo = await dailyHelper.startRecording(roomInfo.roomName);
    group.recordingId = recordingInfo.recordingId;

    res.json({
      success: true,
      roomName: roomInfo.roomName,
      roomUrl: roomInfo.roomUrl,
      recordingStarted: true,
      recordingId: recordingInfo.recordingId,
    });
  } catch (error) {
    console.error('Create Daily room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Daily room',
      error: error.message,
    });
  }
};
