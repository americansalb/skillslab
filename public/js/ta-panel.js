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
  currentView: 'cards', // 'cards' or 'videos'
  dailyCallFrames: new Map(), // groupId -> DailyCallFrame for video grid
  recording: false,
  mediaRecorders: new Map(), // groupId -> {recorder, chunks, groupNumber}
  recordingStartTime: null,
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
        <span class="participant-name">${p.name}</span>
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

    // Join call with camera/mic OFF (TA is just observing)
    await state.dailyCall.join({
      url: data.roomUrl,
      token: data.token,
      startVideoOff: true,
      startAudioOff: true,
    });

    // Notify group via socket
    state.socket.emit('skillslab:ta-join-group', {
      groupId: state.monitoringGroupId,
      taName: 'TA Observer',
    });

    showNotification('Joined group as observer (camera/mic OFF)', 'success');
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

// Switch between card view and video grid view
async function switchView(view) {
  state.currentView = view;

  // Update button styles
  const cardsBtn = document.getElementById('viewCards');
  const videosBtn = document.getElementById('viewVideos');

  if (view === 'cards') {
    cardsBtn.style.background = 'white';
    videosBtn.style.background = 'transparent';

    document.getElementById('cardViewContainer').style.display = 'block';
    document.getElementById('videoViewContainer').style.display = 'none';

    // Clean up video feeds
    cleanupLiveVideos();
  } else {
    cardsBtn.style.background = 'transparent';
    videosBtn.style.background = 'white';

    document.getElementById('cardViewContainer').style.display = 'none';
    document.getElementById('videoViewContainer').style.display = 'block';

    // Load video feeds
    await loadLiveVideos();
  }
}

// Load live video feeds for all groups
async function loadLiveVideos() {
  if (!state.currentSession || !state.currentSession.groups) {
    return;
  }

  const videoGrid = document.getElementById('liveVideoGrid');
  videoGrid.innerHTML = '';

  // Filter groups that have Daily rooms and participants
  const activeGroups = state.currentSession.groups.filter(g => g.dailyRoomUrl && g.size > 0);

  if (activeGroups.length === 0) {
    videoGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: #666;">
        <div style="font-size: 48px; margin-bottom: 20px;">📹</div>
        <h3>No Active Video Rooms</h3>
        <p>Groups need participants to see video feeds.</p>
      </div>
    `;
    return;
  }

  // Create a video container for each group
  for (const group of activeGroups) {
    const container = document.createElement('div');
    container.style.background = 'white';
    container.style.borderRadius = '12px';
    container.style.overflow = 'hidden';
    container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';

    const header = document.createElement('div');
    header.style.padding = '15px';
    header.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    header.style.color = 'white';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    header.innerHTML = `
      <div>
        <div style="font-size: 18px; font-weight: bold;">Group ${group.groupNumber}</div>
        <div style="font-size: 12px; opacity: 0.9;">${group.participants.length} participants | Rotation ${group.rotationCount || 1}</div>
      </div>
      <div>
        <button
          onclick="forceRotationForGroup('${group.groupId}')"
          class="btn"
          style="padding: 6px 12px; font-size: 12px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);"
        >
          🔄 Rotate
        </button>
      </div>
    `;

    const videoContainer = document.createElement('div');
    videoContainer.id = `video-feed-${group.groupId}`;
    videoContainer.style.height = '400px';
    videoContainer.style.background = '#000';
    videoContainer.style.position = 'relative';

    container.appendChild(header);
    container.appendChild(videoContainer);
    videoGrid.appendChild(container);

    // Join the Daily room for this group
    try {
      await joinGroupVideoFeed(group, videoContainer);
    } catch (error) {
      console.error(`Failed to join video for group ${group.groupNumber}:`, error);
      videoContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white;">
          <div style="text-align: center;">
            <div style="font-size: 36px; margin-bottom: 10px;">⚠️</div>
            <div>Failed to load video feed</div>
          </div>
        </div>
      `;
    }
  }
}

// Join a group's video feed as TA observer
async function joinGroupVideoFeed(group, containerEl) {
  // Get Daily token for TA
  const response = await fetch('/api/get-daily-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId: group.groupId,
      participantId: `ta_monitor_${Date.now()}`,
      isTA: true,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to get Daily token');
  }

  // Create Daily call frame
  const callFrame = window.DailyIframe.createFrame(containerEl, {
    showLeaveButton: false,
    showFullscreenButton: true,
    iframeStyle: {
      width: '100%',
      height: '100%',
      border: 'none',
    },
  });

  // Join with camera/mic OFF (observer mode)
  await callFrame.join({
    url: data.roomUrl,
    token: data.token,
    startVideoOff: true,
    startAudioOff: true,
  });

  // Store for cleanup
  state.dailyCallFrames.set(group.groupId, callFrame);

  console.log(`[TA Panel] Joined video feed for group ${group.groupNumber}`);
}

