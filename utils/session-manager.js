/**
 * Session Manager for Skills Lab
 * Manages groups, roles, time tracking, and rotations
 */

class SessionManager {
  constructor() {
    // Active sessions: sessionId -> session data
    this.sessions = new Map();

    // Active groups: groupId -> group data
    this.groups = new Map();

    // Student assignments: studentId -> { groupId, role, timeAsInterpreter }
    this.studentAssignments = new Map();
  }

  /**
   * Create a new session
   * @param {Object} config - Session configuration
   * @returns {Object} Session object
   */
  createSession(config) {
    const sessionId = this.generateId();

    const session = {
      sessionId,
      name: config.name,
      totalDuration: config.totalDuration || 30 * 60 * 1000, // 30 minutes default
      scriptId: config.scriptId,
      languageMode: config.languageMode || 'same', // 'same' or 'different'
      startedAt: null,
      endedAt: null,
      status: 'preparing', // 'preparing', 'active', 'completed'
      groups: [],
      script: config.script || null,
      audioFiles: config.audioFiles || {},
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Create a group within a session
   * @param {string} sessionId
   * @param {number} groupNumber
   * @returns {Object} Group object
   */
  createGroup(sessionId, groupNumber) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const groupId = `${sessionId}_group_${groupNumber}`;

    const group = {
      groupId,
      sessionId,
      groupNumber,
      languageMode: 'same', // 'same' or 'different' - can be changed per group
      dailyRoomName: null, // Will be set when Daily room is created
      dailyRoomUrl: null,
      participants: [], // Array of participant objects
      currentRoles: {}, // participantId -> role
      timeTracking: {}, // participantId -> { totalTimeAsInterpreter, lastSwitchTime }
      size: 0, // Current number of participants (2 or 3)
      status: 'waiting', // 'waiting', 'active', 'switching', 'completed'
      rotationCount: 0,
      recordingId: null,
      createdAt: Date.now(),
    };

    this.groups.set(groupId, group);
    session.groups.push(groupId);

    return group;
  }

  /**
   * Add a student to a group
   * @param {string} groupId
   * @param {Object} student - Student info (email, name, studentId)
   * @returns {Object} Assignment with role
   */
  joinGroup(groupId, student) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('Group not found');

    // Check if already in group
    const existing = group.participants.find(p => p.email === student.email);
    if (existing) {
      return {
        groupId,
        role: group.currentRoles[existing.participantId],
        participant: existing,
      };
    }

    // Check group capacity
    if (group.participants.length >= 3) {
      throw new Error('Group is full');
    }

    const participantId = this.generateId();

    const participant = {
      participantId,
      email: student.email,
      name: student.name,
      studentId: student.studentId,
      socketId: null,
      dailySessionId: null,
      joinedAt: Date.now(),
    };

    group.participants.push(participant);
    group.size = group.participants.length;

    // Assign role
    const role = this.assignRole(group, participantId);
    group.currentRoles[participantId] = role;

    // Initialize time tracking
    group.timeTracking[participantId] = {
      totalTimeAsInterpreter: 0,
      lastSwitchTime: null,
      targetTime: null, // Will be calculated when session starts
    };

    // Track assignment
    this.studentAssignments.set(student.email, {
      groupId,
      participantId,
      role,
    });

    return {
      groupId,
      role,
      participant,
      group,
    };
  }

  /**
   * Assign a role to a participant
   * @param {Object} group
   * @param {string} participantId
   * @returns {string} Role ('interpreter', 'patient', 'provider')
   */
  assignRole(group, participantId) {
    const currentRoles = Object.values(group.currentRoles);
    const availableRoles = ['interpreter', 'patient', 'provider'];

    // Remove already assigned roles
    const unassigned = availableRoles.filter(role => !currentRoles.includes(role));

    // If group size is 2, one person will be interpreter, one will be patient
    // Provider role is auto-played audio in 2-person groups
    if (group.size === 1) {
      // First person - randomly choose between interpreter and patient
      return Math.random() < 0.5 ? 'interpreter' : 'patient';
    } else if (group.size === 2) {
      // Second person - assign remaining role
      return unassigned[0];
    } else {
      // Third person - assign remaining role
      return unassigned[0];
    }
  }

  /**
   * Start a session
   * @param {string} sessionId
   */
  startSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'active';
    session.startedAt = Date.now();

