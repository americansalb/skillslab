/**
 * TA Control Panel JavaScript
 */

// Global state
const state = {
  socket: null,
  currentSession: null,
  sessions: [],
  monitoringGroupId: null,
  dailyCall: null,
  refreshInterval: null,
};

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadAllSessions();
  startAutoRefresh();
});

// Initialize Socket.io
function initSocket() {
  state.socket = io();

  // Listen for group updates
  state.socket.on('skillslab:groups-updated', () => {
    console.log('Groups updated, refreshing...');
    loadAllSessions();
  });

  // Listen for participant events
  state.socket.on('skillslab:participant-joined', (data) => {
    console.log('Participant joined:', data);
    loadAllSessions();
  });

  state.socket.on('skillslab:participant-disconnected', (data) => {
    console.log('Participant disconnected:', data);
    loadAllSessions();
  });

  state.socket.on('skillslab:role-rotation', (data) => {
    console.log('Role rotation occurred:', data);
    showNotification('Role rotation occurred in a group', 'info');
    loadAllSessions();
  });

  console.log('Socket.io initialized');
}

// Load all active sessions
async function loadAllSessions() {
  try {
    const response = await fetch('/api/get-all-sessions');
    const data = await response.json();

    if (!data.success) {
      console.error('Failed to load sessions');
      return;
    }

    state.sessions = data.sessions;

    // If we have at least one session, show it
    if (state.sessions.length > 0) {
      if (!state.currentSession) {
        state.currentSession = state.sessions[0];
      } else {
        // Update current session
        state.currentSession = state.sessions.find(s => s.sessionId === state.currentSession.sessionId) || state.sessions[0];
      }
      displaySession(state.currentSession);
    } else {
      showEmptyState();
    }
  } catch (error) {
    console.error('Load sessions error:', error);
    showNotification('Failed to load sessions', 'error');
  }
}

