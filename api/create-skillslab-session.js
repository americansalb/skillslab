const sessionManager = require('../utils/session-manager');
const dailyHelper = require('../utils/daily-helper');

/**
 * Create a new Skills Lab session
 * POST /api/create-skillslab-session
 */
module.exports = async (req, res) => {
  try {
    const {
      name,
      totalDuration, // in minutes
      languageMode, // 'same' or 'different'
      script,
      audioFiles,
      numberOfGroups,
    } = req.body;

    console.log('[CREATE-SESSION] Creating new session:', name);
    console.log('[CREATE-SESSION] Number of groups:', numberOfGroups);

    if (!name || !totalDuration || !numberOfGroups) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, totalDuration, numberOfGroups',
      });
    }

    // Create session
    const session = sessionManager.createSession({
      name,
      totalDuration: totalDuration * 60 * 1000, // Convert minutes to ms
      languageMode: languageMode || 'same',
      script: script || null,
      audioFiles: audioFiles || {},
    });

    console.log('[CREATE-SESSION] Session created:', session.sessionId);

    // Create groups and Daily.co rooms
    const groups = [];
    for (let i = 1; i <= numberOfGroups; i++) {
      console.log(`[CREATE-SESSION] Creating group ${i}/${numberOfGroups}...`);

      const group = sessionManager.createGroup(session.sessionId, i);

      // Create Daily.co room for this group
      try {
        console.log(`[CREATE-SESSION] Creating Daily room for group ${i}...`);
        const roomInfo = await dailyHelper.createRoom(group.groupId, {
          expirationTime: Math.floor(Date.now() / 1000) + (totalDuration * 60) + 3600, // Session duration + 1 hour buffer
        });

        // Store room info in group
        group.dailyRoomName = roomInfo.roomName;
        group.dailyRoomUrl = roomInfo.roomUrl;

        console.log(`[CREATE-SESSION] ✓ Daily room created: ${roomInfo.roomName}`);
        console.log(`[CREATE-SESSION] Room URL: ${roomInfo.roomUrl}`);

        groups.push({
          groupId: group.groupId,
          groupNumber: group.groupNumber,
          dailyRoomUrl: group.dailyRoomUrl,
        });
      } catch (dailyError) {
        console.error(`[CREATE-SESSION] ✗ Failed to create Daily room for group ${i}:`, dailyError.message);
        // Continue without Daily room - students can still join but won't have video
        groups.push({
          groupId: group.groupId,
          groupNumber: group.groupNumber,
          dailyRoomUrl: null,
          error: 'Video room creation failed',
        });
      }
    }

    console.log('[CREATE-SESSION] ✓ Session creation complete!');
    console.log('[CREATE-SESSION] Groups created:', groups.length);

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        name: session.name,
        totalDuration: session.totalDuration,
        languageMode: session.languageMode,
        status: session.status,
      },
      groups,
    });
  } catch (error) {
    console.error('[CREATE-SESSION] ✗ Session creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: error.message,
    });
  }
};