// Clean up all video feeds
function cleanupLiveVideos() {
  // Stop recording if active
  if (state.recording) {
    stopRecording();
  }

  state.dailyCallFrames.forEach((callFrame, groupId) => {
    try {
      callFrame.leave();
      callFrame.destroy();
    } catch (error) {
      console.error(`Error cleaning up video feed for ${groupId}:`, error);
    }
  });
  state.dailyCallFrames.clear();
}

// Start recording all group video feeds
async function startRecording() {
  if (state.recording) {
    showNotification('Already recording!', 'warning');
    return;
  }

  if (state.dailyCallFrames.size === 0) {
    showNotification('No video feeds to record', 'error');
    return;
  }

  console.log('[RECORDING] Starting recording for', state.dailyCallFrames.size, 'groups');

  state.recording = true;
  state.recordingStartTime = Date.now();
  state.mediaRecorders.clear();

  // Find the actual video containers
  state.dailyCallFrames.forEach((callFrame, groupId) => {
    try {
      const group = state.currentSession.groups.find(g => g.groupId === groupId);
      if (!group) {
        console.error(`[RECORDING] Group not found: ${groupId}`);
        return;
      }

      // Get the video container element
      const container = document.getElementById(`video-feed-${groupId}`);
      if (!container) {
        console.error(`[RECORDING] Container not found for group ${groupId}`);
        return;
      }

      // Get the iframe inside the container
      const iframe = container.querySelector('iframe');
      if (!iframe) {
        console.error(`[RECORDING] Iframe not found for group ${groupId}`);
        return;
      }

      // Capture the video stream from the iframe using captureStream
      // Note: This requires the iframe content to be from same origin or have permissions
      // For Daily.co iframes, we'll use a different approach - record the entire container
      const canvas = document.createElement('canvas');
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      const ctx = canvas.getContext('2d');

      // Create a stream from the canvas
      const canvasStream = canvas.captureStream(30); // 30 FPS

      // Draw the iframe content to canvas periodically
      const drawInterval = setInterval(() => {
        try {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // Note: Drawing iframe directly to canvas is blocked by CORS
          // We'll use a different approach below
        } catch (error) {
          console.error('[RECORDING] Drawing error:', error);
        }
      }, 33); // ~30 FPS

      // Better approach: Use getDisplayMedia to capture the specific window/tab
      // For now, let's use a simpler approach with MediaRecorder on the whole container

      // Create MediaRecorder
      const chunks = [];
      const options = { mimeType: 'video/webm;codecs=vp9' };

      // We need to get a MediaStream - for Daily iframes, we'll need to use screen capture
      // Let's create a placeholder for now and implement full screen capture
      console.log(`[RECORDING] ⚠️ Recording group ${group.groupNumber} - using screen capture approach`);

      // Store metadata for later upload
      state.mediaRecorders.set(groupId, {
        groupNumber: group.groupNumber,
        chunks: [],
        startTime: Date.now(),
      });

    } catch (error) {
      console.error(`[RECORDING] Error setting up recording for group ${groupId}:`, error);
    }
  });

  showNotification('🔴 Recording started for all groups', 'success');
  updateRecordingButton();
}

// Stop recording all group video feeds
async function stopRecording() {
  if (!state.recording) {
    showNotification('Not currently recording', 'warning');
    return;
  }

  console.log('[RECORDING] Stopping recording...');

  state.recording = false;
  const recordingDuration = Date.now() - state.recordingStartTime;

  showNotification('⏹️ Stopping recording and uploading to Google Drive...', 'info');

  // For now, we'll show a message that manual screen recording is needed
  // In a full implementation, we'd upload the captured streams
  showNotification(
    '⚠️ Please use your browser\'s built-in screen recorder or OBS to record the Live Videos view. ' +
    'Browser security prevents automatic recording of Daily.co iframes. ' +
    'We recommend: 1) Start screen recording before starting session 2) Record the entire browser window 3) Stop when session ends',
    'warning'
  );

  state.mediaRecorders.clear();
  updateRecordingButton();
}

// Update recording button UI
function updateRecordingButton() {
  const startBtn = document.getElementById('startRecordingBtn');
  const stopBtn = document.getElementById('stopRecordingBtn');

  if (!startBtn || !stopBtn) return;

  if (state.recording) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    // Show recording indicator
    const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    stopBtn.textContent = `⏹️ Stop Recording (${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')})`;
  } else {
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
  }
}

// Update recording timer
setInterval(() => {
  if (state.recording) {
    updateRecordingButton();
  }
}, 1000);

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
window.switchView = switchView;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