    // Calculate target times for each group
    session.groups.forEach(groupId => {
      const group = this.groups.get(groupId);
      if (!group) return;

      group.status = 'active';
      const targetTimePerPerson = session.totalDuration / group.size;

      // Set target time for each participant
      group.participants.forEach(p => {
        group.timeTracking[p.participantId].targetTime = targetTimePerPerson;

        // If they're currently the interpreter, mark the start time
        if (group.currentRoles[p.participantId] === 'interpreter') {
          group.timeTracking[p.participantId].lastSwitchTime = Date.now();
        }
      });
    });
  }

  /**
   * Calculate who should be interpreter next
   * @param {Object} group
   * @returns {string} participantId who should interpret next
   */
  calculateNextInterpreter(group) {
    const now = Date.now();

    // Update current interpreter's time
    const currentInterpreter = Object.entries(group.currentRoles)
      .find(([pid, role]) => role === 'interpreter');

    if (currentInterpreter) {
      const [pid] = currentInterpreter;
      const tracking = group.timeTracking[pid];
      if (tracking.lastSwitchTime) {
        const additionalTime = now - tracking.lastSwitchTime;
        tracking.totalTimeAsInterpreter += additionalTime;
      }
    }

    // Find participant with least interpreter time
    let nextInterpreter = null;
    let minTime = Infinity;

    group.participants.forEach(p => {
      const tracking = group.timeTracking[p.participantId];
      if (tracking.totalTimeAsInterpreter < minTime) {
        minTime = tracking.totalTimeAsInterpreter;
        nextInterpreter = p.participantId;
      }
    });

    return nextInterpreter;
  }

  /**
   * Rotate roles in a group
   * @param {string} groupId
   * @returns {Object} New role assignments
   */
  rotateRoles(groupId) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('Group not found');

    group.status = 'switching';

    const nextInterpreter = this.calculateNextInterpreter(group);

    // Get remaining roles
    const remainingParticipants = group.participants
      .filter(p => p.participantId !== nextInterpreter)
      .map(p => p.participantId);

    // Build new role assignment
    const newRoles = {
      [nextInterpreter]: 'interpreter',
    };

    // Assign patient and provider to remaining participants
    if (group.size === 2) {
      // 2-person group: one is interpreter, one is patient
      newRoles[remainingParticipants[0]] = 'patient';
    } else if (group.size === 3) {
      // 3-person group: distribute patient and provider
      // Try to rotate so people don't have same role twice in a row
      const [p1, p2] = remainingParticipants;
      const p1PrevRole = group.currentRoles[p1];

      if (p1PrevRole === 'patient') {
        newRoles[p1] = 'provider';
        newRoles[p2] = 'patient';
      } else {
        newRoles[p1] = 'patient';
        newRoles[p2] = 'provider';
      }
    }

    group.currentRoles = newRoles;
    group.rotationCount++;

    // Mark switch time for new interpreter
    group.timeTracking[nextInterpreter].lastSwitchTime = Date.now();

    return {
      groupId,
      newRoles,
      rotationCount: group.rotationCount,
    };
  }

  /**
   * Handle participant leaving
   * @param {string} email
   * @returns {Object} Updated group state
   */
  handleParticipantLeave(email) {
    const assignment = this.studentAssignments.get(email);
    if (!assignment) return null;

    const group = this.groups.get(assignment.groupId);
    if (!group) return null;

    // Remove participant
    group.participants = group.participants.filter(p => p.email !== email);
    group.size = group.participants.length;

    // Remove from role assignments and time tracking
    delete group.currentRoles[assignment.participantId];
    delete group.timeTracking[assignment.participantId];

    // Recalculate target times for remaining participants
    const session = this.sessions.get(group.sessionId);
    if (session && session.startedAt) {
      const elapsedTime = Date.now() - session.startedAt;
      const remainingTime = session.totalDuration - elapsedTime;
      const targetTimePerPerson = remainingTime / group.size;

      group.participants.forEach(p => {
        group.timeTracking[p.participantId].targetTime = targetTimePerPerson;
      });
    }

    // If current interpreter left, rotate immediately
    const currentInterpreter = Object.entries(group.currentRoles)
      .find(([pid, role]) => role === 'interpreter');

    if (!currentInterpreter) {
      // Need to assign new interpreter
      if (group.size > 0) {
        this.rotateRoles(group.groupId);
      }
    }

    this.studentAssignments.delete(email);

    return {
      groupId: group.groupId,
      group,
      requiresRotation: !currentInterpreter,
    };
  }

  /**
   * Move participant to different group
   * @param {string} email
   * @param {string} targetGroupId
   */
  moveParticipant(email, targetGroupId) {
    // Remove from current group
    this.handleParticipantLeave(email);

    // Get student info and join new group
    const targetGroup = this.groups.get(targetGroupId);
    if (!targetGroup) throw new Error('Target group not found');

    // Note: This is simplified - in real implementation,
    // you'd need to reconstruct student object
    // For now, throw error if trying to move
    throw new Error('Participant move not yet implemented - reconstruct student object needed');
  }

  /**
   * Get group state
   * @param {string} groupId
   * @returns {Object} Group state
   */
  getGroupState(groupId) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('Group not found');

    const session = this.sessions.get(group.sessionId);

    return {
      group,
      session: session ? {
        sessionId: session.sessionId,
        name: session.name,
        totalDuration: session.totalDuration,
        status: session.status,
        languageMode: session.languageMode,
        script: session.script,
        audioFiles: session.audioFiles,
      } : null,
    };
  }

  /**
   * Get all groups in a session
   * @param {string} sessionId
   * @returns {Array} Groups
   */
  getSessionGroups(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return session.groups.map(groupId => {
      const group = this.groups.get(groupId);
      return group;
    }).filter(Boolean);
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Mark group as ready after role switch
   * @param {string} groupId
   * @param {string} participantId
   * @returns {boolean} All participants ready
   */
  markParticipantReady(groupId, participantId) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('Group not found');

    if (!group.readyChecks) {
      group.readyChecks = new Set();
    }

    group.readyChecks.add(participantId);

    // Check if all participants are ready
    const allReady = group.readyChecks.size === group.size;

    if (allReady) {
      // Resume active state
      group.status = 'active';
      group.readyChecks = new Set();

      // Record switch completion time for time tracking
      const now = Date.now();
      const switchDuration = now - group.switchStartTime;

      // Distribute switch time proportionally
      this.distributeTransitionTime(group, switchDuration);

      // Mark interpreter start time
      const currentInterpreter = Object.entries(group.currentRoles)
        .find(([pid, role]) => role === 'interpreter');

      if (currentInterpreter) {
        const [pid] = currentInterpreter;
        group.timeTracking[pid].lastSwitchTime = now;
      }
    }

    return allReady;
  }

  /**
   * Distribute transition time proportionally among participants who haven't met threshold
   * @param {Object} group
   * @param {number} transitionDuration - Duration in ms
   */
  distributeTransitionTime(group, transitionDuration) {
    // Find participants who haven't reached their target time yet
    const needMoreTime = [];

    group.participants.forEach(p => {
      const tracking = group.timeTracking[p.participantId];
      if (tracking.totalTimeAsInterpreter < tracking.targetTime) {
        needMoreTime.push({
          participantId: p.participantId,
          deficit: tracking.targetTime - tracking.totalTimeAsInterpreter,
        });
      }
    });

    if (needMoreTime.length === 0) return;

    // Calculate total deficit
    const totalDeficit = needMoreTime.reduce((sum, p) => sum + p.deficit, 0);

    // Distribute transition time proportionally
    needMoreTime.forEach(({ participantId, deficit }) => {
      const proportion = deficit / totalDeficit;
      const deduction = transitionDuration * proportion;

      group.timeTracking[participantId].targetTime -= deduction;
    });
  }

  /**
   * Check if rotation is needed
   * @param {string} groupId
   * @returns {boolean} Should rotate
   */
  shouldRotate(groupId) {
    const group = this.groups.get(groupId);
    if (!group || group.status !== 'active') return false;

    const session = this.sessions.get(group.sessionId);
    if (!session || session.status !== 'active') return false;

    const currentInterpreter = Object.entries(group.currentRoles)
      .find(([pid, role]) => role === 'interpreter');

    if (!currentInterpreter) return true;

    const [pid] = currentInterpreter;
    const tracking = group.timeTracking[pid];

    if (!tracking.lastSwitchTime) return false;

    const currentTime = Date.now() - tracking.lastSwitchTime;
    const totalTime = tracking.totalTimeAsInterpreter + currentTime;

    // Rotate if exceeded target time
    return totalTime >= tracking.targetTime;
  }

  /**
   * End a session
   * @param {string} sessionId
   * @returns {Object} Session
   */
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'completed';
    session.endedAt = Date.now();

    // Mark all groups as completed
    session.groups.forEach(groupId => {
      const group = this.groups.get(groupId);
      if (group) {
        group.status = 'completed';
      }
    });

    return session;
  }

  /**
   * Update group settings
   * @param {string} groupId
   * @param {Object} settings - Settings to update
   * @returns {Object} Updated group
   */
  updateGroupSettings(groupId, settings) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('Group not found');

    // Update language mode if provided
    if (settings.languageMode) {
      group.languageMode = settings.languageMode;
    }

    return group;
  }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;
