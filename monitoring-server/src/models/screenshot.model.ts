/**
 * Screenshot data model
 */
export interface Screenshot {
  id: string;
  employee_id: string;
  activity_log_id: string;
  file_path: string;
  file_size: number;
  captured_at: Date;
  created_at: Date;
  expires_at: Date;
}
