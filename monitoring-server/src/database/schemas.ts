import mongoose, { Schema, Document } from 'mongoose';

/**
 * Employee Document Interface
 */
export interface IEmployee extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  location?: {
    city: string;
    state: string;
    country: string;
  };
  firstSeen: Date;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Activity Log Document Interface
 */
export interface IActivityLog extends Document {
  _id: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  timestamp: Date;
  intervalStart: Date;
  intervalEnd: Date;
  workSeconds: number;
  idleSeconds: number;
  applications: Array<{
    name: string;
    duration: number;
  }>;
  browserTabs: Array<{
    title: string;
    url?: string;
    duration: number;
  }>;
  // Intensity + genuineness (anti-cheat). All optional/privacy-safe.
  keystrokes?: number;
  mouseClicks?: number;
  mouseDistancePx?: number;
  scrollEvents?: number;
  keystrokesPerMin?: number;
  mouseActivityPerMin?: number;
  suspectedFakeSeconds?: number;
  genuinenessScore?: number; // 0-100
  suspicionReasons?: string[];
  idleReason?: string;
  createdAt: Date;
}

/**
 * Screenshot Document Interface
 */
export interface IScreenshot extends Document {
  _id: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  activityLogId: mongoose.Types.ObjectId;
  filePath: string;
  fileSize: number;
  capturedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Connected Client Document Interface
 */
export interface IConnectedClient extends Document {
  _id: mongoose.Types.ObjectId;
  clientId: string;
  employeeName?: string;
  employeeId?: string;
  status?: 'online' | 'offline';
  lastOfflineAlertSentAt?: Date;
  systemInfo?: {
    osName: string;
    osVersion: string;
    hostname: string;
    cpuModel: string;
    cpuCores: number;
    totalRamGb: number;
    totalDiskGb: number;
    architecture: string;
  };
  firstSeen: Date;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Client Config Document Interface
 */
export interface IClientConfig extends Document {
  _id: mongoose.Types.ObjectId;
  employeeName: string;
  serverUrl: string;
  authToken: string;
  screenshotIntervalMinutes: number;
  dataSendIntervalMinutes: number;
  locationUpdateIntervalMinutes: number;
  idleThresholdSeconds: number;
  appUsagePollIntervalSeconds: number;
  screenshotQuality: number;
  logLevel: string;
  fileDownloadPath: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Employee Schema
 */
const employeeSchema = new Schema<IEmployee>({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  location: {
    city: { type: String, required: false },
    state: { type: String, required: false },
    country: { type: String, required: false },
  },
  firstSeen: {
    type: Date,
    required: true,
    default: Date.now,
  },
  lastSeen: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'employees',
});

/**
 * Activity Log Schema
 */
const activityLogSchema = new Schema<IActivityLog>({
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  intervalStart: {
    type: Date,
    required: true,
    index: true,
  },
  intervalEnd: {
    type: Date,
    required: true,
  },
  workSeconds: {
    type: Number,
    required: true,
    min: 0,
  },
  idleSeconds: {
    type: Number,
    required: true,
    min: 0,
  },
  applications: [{
    name: { type: String, required: true },
    duration: { type: Number, required: true },
  }],
  browserTabs: [{
    title: { type: String, required: true },
    url: { type: String, required: false, default: '' },
    duration: { type: Number, required: true },
  }],
  // Intensity + genuineness (anti-cheat) — optional, backward-compatible.
  keystrokes: { type: Number, required: false },
  mouseClicks: { type: Number, required: false },
  mouseDistancePx: { type: Number, required: false },
  scrollEvents: { type: Number, required: false },
  keystrokesPerMin: { type: Number, required: false },
  mouseActivityPerMin: { type: Number, required: false },
  suspectedFakeSeconds: { type: Number, required: false },
  genuinenessScore: { type: Number, required: false, min: 0, max: 100 },
  suspicionReasons: { type: [String], required: false, default: undefined },
  idleReason: { type: String, required: false },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'activity_logs',
});

// Compound index for common queries
activityLogSchema.index({ employeeId: 1, timestamp: -1 });

/**
 * Screenshot Schema
 */
const screenshotSchema = new Schema<IScreenshot>({
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  activityLogId: {
    type: Schema.Types.ObjectId,
    ref: 'ActivityLog',
    required: true,
    index: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
    min: 1,
  },
  capturedAt: {
    type: Date,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'screenshots',
});

// Compound index for common queries
screenshotSchema.index({ employeeId: 1, capturedAt: -1 });

/**
 * Connected Client Schema
 */
const connectedClientSchema = new Schema<IConnectedClient>({
  clientId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  employeeName: {
    type: String,
    required: false,
    index: true,
  },
  employeeId: {
    type: String,
    required: false,
    index: true,
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online',
    index: true,
  },
  lastOfflineAlertSentAt: {
    type: Date,
    required: false,
  },
  systemInfo: {
    osName: { type: String },
    osVersion: { type: String },
    hostname: { type: String },
    cpuModel: { type: String },
    cpuCores: { type: Number },
    totalRamGb: { type: Number },
    totalDiskGb: { type: Number },
    architecture: { type: String },
  },
  firstSeen: {
    type: Date,
    required: true,
    default: Date.now,
  },
  lastSeen: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'connected_clients',
});

/**
 * Client Config Schema
 */
const clientConfigSchema = new Schema<IClientConfig>({
  employeeName: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  serverUrl: {
    type: String,
    required: true,
  },
  authToken: {
    type: String,
    required: true,
  },
  screenshotIntervalMinutes: {
    type: Number,
    required: true,
    default: 10,
    min: 1,
  },
  dataSendIntervalMinutes: {
    type: Number,
    required: true,
    default: 10,
    min: 1,
  },
  locationUpdateIntervalMinutes: {
    type: Number,
    required: true,
    default: 30,
    min: 1,
  },
  idleThresholdSeconds: {
    type: Number,
    required: true,
    default: 300,
    min: 1,
  },
  appUsagePollIntervalSeconds: {
    type: Number,
    required: true,
    default: 10,
    min: 2,
  },
  screenshotQuality: {
    type: Number,
    required: true,
    default: 75,
    min: 1,
    max: 100,
  },
  logLevel: {
    type: String,
    required: true,
    default: 'INFO',
    enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
  },
  fileDownloadPath: {
    type: String,
    required: true,
    default: 'C:\\Downloads\\CompanyFiles',
  },
  version: {
    type: Number,
    required: true,
    default: 1,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'client_configs',
});

/**
 * EOD Report Config Document Interface
 */
export interface IEODReportConfig extends Document {
  _id: mongoose.Types.ObjectId;
  clientId: string;
  employeeName: string;
  email: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EOD Report Config Schema
 */
const eodReportConfigSchema = new Schema<IEODReportConfig>({
  clientId: {
    type: String,
    required: true,
    // Uniqueness/index declared explicitly below via schema.index() to avoid a
    // duplicate-index definition.
  },
  employeeName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true,
  },
}, {
  timestamps: true,
  collection: 'eod_report_configs',
});

// One EOD report configuration per user/client. Keyed on clientId alone (not
// clientId+email) so the same employee cannot be registered twice and receive
// duplicate daily reports.
eodReportConfigSchema.index({ clientId: 1 }, { unique: true });

/**
 * Export Models
 */
export const Employee = mongoose.model<IEmployee>('Employee', employeeSchema);
export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
export const Screenshot = mongoose.model<IScreenshot>('Screenshot', screenshotSchema);
export const ConnectedClient = mongoose.model<IConnectedClient>('ConnectedClient', connectedClientSchema);
export const ClientConfig = mongoose.model<IClientConfig>('ClientConfig', clientConfigSchema);
export const EODReportConfig = mongoose.model<IEODReportConfig>('EODReportConfig', eodReportConfigSchema);
