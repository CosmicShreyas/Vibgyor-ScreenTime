# Employee Monitoring Dashboard

A modern, responsive React dashboard for monitoring employee activity in real-time. Built with React, TypeScript, Vite, and TailwindCSS.

## Features

- 🔐 **Authentication** - Secure login with JWT tokens
- 🌓 **Dark/Light Mode** - Toggle between themes with localStorage persistence
- 📊 **Real-time Dashboard** - Live employee statistics and activity monitoring
- 👥 **Employee Management** - View all employees with status indicators
- 📈 **Detailed Analytics** - Individual employee activity charts and timelines
- 🖼️ **Screenshot Gallery** - View captured screenshots with full-screen preview
- 🔔 **Toast Notifications** - User-friendly feedback for all actions
- 🔄 **WebSocket Support** - Real-time updates via WebSocket connection
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Recharts** - Data visualization
- **Lucide React** - Icon library
- **React Hot Toast** - Toast notifications
- **date-fns** - Date utilities

## Prerequisites

- Node.js 18+ and npm
- Running monitoring server (see `monitoring-server` directory)

## Installation

1. Navigate to the dashboard directory:
```bash
cd monitoring-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## Default Credentials

- **Username:** admin
- **Password:** admin123

## Configuration

The dashboard is configured to proxy API requests to `http://localhost:5000`. If your server runs on a different port, update `vite.config.ts`:

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:YOUR_PORT',
      changeOrigin: true,
    },
  },
}
```

## Build for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

## Preview Production Build

```bash
npm run preview
```

## Project Structure

```
monitoring-dashboard/
├── src/
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React contexts (Auth, Theme)
│   ├── layouts/           # Layout components
│   ├── pages/             # Page components
│   ├── services/          # API and WebSocket services
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main app component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html             # HTML template
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── vite.config.ts         # Vite config
└── tailwind.config.js     # TailwindCSS config
```

## Features Overview

### Dashboard Page
- Total employees count
- Online/offline status
- Total work time
- Application usage pie chart
- Online employees list

### Employees Page
- Searchable employee list
- Status indicators (active/idle/offline)
- Work and idle time tracking
- Last update timestamps
- Quick access to employee details

### Employee Detail Page
- Activity timeline chart (24 hours)
- Application usage breakdown
- Current applications list
- Active browser tabs
- Recent screenshots gallery
- Interactive charts and visualizations

### Screenshots Page
- Filter by employee
- Grid view of screenshots
- Full-screen image preview
- Timestamp information

## API Integration

The dashboard integrates with the following API endpoints:

- `POST /api/auth/login` - Authentication
- `GET /api/employees` - List all employees
- `GET /api/employees/:name` - Employee details
- `GET /api/screenshots/:id` - Screenshot image
- `WebSocket /ws` - Real-time updates

## Theme Support

The dashboard supports both light and dark modes:
- Toggle via sidebar button
- Preference saved to localStorage
- Automatic theme application on load
- Smooth transitions between themes

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

MIT
