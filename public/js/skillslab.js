/**
 * Skills Lab Frontend Application
 */

// Global state
const state = {
  socket: null,
  dailyCall: null,
  sessionId: null,
  groupId: null,
  groupNumber: null,
  participantId: null,
  currentRole: null,
  nextRole: null,
  group: null,
  session: null,
  timeAsInterpreter: 0,
  targetTime: 0,
  intervalTimer: null,
};

// Initialize socket connection
function initSocket() {
  state.socket = io();

  // Participant joined
  state.socket.on('skillslab:participant-joined', (data) => {
    console.log('Participant joined:', data);
    updateGroupMembers(data.participants);
  });

  // Role rotation triggered
  state.socket.on('skillslab:role-rotation', (data) => {
    console.log('Role rotation:', data);
    handleRoleRotation(data);
  });

  // Ready status update
  state.socket.on('skillslab:ready-status', (data) => {
    console.log('Ready status:', data);
    updateReadyStatus(data);
  });

  // Session resumed
  state.socket.on('skillslab:session-resumed', (data) => {
    console.log('Session resumed:', data);
    hideRotationAlert();
    updateInterface();
  });

  // Line played by another participant
  state.socket.on('skillslab:line-played', (data) => {
    console.log('Line played:', data);
    // Could highlight the line or show indicator
  });

  // TA joined
  state.socket.on('skillslab:ta-joined', (data) => {
    console.log('TA joined:', data);
    showNotification(`${data.taName} is now observing`);
  });

  // Participant disconnected
  state.socket.on('skillslab:participant-disconnected', (data) => {
    console.log('Participant disconnected:', data);
    showNotification(`A participant disconnected`);
  });

  // Error
  state.socket.on('error', (data) => {
    console.error('Socket error:', data);
    showNotification(data.message, 'error');
  });
}

// Join group form submission
document.getElementById('joinGroupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('studentName').value;
  const email = document.getElementById('studentEmail').value;
  const studentId = document.getElementById('studentId').value || '';
  const sessionId = document.getElementById('sessionId').value;
  const groupNumber = parseInt(document.getElementById('groupNumber').value);

  try {
    const response = await fetch('/api/join-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        groupNumber,
        email,
        name,
        studentId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      document.getElementById('joinError').textContent = data.message || 'Failed to join group';
      document.getElementById('joinError').style.display = 'block';
      return;
    }

    // Store state
    state.sessionId = sessionId;
    state.groupId = data.groupId;
    state.groupNumber = groupNumber;
    state.participantId = data.participantId;
    state.currentRole = data.currentRole;
    state.nextRole = data.nextRole;
    state.group = data.group;

    // Initialize socket
    initSocket();

    // Join socket room
    state.socket.emit('skillslab:join-group', {
      groupId: data.groupId,
      participantId: data.participantId,
      role: data.currentRole,
    });

    // Create Daily room if needed
    await createDailyRoom();

    // Show waiting page
    showWaitingPage();

    // Start checking for session start
    checkSessionStatus();
  } catch (error) {
    console.error('Join group error:', error);
    document.getElementById('joinError').textContent = 'Failed to join group';
    document.getElementById('joinError').style.display = 'block';
  }
});

// Create or get Daily room for the group
async function createDailyRoom() {
  try {
    const response = await fetch('/api/create-daily-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: state.groupId }),
    });

    const data = await response.json();
    if (data.success) {
      console.log('Daily room created:', data.roomUrl);
    }
  } catch (error) {
    console.error('Failed to create Daily room:', error);
  }
}

// Show waiting page
function showWaitingPage() {
  document.getElementById('pageJoinGroup').style.display = 'none';
  document.getElementById('pageWaiting').style.display = 'block';

  document.getElementById('displayGroupNumber').textContent = state.groupNumber;
  document.getElementById('currentRoleBadge').textContent = formatRole(state.currentRole);
  document.getElementById('currentRoleBadge').className = `role-badge role-${state.currentRole}`;

  document.getElementById('nextRoleBadge').textContent = formatRole(state.nextRole);
  document.getElementById('nextRoleBadge').className = `role-badge role-${state.nextRole}`;

  updateGroupMembers(state.group.participants);
}

