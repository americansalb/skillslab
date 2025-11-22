const formidable = require('formidable');
const fs = require('fs');
const { findOrCreateFolder, uploadBuffer } = require('../utils/drive-helper');

/**
 * Upload group recording to Google Drive
 * POST /api/upload-group-recording
 */
module.exports = async (req, res) => {
  const form = new formidable.IncomingForm({
    maxFileSize: 2000 * 1024 * 1024, // 2GB max for recordings
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[UPLOAD-RECORDING] Form parse error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to parse upload',
      });
    }

    try {
      const { sessionId, groupNumber, sessionName } = fields;
      const videoFile = files.recording;

      console.log('[UPLOAD-RECORDING] Uploading recording for session:', sessionId, 'group:', groupNumber);

      if (!sessionId || !groupNumber || !videoFile) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: sessionId, groupNumber, recording',
        });
      }

      // Read file into buffer
      const fileBuffer = fs.readFileSync(videoFile[0].filepath);

      // Create folder structure: Main Folder / Skills Lab Recordings / Session Name / Group X
      const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const skillsLabFolderId = await findOrCreateFolder(mainFolderId, 'Skills Lab Recordings');

      const sessionFolderName = `${sessionName[0] || 'Session'}_${sessionId[0]}_${new Date().toISOString().split('T')[0]}`;
      const sessionFolderId = await findOrCreateFolder(skillsLabFolderId, sessionFolderName);

      // Upload video with descriptive name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Group_${groupNumber[0]}_${timestamp}.webm`;

      console.log('[UPLOAD-RECORDING] Uploading to Google Drive:', fileName);

      const uploadResult = await uploadBuffer(
        fileBuffer,
        fileName,
        sessionFolderId,
        'video/webm'
      );

      // Clean up temp file
      fs.unlinkSync(videoFile[0].filepath);

      console.log('[UPLOAD-RECORDING] ✓ Upload successful:', uploadResult.fileId);

      res.json({
        success: true,
        message: 'Recording uploaded successfully',
        fileId: uploadResult.fileId,
        webViewLink: uploadResult.webViewLink,
        fileName: fileName,
      });
    } catch (error) {
      console.error('[UPLOAD-RECORDING] ✗ Upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload recording',
        error: error.message,
      });
    }
  });
};
