# VibgyorSeek Monitoring Server

Node.js/Express backend server for the VibgyorSeek Employee Monitoring System.

## Features

- Receives monitoring data from Python client applications
- Stores employee activity logs and screenshots
- Provides REST API for dashboard UI
- Real-time updates via WebSocket
- Automatic screenshot cleanup based on TTL
- Comprehensive logging and error handling
- Remote client configuration management
- OTA (Over-The-Air) file transfer to clients

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Environment variables configured (see `.env.example`)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Set up the database (schema creation scripts to be added)

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

Build TypeScript:
```bash
npm run build
```

Run tests:
```bash
npm test
```

## Production

Build and start:
```bash
npm run build
npm start
```

## Project Structure

```
src/
├── config/          # Configuration management
├── middleware/      # Express middleware (auth, etc.)
├── models/          # TypeScript interfaces and types
├── routes/          # API route handlers
├── services/        # Business logic services
└── utils/           # Utility functions (logger, database)
```

## API Endpoints

### Monitoring Data
- `POST /api/monitoring/data` - Receive monitoring data from clients

### Employee Management
- `GET /api/employees` - Get all employees with summary
- `GET /api/employees/:name` - Get detailed employee data

### Screenshots
- `GET /api/screenshots/:id` - Get screenshot by ID

### Configuration Management
- `GET /api/config/client/:employeeName` - Get client configuration
- `GET /api/config/client/:employeeName/version` - Get configuration version
- `PUT /api/config/client/:employeeName` - Update client configuration
- `GET /api/config/defaults` - Get default configuration values

### File Transfer
- `POST /api/files/upload` - Upload file for OTA distribution
- `GET /api/files/list` - List available files for employee
- `GET /api/files/download/:fileId` - Download file

For detailed documentation on remote configuration, see [REMOTE_CONFIG.md](./REMOTE_CONFIG.md).

## Environment Variables

See `.env.example` for all available configuration options.

## License

ISC
