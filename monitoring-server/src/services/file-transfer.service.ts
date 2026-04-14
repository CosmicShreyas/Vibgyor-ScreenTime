import { FileTransfer, IFileTransfer, Employee } from '../database/schemas';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

export class FileTransferService {
  /**
   * Create a new file transfer record
   */
  static async createFileTransfer(
    filename: string,
    originalName: string,
    fileSize: number,
    mimeType: string,
    uploadedBy: string,
    targetEmployees: string[] = []
  ): Promise<IFileTransfer> {
    try {
      const filePath = path.join(config.fileUploadPath, filename);

      // Get all employees if no specific targets
      let employees: string[] = targetEmployees;
      if (employees.length === 0) {
        const allEmployees = await Employee.find({}, 'name');
        employees = allEmployees.map(emp => emp.name);
      }

      // Create employee status array
      const employeeStatus = employees.map(name => ({
        employeeName: name,
        status: 'pending' as const,
      }));

      const fileTransfer = new FileTransfer({
        filename,
        originalName,
        fileSize,
        mimeType,
        uploadedAt: new Date(),
        uploadedBy,
        filePath,
        targetEmployees: employees,
        status: 'pending',
        employeeStatus,
      });

      await fileTransfer.save();
      logger.info(`File transfer created: ${originalName} for ${employees.length} employees`);
      
      return fileTransfer;
    } catch (error) {
      logger.error('Error creating file transfer:', error);
      throw error;
    }
  }

  /**
   * Get all file transfers
   */
  static async getAllFileTransfers(): Promise<IFileTransfer[]> {
    try {
      return await FileTransfer.find().sort({ uploadedAt: -1 });
    } catch (error) {
      logger.error('Error fetching file transfers:', error);
      throw error;
    }
  }

  /**
   * Get active (not deleted) files for a specific employee
   * Returns all files that should exist on the client
   */
  static async getActiveFilesForEmployee(employeeName: string): Promise<IFileTransfer[]> {
    try {
      const files = await FileTransfer.find({
        $or: [
          { targetEmployees: { $size: 0 } },
          { targetEmployees: employeeName }
        ],
        'employeeStatus': {
          $elemMatch: {
            employeeName: employeeName
          }
        }
      }).sort({ uploadedAt: 1 });

      return files;
    } catch (error) {
      logger.error(`Error fetching active files for ${employeeName}:`, error);
      throw error;
    }
  }

  /**
   * Get pending files for a specific employee and optionally specific client
   */
  static async getPendingFilesForEmployee(
    employeeName: string,
    clientId?: string
  ): Promise<IFileTransfer[]> {
    try {
      const query: any = {
        $or: [
          { targetEmployees: { $size: 0 } },
          { targetEmployees: employeeName }
        ],
        'employeeStatus': {
          $elemMatch: {
            employeeName: employeeName,
            status: { $in: ['pending', 'downloading'] }
          }
        }
      };

      // If client_id is provided, filter for this specific client
      if (clientId) {
        query['employeeStatus'].$elemMatch.$or = [
          { clientId: { $exists: false } },  // Not yet assigned to any client
          { clientId: clientId }  // Assigned to this client
        ];
      }

      const files = await FileTransfer.find(query).sort({ uploadedAt: 1 });

      // If client_id provided and file not yet assigned, assign it
      if (clientId) {
        for (const file of files) {
          const empStatus = file.employeeStatus.find(es => es.employeeName === employeeName);
          if (empStatus && !empStatus.clientId) {
            empStatus.clientId = clientId;
            await file.save();
          }
        }
      }

      return files;
    } catch (error) {
      logger.error(`Error fetching pending files for ${employeeName}:`, error);
      throw error;
    }
  }

  /**
   * Update employee download status
   */
  static async updateEmployeeStatus(
    fileId: string,
    employeeName: string,
    status: 'pending' | 'downloading' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        'employeeStatus.$.status': status,
      };

      if (status === 'completed') {
        updateData['employeeStatus.$.downloadedAt'] = new Date();
      }

      if (error) {
        updateData['employeeStatus.$.error'] = error;
      }

      await FileTransfer.updateOne(
        {
          _id: fileId,
          'employeeStatus.employeeName': employeeName
        },
        { $set: updateData }
      );

      // Check if all employees have completed
      const fileTransfer = await FileTransfer.findById(fileId);
      if (fileTransfer) {
        const allCompleted = fileTransfer.employeeStatus.every(
          es => es.status === 'completed' || es.status === 'failed'
        );
        
        if (allCompleted) {
          fileTransfer.status = 'completed';
          await fileTransfer.save();
        }
      }

      logger.info(`Updated file ${fileId} status for ${employeeName}: ${status}`);
    } catch (error) {
      logger.error('Error updating employee status:', error);
      throw error;
    }
  }

  /**
   * Delete a file transfer
   */
  static async deleteFileTransfer(fileId: string): Promise<void> {
    try {
      const fileTransfer = await FileTransfer.findById(fileId);
      
      if (!fileTransfer) {
        throw new Error('File transfer not found');
      }

      // Delete physical file
      try {
        await fs.unlink(fileTransfer.filePath);
      } catch (error) {
        logger.warn(`Failed to delete physical file: ${fileTransfer.filePath}`, error);
      }

      // Delete database record
      await FileTransfer.deleteOne({ _id: fileId });
      
      logger.info(`File transfer deleted: ${fileTransfer.originalName}`);
    } catch (error) {
      logger.error('Error deleting file transfer:', error);
      throw error;
    }
  }

  /**
   * Get file transfer by ID
   */
  static async getFileTransferById(fileId: string): Promise<IFileTransfer | null> {
    try {
      return await FileTransfer.findById(fileId);
    } catch (error) {
      logger.error('Error fetching file transfer:', error);
      throw error;
    }
  }
}