// Display a session
function displaySession(session) {
  state.currentSession = session;

  console.log('[TA Panel] Displaying session:', session.sessionId);
  console.log('[TA Panel] Session details:', session);

  // Hide empty state
  document.getElementById('emptyState').style.display = 'none';

  // Show session info
  const sessionInfoEl = document.getElementById('sessionInfo');
  sessionInfoEl.style.display = 'block';

  document.getElementById('sessionName').textContent = session.name;
  document.getElementById('sessionDetails').textContent =
    `Status: ${session.status.toUpperCase()} | Language Mode: ${session.languageMode}`;

  // Display Session ID prominently
  document.getElementById('sessionIdDisplay').textContent = session.sessionId;

  // Update stats
  const totalParticipants = session.groups.reduce((sum, g) => sum + g.size, 0);
  document.getElementById('statGroups').textContent = session.groups.length;
  document.getElementById('statParticipants').textContent = totalParticipants;
  document.getElementById('statDuration').textContent = Math.floor(session.totalDuration / 60000);

  // Calculate elapsed time if session is active
  if (session.startedAt) {
    const elapsed = Date.now() - new Date(session.startedAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('statElapsed').textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    document.getElementById('statElapsed').textContent = '00:00';
  }

  // Show/hide start/end buttons
  const sessionActions = document.getElementById('sessionActions');
  sessionActions.style.display = 'flex';

  const startBtn = document.getElementById('startSessionBtn');
  const endBtn = document.getElementById('endSessionBtn');

  if (session.status === 'active') {
    startBtn.style.display = 'none';
    if (endBtn) endBtn.style.display = 'inline-block';
  } else if (session.status === 'completed') {
    startBtn.style.display = 'none';
    if (endBtn) endBtn.style.display = 'none';
  } else {
    startBtn.style.display = 'inline-block';
    if (endBtn) endBtn.style.display = 'none';
  }

  // Display groups
  displayGroups(session.groups);
}

// Display groups in grid
function displayGroups(groups) {
  const gridEl = document.getElementById('groupsGrid');
  gridEl.innerHTML = '';

  if (groups.length === 0) {
    gridEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">No groups in this session</div></div>';
    return;
  }

  groups.forEach(group => {
    const card = createGroupCard(group);
    gridEl.appendChild(card);
  });
}

// Create a group card element
function createGroupCard(group) {
  const card = document.createElement('div');
  card.className = 'group-card';
  card.onclick = () => monitorGroup(group.groupId);

  // Status badge
  let statusClass = 'status-waiting';
  let statusText = 'Waiting';
  if (group.status === 'active') {
    statusClass = 'status-active';
    statusText = 'Active';
  } else if (group.status === 'switching') {
    statusClass = 'status-switching';
    statusText = 'Switching Roles';
  }

  // Build participants list
  let participantsHTML = '';
  if (group.participants.length === 0) {
    participantsHTML = '<div style="text-align: center; color: #999; padding: 20px;">No participants yet</div>';
  } else {
    participantsHTML = group.participants.map(p => `
      <div class="participant-item">
        <span class="participant-name">${p.name}</span>
        <span class="role-badge role-${p.role}">${formatRole(p.role)}</span>
      </div>
    `).join('');
  }

  card.innerHTML = `
    <div class="group-card-header">
      <div class="group-number">Group ${group.groupNumber}</div>
      <div class="group-status ${statusClass}">${statusText}</div>
    </div>

    <div style="font-size: 14px; color: #666; margin-bottom: 10px;">
      <strong>${group.size}</strong> participants |
      <strong>Rotation ${group.rotationCount || 1}</strong>
    </div>

    <div style="margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.6); border-radius: 6px;" onclick="event.stopPropagation();">
      <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Language Mode:</label>
      <select
        onchange="updateGroupLanguageMode('${group.groupId}', this.value)"
        style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ddd; font-size: 13px;"
      >
        <option value="same" ${group.languageMode === 'same' ? 'selected' : ''}>Same Language</option>
        <option value="different" ${group.languageMode === 'different' ? 'selected' : ''}>Different Language</option>
      </select>
    </div>

    <div class="participants-list">
      ${participantsHTML}
    </div>

    <div class="group-actions">
      <button class="btn btn-primary" onclick="event.stopPropagation(); monitorGroup('${group.groupId}')">
        👁️ Monitor
      </button>
      <button class="btn btn-secondary" onclick="event.stopPropagation(); forceRotationForGroup('${group.groupId}')">
        🔄 Rotate
      </button>
    </div>
  `;

  return card;
}

// Format role name
function formatRole(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Show empty state
function showEmptyState() {
  document.getElementById('sessionInfo').style.display = 'none';
  document.getElementById('groupsGrid').innerHTML = '';
  document.getElementById('emptyState').style.display = 'block';
}

// Show create session modal
function showCreateSessionModal() {
  document.getElementById('createSessionModal').style.display = 'flex';
}

// Close create session modal
function closeCreateSessionModal() {
  document.getElementById('createSessionModal').style.display = 'none';
  document.getElementById('createSessionForm').reset();
}

// Handle create session form submission
document.getElementById('createSessionForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('sessionNameInput').value;
  const totalDuration = parseInt(document.getElementById('totalDurationInput').value);
  const numberOfGroups = parseInt(document.getElementById('numberOfGroupsInput').value);

  try {
    const response = await fetch('/api/create-skillslab-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        totalDuration,
        numberOfGroups,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification(data.message || 'Failed to create session', 'error');
      return;
    }

    showNotification('Session created successfully!', 'success');
    closeCreateSessionModal();

    // Reload sessions
    await loadAllSessions();
  } catch (error) {
    console.error('Create session error:', error);
    showNotification('Failed to create session', 'error');
  }
});

// Start the current session
async function startSession() {
  if (!state.currentSession) {
    showNotification('No session selected', 'error');
    return;
  }

  try {
    const response = await fetch('/api/start-skillslab-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.currentSession.sessionId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification(data.message || 'Failed to start session', 'error');
      return;
    }

    showNotification('Session started!', 'success');
    await loadAllSessions();
  } catch (error) {
    console.error('Start session error:', error);
    showNotification('Failed to start session', 'error');
  }
}

// Monitor a specific group
async function monitorGroup(groupId) {
  state.monitoringGroupId = groupId;

  // Find the group
  const group = state.currentSession?.groups.find(g => g.groupId === groupId);
  if (!group) {
    showNotification('Group not found', 'error');
    return;
  }

  // Show modal
  document.getElementById('monitorGroupModal').style.display = 'flex';
  document.getElementById('monitorGroupName').textContent = `Group ${group.groupNumber}`;

  // Display participants
  const participantsList = document.getElementById('monitorParticipantsList');
  if (group.participants.length === 0) {
    participantsList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No participants yet</div>';
  } else {
    participantsList.innerHTML = group.participants.map(p => `
      <div class="participant-item">
        <span class="participant-name">${p.name} (${p.email})</span>
        <span class="role-badge role-${p.role}">${formatRole(p.role)}</span>
      </div>
    `).join('');
  }

  // If group has a Daily room, show preview
  if (group.dailyRoomUrl) {
    // We'll create a call frame but won't join yet (just preview)
    const videoContainer = document.getElementById('monitorVideoContainer');
    videoContainer.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Click "Join with Audio/Video" to monitor this group</p>';
  }
}

// Close monitor modal
function closeMonitorModal() {
  document.getElementById('monitorGroupModal').style.display = 'none';

  // Clean up Daily call if exists
  if (state.dailyCall) {
    state.dailyCall.leave();
    state.dailyCall.destroy();
    state.dailyCall = null;
  }

  state.monitoringGroupId = null;
}

// Join group as TA with audio/video
async function joinGroupAsTA() {
  if (!state.monitoringGroupId) {
    showNotification('No group selected', 'error');
    return;
  }

  try {
    // Get Daily token for TA
    const response = await fetch('/api/get-daily-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: state.monitoringGroupId,
        participantId: 'ta_' + Date.now(),
        isTA: true,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification('Failed to get access token', 'error');
      return;
    }

    // Create Daily call frame
    const videoContainer = document.getElementById('monitorVideoContainer');
    videoContainer.innerHTML = '';

    state.dailyCall = window.DailyIframe.createFrame(videoContainer, {
      showLeaveButton: true,
      showFullscreenButton: true,
      iframeStyle: {
        width: '100%',
        height: '500px',
        border: 'none',
        borderRadius: '12px',
      },
    });

    // Join call
    await state.dailyCall.join({
      url: data.roomUrl,
      token: data.token,
    });

    // Notify group via socket
    state.socket.emit('skillslab:ta-join-group', {
      groupId: state.monitoringGroupId,
      taName: 'TA Observer',
    });

    showNotification('Joined group successfully!', 'success');
  } catch (error) {
    console.error('Join group error:', error);
    showNotification('Failed to join group', 'error');
  }
}

// Force rotation for a specific group
async function forceRotationForGroup(groupId) {
  if (!confirm('Are you sure you want to force a role rotation for this group?')) {
    return;
  }

  try {
    const response = await fetch('/api/rotate-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification(data.message || 'Failed to rotate roles', 'error');
      return;
    }

    showNotification('Role rotation triggered!', 'success');

    // Notify via socket
    state.socket.emit('skillslab:ta-force-rotation', { groupId });

    await loadAllSessions();
  } catch (error) {
    console.error('Force rotation error:', error);
    showNotification('Failed to rotate roles', 'error');
  }
}

// Force rotation for currently monitoring group
function forceRotation() {
  if (!state.monitoringGroupId) {
    showNotification('No group selected', 'error');
    return;
  }

  forceRotationForGroup(state.monitoringGroupId);
}

// Refresh groups manually
function refreshGroups() {
  loadAllSessions();
  showNotification('Refreshed!', 'info');
}

// Start auto-refresh every 5 seconds
function startAutoRefresh() {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
  }

  state.refreshInterval = setInterval(() => {
    // Only auto-refresh if not in a modal
    if (document.getElementById('monitorGroupModal').style.display !== 'flex') {
      loadAllSessions();
    }
  }, 5000);
}

