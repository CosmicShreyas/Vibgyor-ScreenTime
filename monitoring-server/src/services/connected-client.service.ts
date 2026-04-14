import { ConnectedClient, IConnectedClient } from '../database/schemas';
import { logger } from '../utils/logger';

/**
 * Service for managing connected clients
 */
class ConnectedClientService {
  /**
   * Register or update a client connection
   */
  async registerClient(clientId: string, employeeName?: string, employeeId?: string, systemInfo?: any): Promise<IConnectedClient> {
    try {
      const now = new Date();
      
      // Get existing client to check if employee name changed
      const existingClient = await ConnectedClient.findOne({ clientId });
      const oldEmployeeName = existingClient?.employeeName;
      
      const updateData: any = {
        lastSeen: now,
      };
      
      if (employeeName) {
        updateData.employeeName = employeeName;
      }
      
      if (employeeId) {
        updateData.employeeId = employeeId;
      }
      
      // Only update system info if provided and not already set
      if (systemInfo) {
        updateData.systemInfo = {
          osName: systemInfo.os_name,
          osVersion: systemInfo.os_version,
          hostname: systemInfo.hostname,
          cpuModel: systemInfo.cpu_model,
          cpuCores: systemInfo.cpu_cores,
          totalRamGb: systemInfo.total_ram_gb,
          totalDiskGb: systemInfo.total_disk_gb,
          architecture: systemInfo.architecture,
        };
      }
      
      const client = await ConnectedClient.findOneAndUpdate(
        { clientId },
        {
          $set: updateData,
          $setOnInsert: {
            clientId,
            firstSeen: now,
          },
        },
        { upsert: true, new: true }
      );

      logger.debug('Client registered/updated', { clientId, employeeName, employeeId, hasSystemInfo: !!systemInfo });
      
      // If employee name changed, migrate data from old employee record to new one
      if (oldEmployeeName && employeeName && oldEmployeeName !== employeeName) {
        logger.info('Employee name changed, migrating data', { 
          clientId, 
          oldName: oldEmployeeName, 
          newName: employeeName 
        });
        
        await this.migrateEmployeeData(oldEmployeeName, employeeName);
      }
      
      return client;
    } catch (error) {
      logger.error('Error registering client', { error, clientId });
      throw error;
    }
  }

  /**
   * Migrate employee data from old name to new name
   */
  private async migrateEmployeeData(oldName: string, newName: string): Promise<void> {
    try {
      const { Employee, ActivityLog, Screenshot } = await import('../database/schemas');
      
      // Check if there's an employee record with the old name
      const oldEmployeeRecord = await Employee.findOne({ name: oldName });
      
      if (!oldEmployeeRecord) {
        logger.info('No old employee record found to migrate', { oldName });
        return;
      }
      
      logger.info('Found old employee record, migrating data', { 
        oldName, 
        newName 
      });
      
      // Check if employee with new name already exists
      let newEmployeeRecord = await Employee.findOne({ name: newName });
      
      if (!newEmployeeRecord) {
        // Rename the old employee record instead of creating a new one
        oldEmployeeRecord.name = newName;
        await oldEmployeeRecord.save();
        logger.info('Renamed employee record', { oldName, newName });
      } else {
        // Merge data: migrate activity logs and screenshots to existing employee
        logger.info('Employee with new name already exists, merging data', { newName });
        
        // Migrate activity logs
        const activityLogUpdateResult = await ActivityLog.updateMany(
          { employeeId: oldEmployeeRecord._id },
          { $set: { employeeId: newEmployeeRecord._id } }
        );
        logger.info('Migrated activity logs', { 
          count: activityLogUpdateResult.modifiedCount,
          from: oldName,
          to: newName 
        });
        
        // Migrate screenshots
        const screenshotUpdateResult = await Screenshot.updateMany(
          { employeeId: oldEmployeeRecord._id },
          { $set: { employeeId: newEmployeeRecord._id } }
        );
        logger.info('Migrated screenshots', { 
          count: screenshotUpdateResult.modifiedCount,
          from: oldName,
          to: newName 
        });
        
        // Update location if old one has it and new one doesn't
        if (oldEmployeeRecord.location && !newEmployeeRecord.location) {
          newEmployeeRecord.location = oldEmployeeRecord.location;
          await newEmployeeRecord.save();
          logger.info('Updated employee location', { newName });
        }
        
        // Delete old employee record
        await Employee.deleteOne({ _id: oldEmployeeRecord._id });
        logger.info('Deleted old employee record', { oldName });
      }
    } catch (error) {
      logger.error('Error migrating employee data', { error, oldName, newName });
      // Don't throw - allow registration to continue even if migration fails
    }
  }

  /**
   * Get all connected clients
   */
  async getAllClients(): Promise<IConnectedClient[]> {
    try {
      return await ConnectedClient.find().sort({ lastSeen: -1 });
    } catch (error) {
      logger.error('Error fetching connected clients', { error });
      throw error;
    }
  }

  /**
   * Get client by ID
   */
  async getClientById(clientId: string): Promise<IConnectedClient | null> {
    try {
      return await ConnectedClient.findOne({ clientId });
    } catch (error) {
      logger.error('Error fetching client', { error, clientId });
      throw error;
    }
  }