// Update group members list
function updateGroupMembers(participants) {
  const membersList = document.getElementById('groupMembersList');
  if (!membersList) return;

  membersList.innerHTML = participants.map(p => `
    <div style="padding: 10px; margin: 5px 0; background: white; border-radius: 6px;">
      <strong>${p.name}</strong>
      <span class="role-badge role-${p.role}" style="margin-left: 10px;">${formatRole(p.role)}</span>
    </div>
  `).join('');
}

// Format role name
function formatRole(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Check if session has started
async function checkSessionStatus() {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/get-group-state?groupId=${state.groupId}`);
      const data = await response.json();

      if (data.success && data.session && data.session.status === 'active') {
        clearInterval(interval);
        startSession(data);
      }
    } catch (error) {
      console.error('Status check error:', error);
    }
  }, 2000);
}

// Start active session
async function startSession(data) {
  state.session = data.session;
  state.group = data.group;

  // Get target time
  const participant = data.group.participants.find(p => p.participantId === state.participantId);
  if (participant) {
    state.targetTime = participant.targetTime;
  }

  // Show active session page
  document.getElementById('pageWaiting').style.display = 'none';
  document.getElementById('pageActiveSession').style.display = 'block';

  // Update UI
  document.getElementById('activeGroupNumber').textContent = state.groupNumber;
  document.getElementById('rotationCount').textContent = data.group.rotationCount || 1;
  document.getElementById('activeRoleBadge').textContent = formatRole(state.currentRole);
  document.getElementById('activeRoleBadge').className = `role-badge role-${state.currentRole}`;

  updateTargetTime();
  updateInterface();

  // Join Daily call
  await joinDailyCall();

  // Start time tracking
  startTimeTracking();
}

// Join Daily.co call
async function joinDailyCall() {
  try {
    // Get meeting token
    const response = await fetch('/api/get-daily-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: state.groupId,
        participantId: state.participantId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      console.error('Failed to get Daily token');
      return;
    }

    // Create Daily call frame
    state.dailyCall = window.DailyIframe.createFrame({
      showLeaveButton: false,
      showFullscreenButton: true,
    });

    // Join call
    await state.dailyCall.join({
      url: data.roomUrl,
      token: data.token,
    });

    console.log('Joined Daily call');

    // Listen for participant events
    state.dailyCall.on('participant-joined', handleParticipantJoined);
    state.dailyCall.on('participant-left', handleParticipantLeft);

    // Render video grid
    renderVideoGrid();
  } catch (error) {
    console.error('Failed to join Daily call:', error);
  }
}

// Handle Daily participant joined
function handleParticipantJoined(event) {
  console.log('Daily participant joined:', event);
  renderVideoGrid();
}

// Handle Daily participant left
function handleParticipantLeft(event) {
  console.log('Daily participant left:', event);
  renderVideoGrid();
}

// Render video grid
function renderVideoGrid() {
  if (!state.dailyCall) return;

  const participants = state.dailyCall.participants();
  const videoGrid = document.getElementById('videoGrid');

  videoGrid.innerHTML = '';

  Object.entries(participants).forEach(([id, participant]) => {
    const videoCard = document.createElement('div');
    videoCard.className = 'video-card';
    videoCard.id = `video-${id}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    // Set video track
    if (participant.tracks.video?.persistentTrack) {
      video.srcObject = new MediaStream([participant.tracks.video.persistentTrack]);
    }

    const footer = document.createElement('div');
    footer.className = 'video-card-footer';

    const name = document.createElement('div');
    name.className = 'participant-name';
    name.textContent = participant.user_name || 'Participant';

    // Find role for this participant
    const groupParticipant = state.group?.participants?.find(
      p => p.name === participant.user_name
    );

    if (groupParticipant) {
      const roleBadge = document.createElement('div');
      roleBadge.className = `role-badge role-${state.group.currentRoles?.[groupParticipant.participantId] || 'unknown'}`;
      roleBadge.textContent = formatRole(state.group.currentRoles?.[groupParticipant.participantId] || 'Unknown');
      roleBadge.style.marginTop = '5px';
      footer.appendChild(name);
      footer.appendChild(roleBadge);
    } else {
      footer.appendChild(name);
    }

    videoCard.appendChild(video);
    videoCard.appendChild(footer);
    videoGrid.appendChild(videoCard);
  });
}

