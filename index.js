require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes - Legacy CIA routes
app.get('/api/health', require('./api/health'));
app.post('/api/validate-student', require('./api/validate-student'));
app.post('/api/validate-admin', require('./api/validate-admin'));
app.post('/api/upload-chunk', require('./api/upload-chunk'));
app.post('/api/upload-final', require('./api/upload-final'));
app.post('/api/create-session', require('./api/create-session'));
app.post('/api/join-proctor', require('./api/join-proctor'));
app.post('/api/confirm-proctor', require('./api/confirm-proctor'));
app.get('/api/session-status/:sessionId', require('./api/session-status'));
app.get('/api/recordings', require('./api/get-recordings'));
app.get('/api/session-chunks', require('./api/get-session-chunks'));
app.get('/api/stream-chunk', require('./api/stream-chunk'));
app.post('/api/update-grade', require('./api/update-grade'));
app.get('/api/tests', require('./api/get-tests'));
app.get('/api/test-config', require('./api/get-test-config'));
app.post('/api/save-test', require('./api/save-test'));
app.post('/api/split-and-upload', require('./api/split-and-upload'));
app.post('/api/save-emergency-state', require('./api/save-emergency-state'));

// Skills Lab API Routes
app.post('/api/create-skillslab-session', require('./api/create-skillslab-session'));
app.post('/api/join-group', require('./api/join-group'));
app.get('/api/get-group-state', require('./api/get-group-state'));
app.post('/api/start-skillslab-session', require('./api/start-skillslab-session'));
app.post('/api/end-skillslab-session', (req, res) => require('./api/end-skillslab-session')(req, res, io));
app.post('/api/rotate-roles', require('./api/rotate-roles'));
app.post('/api/mark-ready', require('./api/mark-ready'));
app.post('/api/create-daily-room', require('./api/create-daily-room'));
app.post('/api/get-daily-token', require('./api/get-daily-token'));
app.get('/api/get-all-sessions', require('./api/get-all-sessions'));
app.post('/api/update-group-settings', require('./api/update-group-settings'));
app.post('/api/upload-group-recording', require('./api/upload-group-recording'));

// Serve main app - redirect to TA Panel (Skills Lab)
app.get('/', (req, res) => {
  res.redirect('/ta-panel');
});

// Legacy CIA app (keep for backward compatibility)
app.get('/cia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cia-app.html'));
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve proctor join page
app.get('/proctor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'proctor.html'));
});

// Serve Skills Lab app
app.get('/skillslab', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'skillslab.html'));
});

// Serve TA Control Panel
app.get('/ta-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ta-panel.html'));
});