  /**
   * Update client employee name and ID
   * Also migrates any existing employee data from client_id to the new employee name
   */
  async updateClientName(clientId: string, employeeName: string, employeeId?: string): Promise<IConnectedClient | null> {
    try {
      const updateData: any = { employeeName };
      if (employeeId) {
        updateData.employeeId = employeeId;
      }

      const client = await ConnectedClient.findOneAndUpdate(
        { clientId },
        { $set: updateData },
        { new: true }
      );

      if (!client) {
        logger.warn('Client not found for name update', { clientId });
        return null;
      }

      logger.info('Client name and ID updated', { clientId, employeeName, employeeId });
      
      // Import Employee model to migrate data
      const { Employee, ActivityLog, Screenshot } = await import('../database/schemas');
      
      // Check if there's an employee record with the client_id as name
      const oldEmployeeRecord = await Employee.findOne({ name: clientId });
      
      if (oldEmployeeRecord) {
        logger.info('Found old employee record with client_id, migrating data', { 
          oldName: clientId, 
          newName: employeeName 
        });
        
        // Check if employee with new name already exists
        let newEmployeeRecord = await Employee.findOne({ name: employeeName });
        
        if (!newEmployeeRecord) {
          // Create new employee record with the employee name
          newEmployeeRecord = await Employee.create({
            name: employeeName,
            location: oldEmployeeRecord.location,
            firstSeen: oldEmployeeRecord.firstSeen,
            lastSeen: oldEmployeeRecord.lastSeen,
          });
          logger.info('Created new employee record', { employeeName });
        } else {
          // Update existing employee record with location if old one has it
          if (oldEmployeeRecord.location && !newEmployeeRecord.location) {
            newEmployeeRecord.location = oldEmployeeRecord.location;
            await newEmployeeRecord.save();
            logger.info('Updated existing employee record with location', { employeeName });
          }
        }
        
        // Migrate activity logs
        const activityLogUpdateResult = await ActivityLog.updateMany(
          { employeeId: oldEmployeeRecord._id },
          { $set: { employeeId: newEmployeeRecord._id } }
        );
        logger.info('Migrated activity logs', { 
          count: activityLogUpdateResult.modifiedCount,
          from: clientId,
          to: employeeName 
        });
        
        // Migrate screenshots
        const screenshotUpdateResult = await Screenshot.updateMany(
          { employeeId: oldEmployeeRecord._id },
          { $set: { employeeId: newEmployeeRecord._id } }
        );
        logger.info('Migrated screenshots', { 
          count: screenshotUpdateResult.modifiedCount,
          from: clientId,
          to: employeeName 
        });
        
        // Delete old employee record
        await Employee.deleteOne({ _id: oldEmployeeRecord._id });
        logger.info('Deleted old employee record', { oldName: clientId });
      }

      return client;
    } catch (error) {
      logger.error('Error updating client name', { error, clientId });
      throw error;
    }
  }

  /**
   * Delete a client and all associated employee data
   */
  async deleteClient(clientId: string): Promise<boolean> {
    try {
      // Get the connected client to find the employee name
      const client = await ConnectedClient.findOne({ clientId });
      
      if (!client) {
        logger.warn('Client not found for deletion', { clientId });
        return false;
      }

      // Import models for cleanup
      const { Employee, ActivityLog, Screenshot } = await import('../database/schemas');
      
      // Find employee by name (either the employeeName or the clientId)
      const employeeName = client.employeeName || clientId;
      const employee = await Employee.findOne({ name: employeeName });
      
      if (employee) {
        // Delete all activity logs for this employee
        await ActivityLog.deleteMany({ employeeId: employee._id });
        logger.info('Deleted activity logs for employee', { employeeName });
        
        // Delete all screenshots for this employee
        await Screenshot.deleteMany({ employeeId: employee._id });
        logger.info('Deleted screenshots for employee', { employeeName });
        
        // Delete the employee record
        await Employee.deleteOne({ _id: employee._id });
        logger.info('Deleted employee record', { employeeName });
      }
      
      // Delete the connected client record
      const result = await ConnectedClient.deleteOne({ clientId });
      
      if (result.deletedCount === 0) {
        logger.warn('Client not found for deletion', { clientId });
        return false;
      }

      logger.info('Client and associated data deleted', { clientId, employeeName });
      return true;
    } catch (error) {
      logger.error('Error deleting client', { error, clientId });
      throw error;
    }
  }

  /**
   * Get employee name by client ID
   */
  async getEmployeeNameByClientId(clientId: string): Promise<string | null> {
    try {
      const client = await ConnectedClient.findOne({ clientId });
      return client?.employeeName || null;
    } catch (error) {
      logger.error('Error fetching employee name', { error, clientId });
      throw error;
    }
  }
  
  /**
   * Get client by employee name
   */
  async getClientByEmployeeName(employeeName: string): Promise<IConnectedClient | null> {
    try {
      const client = await ConnectedClient.findOne({ employeeName });
      return client;
    } catch (error) {
      logger.error('Error fetching client by employee name', { error, employeeName });
      throw error;
    }
  }
}

export const connectedClientService = new ConnectedClientService();
