const sessionManager = require('../utils/session-manager');

/**
 * Create a new Skills Lab session
 * POST /api/create-skillslab-session
 */
module.exports = (req, res) => {
  try {
    const {
      name,
      totalDuration, // in minutes
      languageMode, // 'same' or 'different'
      script,
      audioFiles,
      numberOfGroups,
    } = req.body;

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

    // Create groups
    const groups = [];
    for (let i = 1; i <= numberOfGroups; i++) {
      const group = sessionManager.createGroup(session.sessionId, i);
      groups.push({
        groupId: group.groupId,
        groupNumber: group.groupNumber,
      });
    }

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
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: error.message,
    });
  }
};
