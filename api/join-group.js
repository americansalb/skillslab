const sessionManager = require('../utils/session-manager');

/**
 * Student joins a group
 * POST /api/join-group
 */
module.exports = (req, res) => {
  try {
    const {
      sessionId,
      groupNumber,
      email,
      name,
      studentId,
    } = req.body;

    if (!sessionId || !groupNumber || !email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, groupNumber, email, name',
      });
    }

    // Construct groupId
    const groupId = `${sessionId}_group_${groupNumber}`;

    // Join group
    const assignment = sessionManager.joinGroup(groupId, {
      email,
      name,
      studentId,
    });

    // Get next role
    const nextRole = calculateNextRole(assignment.group, assignment.participant.participantId);

    res.json({
      success: true,
      groupId: assignment.groupId,
      participantId: assignment.participant.participantId,
      currentRole: assignment.role,
      nextRole,
      group: {
        groupNumber: assignment.group.groupNumber,
        size: assignment.group.size,
        status: assignment.group.status,
        participants: assignment.group.participants.map(p => ({
          name: p.name,
          role: assignment.group.currentRoles[p.participantId],
        })),
      },
    });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join group',
      error: error.message,
    });
  }
};

/**
 * Calculate what the next role will be for a participant
 */
function calculateNextRole(group, participantId) {
  const currentRole = group.currentRoles[participantId];

  if (group.size === 2) {
    // In 2-person group: alternate between interpreter and patient
    return currentRole === 'interpreter' ? 'patient' : 'interpreter';
  } else if (group.size === 3) {
    // In 3-person group: rotate through all three roles
    const roles = ['interpreter', 'patient', 'provider'];
    const currentIndex = roles.indexOf(currentRole);
    const nextIndex = (currentIndex + 1) % 3;
    return roles[nextIndex];
  }

  return 'interpreter'; // Default
}