// Update interface based on current role
function updateInterface() {
  // Hide all interfaces
  document.getElementById('interpreterInterface').style.display = 'none';
  document.getElementById('patientInterface').style.display = 'none';
  document.getElementById('providerInterface').style.display = 'none';

  // Show interface for current role
  if (state.currentRole === 'interpreter') {
    document.getElementById('interpreterInterface').style.display = 'block';
  } else if (state.currentRole === 'patient') {
    document.getElementById('patientInterface').style.display = 'block';
    renderScript('patient');
  } else if (state.currentRole === 'provider') {
    document.getElementById('providerInterface').style.display = 'block';
    renderScript('provider');
  }
}

// Render script lines for patient/provider
function renderScript(role) {
  if (!state.session || !state.session.script) {
    return;
  }

  const container = document.getElementById(`${role}ScriptLines`);
  const lines = state.session.script[role] || [];

  container.innerHTML = lines.map((line, index) => `
    <div class="script-line">
      <div style="font-size: 16px; line-height: 1.6;">${line.text}</div>
      ${line.audioUrl ? `
        <button class="audio-player-btn" onclick="playLine('${role}', ${index})">
          🔊 Play Line
        </button>
      ` : ''}
    </div>
  `).join('');
}

// Play audio line
function playLine(role, lineNumber) {
  if (!state.session || !state.session.audioFiles) return;

  const audioUrl = state.session.audioFiles[role]?.[lineNumber];
  if (!audioUrl) return;

  // Play audio
  const audio = new Audio(audioUrl);
  audio.play();

  // Notify group
  state.socket.emit('skillslab:play-line', {
    groupId: state.groupId,
    participantId: state.participantId,
    lineNumber,
    role,
  });
}

// Handle role rotation
function handleRoleRotation(data) {
  // Get new role
  const newRole = data.newRoles[state.participantId];

  if (!newRole) {
    console.error('No role assigned in rotation');
    return;
  }

  // Update state
  state.currentRole = newRole;

  // Show rotation alert
  showRotationAlert(newRole, data);
}

// Show rotation alert
function showRotationAlert(newRole, data) {
  document.getElementById('rotationAlert').style.display = 'flex';

  document.getElementById('newRoleBadge').textContent = formatRole(newRole);
  document.getElementById('newRoleBadge').className = `role-badge role-${newRole}`;

  // Update active role badge
  document.getElementById('activeRoleBadge').textContent = formatRole(newRole);
  document.getElementById('activeRoleBadge').className = `role-badge role-${newRole}`;

  // Update rotation count
  document.getElementById('rotationCount').textContent = data.rotationCount || 1;
}

// Hide rotation alert
function hideRotationAlert() {
  document.getElementById('rotationAlert').style.display = 'none';
}

// Mark ready after role switch
function markReady() {
  state.socket.emit('skillslab:mark-ready', {
    groupId: state.groupId,
    participantId: state.participantId,
  });

  // Disable button
  const btn = document.querySelector('.ready-btn');
  btn.disabled = true;
  btn.textContent = 'Waiting for others...';
}

// Update ready status
function updateReadyStatus(data) {
  const waitingList = document.getElementById('waitingForList');
  if (!waitingList) return;

  waitingList.textContent = `${data.readyCount} / ${data.totalParticipants} ready`;
}

// Start time tracking
function startTimeTracking() {
  if (state.intervalTimer) {
    clearInterval(state.intervalTimer);
  }

  state.intervalTimer = setInterval(() => {
    // Update interpreter time display
    if (state.currentRole === 'interpreter') {
      state.timeAsInterpreter += 1000; // Add 1 second
    }

    updateTimeDisplay();

    // Send time update to server (every 5 seconds)
    if (Date.now() % 5000 < 1000) {
      state.socket.emit('skillslab:time-update', {
        groupId: state.groupId,
        participantId: state.participantId,
      });
    }
  }, 1000);
}

// Update time display
function updateTimeDisplay() {
  const minutes = Math.floor(state.timeAsInterpreter / 60000);
  const seconds = Math.floor((state.timeAsInterpreter % 60000) / 1000);
  document.getElementById('interpreterTime').textContent =
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update target time display
function updateTargetTime() {
  if (!state.targetTime) return;

  const minutes = Math.floor(state.targetTime / 60000);
  const seconds = Math.floor((state.targetTime % 60000) / 1000);
  document.getElementById('targetTime').textContent =
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Show notification
function showNotification(message, type = 'info') {
  // Simple notification - could be enhanced with a toast library
  console.log(`[${type.toUpperCase()}] ${message}`);
  // TODO: Add visual notification
}

// Make functions globally available
window.markReady = markReady;
window.playLine = playLine;