// Socket.io for live monitoring and WebRTC signaling
const activeSessions = new Map(); // Track active test sessions (CIA legacy)
const sessionManager = require('./utils/session-manager'); // Skills Lab session manager

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Student joins with session info
  socket.on('join-session', ({ sessionId, email, role }) => {
    console.log(`${role} joined session:`, sessionId, email);

    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.email = email;
    socket.role = role; // 'student', 'proctor', or 'admin'

    // Track active session
    if (role === 'student') {
      if (!activeSessions.has(sessionId)) {
        activeSessions.set(sessionId, {
          sessionId,
          email,
          connectedAt: new Date(),
          studentSocketId: socket.id,
        });
      }

      // Notify all admins about active sessions
      io.emit('active-sessions', Array.from(activeSessions.values()));
    }

    // If admin joins, send them current active sessions immediately
    if (role === 'admin') {
      socket.emit('active-sessions', Array.from(activeSessions.values()));
    }
  });

  // WebRTC Signaling - relay signals between peers
  socket.on('signal', ({ sessionId, targetSocketId, signal, deviceType }) => {
    console.log(`Relaying signal for session ${sessionId}, device ${deviceType}`);

    // Forward signal to target socket (admin or student)
    if (targetSocketId) {
      io.to(targetSocketId).emit('signal', {
        sessionId,
        fromSocketId: socket.id,
        signal,
        deviceType,
        email: socket.email,
      });
    } else {
      // Broadcast to all in room (for initial connection)
      socket.to(sessionId).emit('signal', {
        sessionId,
        fromSocketId: socket.id,
        signal,
        deviceType,
        email: socket.email,
      });
    }
  });

  // Admin requests to monitor a student
  socket.on('monitor-student', ({ sessionId }) => {
    console.log(`Admin ${socket.id} monitoring session ${sessionId}`);
    socket.join(sessionId);

    // Notify all devices in this session (student + proctor) that admin is monitoring
    // This triggers both to send their WebRTC streams
    socket.to(sessionId).emit('admin-monitoring', {
      adminSocketId: socket.id,
    });
  });

  // Session progress updates (current segment, time, etc)
  socket.on('session-update', (data) => {
    const session = activeSessions.get(socket.sessionId);
    if (session) {
      session.currentSegment = data.currentSegment;
      session.totalSegments = data.totalSegments;
      session.elapsedTime = data.elapsedTime;

      // Broadcast update to admins
      io.emit('session-progress', {
        sessionId: socket.sessionId,
        ...data,
      });
    }
  });

  // ======== Skills Lab Socket Handlers ========

  // Join a Skills Lab group
  socket.on('skillslab:join-group', ({ groupId, participantId, role }) => {
    console.log(`Skills Lab - Participant ${participantId} joined group ${groupId} as ${role}`);

    socket.join(groupId);
    socket.groupId = groupId;
    socket.participantId = participantId;
    socket.skillslabRole = role;

    // Update participant socket ID in session manager
    const group = sessionManager.groups.get(groupId);
    if (group) {
      const participant = group.participants.find(p => p.participantId === participantId);
      if (participant) {
        participant.socketId = socket.id;
      }

      // Notify all group members
      io.to(groupId).emit('skillslab:participant-joined', {
        participantId,
        role,
        groupSize: group.size,
        participants: group.participants.map(p => ({
          participantId: p.participantId,
          name: p.name,
          role: group.currentRoles[p.participantId],
        })),
      });
    }
  });

  // Request role rotation
  socket.on('skillslab:request-rotation', ({ groupId }) => {
    console.log(`Skills Lab - Rotation requested for group ${groupId}`);

    try {
      const result = sessionManager.rotateRoles(groupId);
      const group = sessionManager.groups.get(groupId);

      if (group) {
        group.switchStartTime = Date.now();

        // Notify all participants of role change
        io.to(groupId).emit('skillslab:role-rotation', {
          newRoles: result.newRoles,
          rotationCount: result.rotationCount,
          requiresReady: true,
        });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Participant marks ready after role switch
  socket.on('skillslab:mark-ready', ({ groupId, participantId }) => {
    console.log(`Skills Lab - Participant ${participantId} marked ready in group ${groupId}`);

    try {
      const allReady = sessionManager.markParticipantReady(groupId, participantId);

      // Notify group of ready status
      const group = sessionManager.groups.get(groupId);
      if (group) {
        io.to(groupId).emit('skillslab:ready-status', {
          participantId,
          readyCount: group.readyChecks ? group.readyChecks.size : 0,
          totalParticipants: group.size,
          allReady,
        });

        if (allReady) {
          // Resume session
          io.to(groupId).emit('skillslab:session-resumed', {
            message: 'All participants ready - continuing',
          });
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Play audio line (patient/provider)
  socket.on('skillslab:play-line', ({ groupId, participantId, lineNumber, role }) => {
    console.log(`Skills Lab - ${role} playing line ${lineNumber} in group ${groupId}`);

    // Broadcast to all group members
    io.to(groupId).emit('skillslab:line-played', {
      participantId,
      lineNumber,
      role,
    });
  });

  // TA joins to monitor a group
  socket.on('skillslab:ta-join-group', ({ groupId, taName }) => {
    console.log(`Skills Lab - TA ${taName} monitoring group ${groupId}`);

    socket.join(groupId);
    socket.isTA = true;
    socket.taName = taName;

    // Notify group that TA joined
    io.to(groupId).emit('skillslab:ta-joined', {
      taName,
      message: 'TA has joined to observe',
    });
  });

  // TA manually triggers rotation
  socket.on('skillslab:ta-force-rotation', ({ groupId }) => {
    console.log(`Skills Lab - TA forcing rotation for group ${groupId}`);

    try {
      const result = sessionManager.rotateRoles(groupId);
      const group = sessionManager.groups.get(groupId);

      if (group) {
        group.switchStartTime = Date.now();

        io.to(groupId).emit('skillslab:role-rotation', {
          newRoles: result.newRoles,
          rotationCount: result.rotationCount,
          requiresReady: true,
          forcedByTA: true,
        });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // TA moves participant to different group
  socket.on('skillslab:ta-move-participant', ({ participantId, fromGroupId, toGroupId }) => {
    console.log(`Skills Lab - TA moving participant ${participantId} from ${fromGroupId} to ${toGroupId}`);

    // Notify old group
    io.to(fromGroupId).emit('skillslab:participant-left', {
      participantId,
      reason: 'Moved by TA',
    });

    // Notify new group
    io.to(toGroupId).emit('skillslab:participant-joined', {
      participantId,
      reason: 'Moved by TA',
    });

    // Update TA panel
    io.emit('skillslab:groups-updated');
  });

  // Time tracking update
  socket.on('skillslab:time-update', ({ groupId, participantId }) => {
    const group = sessionManager.groups.get(groupId);
    if (!group) return;

    // Check if rotation is needed
    if (sessionManager.shouldRotate(groupId)) {
      console.log(`Skills Lab - Auto-rotating group ${groupId} due to time threshold`);

      try {
        const result = sessionManager.rotateRoles(groupId);
        group.switchStartTime = Date.now();

        io.to(groupId).emit('skillslab:role-rotation', {
          newRoles: result.newRoles,
          rotationCount: result.rotationCount,
          requiresReady: true,
          automatic: true,
        });
      } catch (error) {
        console.error('Auto-rotation error:', error);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Remove from active sessions if student (CIA legacy)
    if (socket.role === 'student' && socket.sessionId) {
      activeSessions.delete(socket.sessionId);
      io.emit('active-sessions', Array.from(activeSessions.values()));
    }

    // Handle Skills Lab disconnection
    if (socket.groupId && socket.participantId) {
      const group = sessionManager.groups.get(socket.groupId);
      if (group) {
        // Notify group members
        io.to(socket.groupId).emit('skillslab:participant-disconnected', {
          participantId: socket.participantId,
          role: socket.skillslabRole,
        });
      }
    }
  });
});

// Automatic rotation checker - runs every 10 seconds
function checkRotations() {
  const groups = Array.from(sessionManager.groups.values());

  groups.forEach((group) => {
    // Only check active groups with participants
    if (group.status !== 'active') return;
    if (!group.participants || group.participants.length === 0) return;

    try {
      const shouldRotate = sessionManager.shouldRotate(group.groupId);

      if (shouldRotate) {
        console.log(`[ROTATION] Auto-triggering rotation for group ${group.groupNumber}`);

        // Perform rotation
        const result = sessionManager.rotateRoles(group.groupId);
        group.switchStartTime = Date.now();

        // Notify all participants
        io.to(group.groupId).emit('skillslab:role-rotation', {
          newRoles: result.newRoles,
          rotationCount: result.rotationCount,
          requiresReady: true,
        });

        console.log(`[ROTATION] ✓ Rotation triggered for group ${group.groupNumber}, new interpreter: ${Object.entries(result.newRoles).find(([pid, role]) => role === 'interpreter')[0]}`);
      }
    } catch (error) {
      console.error(`[ROTATION] Error checking rotation for group ${group.groupId}:`, error.message);
    }
  });
}

// Start rotation checker (runs every 10 seconds)
setInterval(checkRotations, 10000);
console.log('[ROTATION] Auto-rotation checker started (10s interval)');

server.listen(PORT, () => {
  console.log(`CIA Assessment Server running on port ${PORT}`);
  console.log(`WebSocket server ready for live monitoring`);
});
