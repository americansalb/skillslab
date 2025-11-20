const sessionManager = require('../utils/session-manager');

/**
 * Update group settings (language mode, etc.)
 * POST /api/update-group-settings
 */
module.exports = (req, res) => {
  try {
    const { groupId, languageMode } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId',
      });
    }

    const group = sessionManager.updateGroupSettings(groupId, {
      languageMode,
    });

    res.json({
      success: true,
      message: 'Group settings updated',
      group: {
        groupId: group.groupId,
        groupNumber: group.groupNumber,
        languageMode: group.languageMode,
      },
    });
  } catch (error) {
    console.error('Update group settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update group settings',
      error: error.message,
    });
  }
};
