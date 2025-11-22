/**
 * Daily.co Helper for Skills Lab
 * Manages Daily.co rooms for group video/audio
 */

const axios = require('axios');

class DailyHelper {
  constructor() {
    this.apiKey = process.env.DAILY_API_KEY;
    this.baseUrl = 'https://api.daily.co/v1';
    this.domain = process.env.DAILY_DOMAIN; // e.g., 'yourcompany.daily.co'
  }

  /**
   * Create a Daily room for a group
   * @param {string} groupId - Unique group identifier
   * @param {Object} options - Room configuration
   * @returns {Object} Room info with URL
   */
  async createRoom(groupId, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const roomName = `skillslab-${groupId}-${Date.now()}`;

      const response = await axios.post(
        `${this.baseUrl}/rooms`,
        {
          name: roomName,
          privacy: 'private', // Only people with link can join
          properties: {
            enable_recording: 'cloud', // Enable cloud recording
            enable_screenshare: false, // Not needed for this use case
            enable_chat: false, // Using socket.io for chat
            start_video_off: false, // Start with video on
            start_audio_off: false, // Start with audio on
            max_participants: 5, // 3 students + 2 TAs max
            exp: options.expirationTime || Math.floor(Date.now() / 1000) + 7200, // 2 hours
            enable_network_ui: true, // Show network quality
            enable_prejoin_ui: false, // Skip prejoin (we handle permissions)
            ...options.properties,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return {
        roomName: response.data.name,
        roomUrl: response.data.url,
        roomId: response.data.id,
        config: response.data.config,
      };
    } catch (error) {
      console.error('Daily.co create room error:', error.response?.data || error.message);
      throw new Error(`Failed to create Daily room: ${error.message}`);
    }
  }

  /**
   * Create a meeting token for a participant
   * @param {string} roomName - Daily room name
   * @param {Object} participant - Participant info
   * @returns {string} Meeting token
   */
  async createMeetingToken(roomName, participant) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const tokenProperties = {
        room_name: roomName,
        user_name: participant.name,
        user_id: participant.participantId,
        is_owner: participant.isTA || false,
        exp: Math.floor(Date.now() / 1000) + 7200, // 2 hours
      };

      // Only set recording properties for TAs
      if (participant.isTA) {
        tokenProperties.enable_recording = 'cloud';
        tokenProperties.start_cloud_recording = false; // TA can start manually
      }

      const response = await axios.post(
        `${this.baseUrl}/meeting-tokens`,
        {
          properties: tokenProperties,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.token;
    } catch (error) {
      console.error('Daily.co create token error:', error.response?.data || error.message);
      throw new Error(`Failed to create meeting token: ${error.message}`);
    }
  }

  /**
   * Start cloud recording for a room
   * @param {string} roomName - Daily room name
   * @returns {Object} Recording info
   */
  async startRecording(roomName) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const response = await axios.post(
        `${this.baseUrl}/recordings/start`,
        {
          room_name: roomName,
          layout: {
            preset: 'default', // Can customize layout
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return {
        recordingId: response.data.id,
        startedAt: response.data.start_ts,
      };
    } catch (error) {
      console.error('Daily.co start recording error:', error.response?.data || error.message);
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  /**
   * Stop cloud recording for a room
   * @param {string} recordingId - Recording ID
   * @returns {Object} Recording info
   */
  async stopRecording(recordingId) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const response = await axios.post(
        `${this.baseUrl}/recordings/${recordingId}/stop`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return {
        recordingId: response.data.id,
        duration: response.data.duration,
        downloadUrl: response.data.download_link,
      };
    } catch (error) {
      console.error('Daily.co stop recording error:', error.response?.data || error.message);
      throw new Error(`Failed to stop recording: ${error.message}`);
    }
  }

  /**
   * Get recording info
   * @param {string} recordingId - Recording ID
   * @returns {Object} Recording details
   */
  async getRecording(recordingId) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/recordings/${recordingId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return {
        recordingId: response.data.id,
        roomName: response.data.room_name,
        startedAt: response.data.start_ts,
        duration: response.data.duration,
        status: response.data.status, // 'finished', 'processing', etc.
        downloadUrl: response.data.download_link,
        mp4Url: response.data.download_link, // MP4 download
      };
    } catch (error) {
      console.error('Daily.co get recording error:', error.response?.data || error.message);
      throw new Error(`Failed to get recording: ${error.message}`);
    }
  }

  /**
   * Delete a room
   * @param {string} roomName - Daily room name
   */
  async deleteRoom(roomName) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      await axios.delete(
        `${this.baseUrl}/rooms/${roomName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Daily.co delete room error:', error.response?.data || error.message);
      throw new Error(`Failed to delete room: ${error.message}`);
    }
  }

  /**
   * List all active recordings
   * @returns {Array} List of recordings
   */
  async listRecordings() {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/recordings`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.data || [];
    } catch (error) {
      console.error('Daily.co list recordings error:', error.response?.data || error.message);
      throw new Error(`Failed to list recordings: ${error.message}`);
    }
  }

  /**
   * Get room info
   * @param {string} roomName
   * @returns {Object} Room details
   */
  async getRoom(roomName) {
    try {
      if (!this.apiKey) {
        throw new Error('DAILY_API_KEY not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/rooms/${roomName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Daily.co get room error:', error.response?.data || error.message);
      throw new Error(`Failed to get room: ${error.message}`);
    }
  }
}

// Singleton instance
const dailyHelper = new DailyHelper();

module.exports = dailyHelper;
