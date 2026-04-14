import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { FileTransferService } from '../services/file-transfer.service';
import { validateJwtToken, validateClientToken } from '../middleware/auth.middleware';
import { config } from '../config';
import { logger } from '../utils/logger';
import { broadcastFileEvent } from '../services/websocket.service';

const router = express.Router();

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(config.fileUploadPath, { recursive: true });
  } catch (error) {
    logger.error('Error creating upload directory:', error);
  }
};

ensureUploadDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, config.fileUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileUploadSizeMb * 1024 * 1024, // Convert MB to bytes
  },
});

/**
 * GET /api/files/employees
 * Get list of all employees for file targeting
 */
router.get('/employees', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { Employee } = await import('../database/schemas');
    const employees = await Employee.find({}, 'name').sort({ name: 1 });
    
    res.json({
      success: true,
      employees: employees.map(e => e.name),
    });
  } catch (error) {
    logger.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/**
 * POST /api/files/upload
 * Upload a new file for distribution
 */
router.post('/upload', validateJwtToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { targetEmployees } = req.body;
    const uploadedBy = (req as any).user?.username || 'admin';

    // Parse target employees if provided
    let targets: string[] = [];
    if (targetEmployees) {
      try {
        targets = JSON.parse(targetEmployees);
      } catch {
        targets = [];
      }
    }

    const fileTransfer = await FileTransferService.createFileTransfer(
      req.file.filename,
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      uploadedBy,
      targets
    );

    // Broadcast to all clients via WebSocket
    broadcastFileEvent('file:uploaded', {
      fileId: fileTransfer._id.toString(),
      filename: fileTransfer.originalName,
      fileSize: fileTransfer.fileSize,
    });

    res.status(201).json({
      success: true,
      file: {
        id: fileTransfer._id,
        filename: fileTransfer.originalName,
        fileSize: fileTransfer.fileSize,
        uploadedAt: fileTransfer.uploadedAt,
        targetEmployees: fileTransfer.targetEmployees,
      },
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * GET /api/files
 * Get all file transfers
 */
router.get('/', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const files = await FileTransferService.getAllFileTransfers();
    
    res.json({
      success: true,
      files: files.map(f => ({
        id: f._id,
        filename: f.originalName,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedBy,
        targetEmployees: f.targetEmployees,
        status: f.status,
        employeeStatus: f.employeeStatus,
      })),
    });
  } catch (error) {
    logger.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * GET /api/files/active/:employeeName
 * Get list of active (not deleted) files for a specific employee
 * Used by client to sync deletions
 */
router.get('/active/:employeeName', validateClientToken, async (req: Request, res: Response) => {
  try {
    const { employeeName } = req.params;
    
    // Get all files (pending, downloading, or completed) for this employee
    const files = await FileTransferService.getActiveFilesForEmployee(employeeName);
    
    res.json({
      success: true,
      files: files.map(f => ({
        id: f._id,
        filename: f.originalName,
      })),
    });
  } catch (error) {
    logger.error('Error fetching active files:', error);
    res.status(500).json({ error: 'Failed to fetch active files' });
  }
});

/**
 * GET /api/files/pending/:employeeName
 * Get pending files for a specific employee and client
 */
router.get('/pending/:employeeName', validateClientToken, async (req: Request, res: Response) => {
  try {
    const { employeeName } = req.params;
    const { client_id } = req.query;
    
    const files = await FileTransferService.getPendingFilesForEmployee(
      employeeName,
      client_id as string | undefined
    );
    
    res.json({
      success: true,
      files: files.map(f => ({
        id: f._id,
        filename: f.originalName,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        uploadedAt: f.uploadedAt,
      })),
    });
  } catch (error) {
    logger.error('Error fetching pending files:', error);
    res.status(500).json({ error: 'Failed to fetch pending files' });
  }
});

/**
 * GET /api/files/:id/download
 * Download a file
 */
router.get('/:id/download', validateClientToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employeeName = req.query.employeeName as string;

    if (!employeeName) {
      return res.status(400).json({ error: 'Employee name required' });
    }

    const fileTransfer = await FileTransferService.getFileTransferById(id);
    
    if (!fileTransfer) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if file exists
    const fileExists = await fs.access(fileTransfer.filePath).then(() => true).catch(() => false);
    if (!fileExists) {
      logger.error(`File not found on disk: ${fileTransfer.filePath}`);
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Update status to downloading
    await FileTransferService.updateEmployeeStatus(id, employeeName, 'downloading');

    // Set headers for file download
    res.setHeader('Content-Type', fileTransfer.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileTransfer.originalName}"`);
    res.setHeader('Content-Length', fileTransfer.fileSize.toString());

    // Stream the file
    const fileStream = require('fs').createReadStream(fileTransfer.filePath);
    
    fileStream.on('error', async (err) => {
      logger.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
      await FileTransferService.updateEmployeeStatus(
        id,
        employeeName,
        'failed',
        'Error streaming file'
      );
    });

    fileStream.pipe(res);

    // Note: Status update to 'completed' is handled by the client
    // via POST /api/files/:id/status endpoint
  } catch (error) {
    logger.error('Error downloading file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
});

/**
 * POST /api/files/:id/status
 * Update download status for an employee
 */
router.post('/:id/status', validateClientToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employeeName, status, error } = req.body;

    if (!employeeName || !status) {
      return res.status(400).json({ error: 'Employee name and status required' });
    }

    await FileTransferService.updateEmployeeStatus(id, employeeName, status, error);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating file status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file transfer
 */
router.delete('/:id', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get file info before deleting
    const fileTransfer = await FileTransferService.getFileTransferById(id);
    const filename = fileTransfer?.originalName || 'unknown';
    
    await FileTransferService.deleteFileTransfer(id);

    // Broadcast to all clients via WebSocket with filename
    broadcastFileEvent('file:deleted', { 
      fileId: id,
      filename: filename
    });

    logger.info(`File deleted and broadcast: ${filename} (ID: ${id})`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
