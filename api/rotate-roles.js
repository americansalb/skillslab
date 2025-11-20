const sessionManager = require('../utils/session-manager');

/**
 * Manually rotate roles in a group (or automatic rotation trigger)
 * POST /api/rotate-roles
 */
module.exports = (req, res) => {
  try {
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Missing groupId',
      });
    }

    const result = sessionManager.rotateRoles(groupId);

    // Mark switch start time for transition tracking
    const group = sessionManager.groups.get(groupId);
    if (group) {
      group.switchStartTime = Date.now();
    }

    res.json({
      success: true,
      groupId: result.groupId,
      newRoles: result.newRoles,
      rotationCount: result.rotationCount,
      message: 'Roles rotated - participants must click ready',
    });
  } catch (error) {
    console.error('Rotate roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rotate roles',
      error: error.message,
    });
  }
};
