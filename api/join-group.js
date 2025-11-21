const sessionManager = require('../utils/session-manager');
const dailyHelper = require('../utils/daily-helper');

/**
 * Student joins a group
 * POST /api/join-group
 */
module.exports = async (req, res) => {
  try {
    const {
      sessionId,
      groupNumber,
      email,
      name,
      studentId,
    } = req.body;

    console.log('='.repeat(80));
    console.log('[JOIN-GROUP] New join request');
    console.log('[JOIN-GROUP] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[JOIN-GROUP] Session ID:', sessionId);
    console.log('[JOIN-GROUP] Group Number:', groupNumber);
    console.log('[JOIN-GROUP] Student:', name, '(' + email + ')');

    if (!sessionId || !groupNumber || !email || !name) {
      console.error('[JOIN-GROUP] ERROR: Missing required fields');
      console.error('[JOIN-GROUP] Received:', { sessionId, groupNumber, email, name });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, groupNumber, email, name',
      });
    }

    // Construct groupId
    const groupId = `${sessionId}_group_${groupNumber}`;
    console.log('[JOIN-GROUP] Constructed group ID:', groupId);

    // Check if session exists
    const session = sessionManager.sessions.get(sessionId);
    if (!session) {
      console.error('[JOIN-GROUP] ERROR: Session not found:', sessionId);
      console.log('[JOIN-GROUP] Available sessions:', Array.from(sessionManager.sessions.keys()));
      return res.status(404).json({
        success: false,
        message: `Session not found: ${sessionId}. Please check the Session ID and try again.`,
      });
    }
    console.log('[JOIN-GROUP] ✓ Session found:', session.name);

    // Check if group exists
    const group = sessionManager.groups.get(groupId);
    if (!group) {
      console.error('[JOIN-GROUP] ERROR: Group not found:', groupId);
      console.log('[JOIN-GROUP] Session groups:', session.groups);
      console.log('[JOIN-GROUP] All groups:', Array.from(sessionManager.groups.keys()));
      return res.status(404).json({
        success: false,
        message: `Group ${groupNumber} not found in this session. Available groups: 1-${session.groups.length}`,
      });
    }
    console.log('[JOIN-GROUP] ✓ Group found: Group', group.groupNumber, '| Current size:', group.size);

    // Join group
    console.log('[JOIN-GROUP] Attempting to join group...');
    const assignment = sessionManager.joinGroup(groupId, {
      email,
      name,
      studentId,
    });
    console.log('[JOIN-GROUP] ✓ Join successful!');
    console.log('[JOIN-GROUP] Participant ID:', assignment.participant.participantId);
    console.log('[JOIN-GROUP] Assigned role:', assignment.role);
    console.log('[JOIN-GROUP] Group size now:', assignment.group.size);

    // Get next role
    const nextRole = calculateNextRole(assignment.group, assignment.participant.participantId);
    console.log('[JOIN-GROUP] Next role will be:', nextRole);

    // Generate Daily.co meeting token
    let dailyToken = null;
    let dailyRoomUrl = null;
    if (assignment.group.dailyRoomName) {
      try {
        console.log('[JOIN-GROUP] Generating Daily.co meeting token...');
        dailyToken = await dailyHelper.createMeetingToken(assignment.group.dailyRoomName, {
          name: assignment.participant.name,
          participantId: assignment.participant.participantId,
          isTA: false,
        });
        dailyRoomUrl = assignment.group.dailyRoomUrl;
        console.log('[JOIN-GROUP] ✓ Daily token generated');
      } catch (dailyError) {
        console.error('[JOIN-GROUP] ✗ Failed to generate Daily token:', dailyError.message);
        // Continue without token - student can still participate without video
      }
    } else {
      console.log('[JOIN-GROUP] No Daily room configured for this group');
    }

    const response = {
      success: true,
      groupId: assignment.groupId,
      participantId: assignment.participant.participantId,
      currentRole: assignment.role,
      nextRole,
      dailyToken,
      dailyRoomUrl,
      group: {
        groupNumber: assignment.group.groupNumber,
        size: assignment.group.size,
        status: assignment.group.status,
        participants: assignment.group.participants.map(p => ({
          name: p.name,
          role: assignment.group.currentRoles[p.participantId],
        })),
      },
    };

    console.log('[JOIN-GROUP] ✓ Response:', JSON.stringify(response, null, 2));
    console.log('='.repeat(80));

    res.json(response);
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[JOIN-GROUP] ✗ ERROR:', error.message);
    console.error('[JOIN-GROUP] Stack trace:', error.stack);
    console.error('='.repeat(80));
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