// Show notification
function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// End the current session
async function endSession() {
  if (!state.currentSession) {
    showNotification('No session selected', 'error');
    return;
  }

  if (!confirm('Are you sure you want to end this session? All groups will be stopped.')) {
    return;
  }

  try {
    const response = await fetch('/api/end-skillslab-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.currentSession.sessionId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification(data.message || 'Failed to end session', 'error');
      return;
    }

    showNotification('Session ended successfully!', 'success');
    await loadAllSessions();
  } catch (error) {
    console.error('End session error:', error);
    showNotification('Failed to end session', 'error');
  }
}

// Update group language mode
async function updateGroupLanguageMode(groupId, languageMode) {
  try {
    const response = await fetch('/api/update-group-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        languageMode,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showNotification(data.message || 'Failed to update language mode', 'error');
      return;
    }

    showNotification(`Language mode updated to "${languageMode}"`, 'success');
    await loadAllSessions();
  } catch (error) {
    console.error('Update language mode error:', error);
    showNotification('Failed to update language mode', 'error');
  }
}

// Copy session ID to clipboard
function copySessionId() {
  const sessionId = state.currentSession?.sessionId;
  if (!sessionId) {
    showNotification('No session ID to copy', 'error');
    return;
  }

  navigator.clipboard.writeText(sessionId).then(() => {
    showNotification('Session ID copied to clipboard!', 'success');
    console.log('[TA Panel] Copied session ID:', sessionId);
  }).catch(err => {
    console.error('[TA Panel] Failed to copy session ID:', err);
    showNotification('Failed to copy session ID', 'error');
  });
}

// Make functions globally available
window.showCreateSessionModal = showCreateSessionModal;
window.closeCreateSessionModal = closeCreateSessionModal;
window.startSession = startSession;
window.endSession = endSession;
window.refreshGroups = refreshGroups;
window.monitorGroup = monitorGroup;
window.closeMonitorModal = closeMonitorModal;
window.joinGroupAsTA = joinGroupAsTA;
window.forceRotation = forceRotation;
window.forceRotationForGroup = forceRotationForGroup;
window.updateGroupLanguageMode = updateGroupLanguageMode;
window.copySessionId = copySessionId;
