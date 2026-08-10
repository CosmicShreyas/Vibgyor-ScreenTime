import type { StatInsightDetails } from './StatInsightModal'

interface MetricExplanation {
  calculation: string
  interpretation: string
}

const explanations: Record<string, MetricExplanation> = {
  employees: {
    calculation: 'Count the employee records returned for the current organization or manager scope. On Timesheets, this includes employees with zero activity so absences and week offs remain visible.',
    interpretation: 'This is the population represented by the page, not a count of people who were productive or online.',
  },
  'total employees': {
    calculation: 'Count all employee records returned for the current organization or manager scope.',
    interpretation: 'Use this as the workforce denominator. It is not filtered by current activity unless the page explicitly says so.',
  },
  active: {
    calculation: 'Count employees whose latest client heartbeat is less than two minutes old and whose monitoring-paused flag is off.',
    interpretation: 'Active confirms a live client connection. It does not by itself prove recent keyboard/mouse input or productive work.',
  },
  online: {
    calculation: 'Count employees whose latest client heartbeat is less than two minutes old and whose monitoring-paused flag is off.',
    interpretation: 'Online is connection status, not a productivity or interaction-quality judgment.',
  },
  idle: {
    calculation: 'Count employees whose most recent client update is at least two minutes but less than sixty minutes old.',
    interpretation: 'This describes connection recency. It is separate from the idle-duration metric recorded after the configured no-input threshold.',
  },
  'offline / idle': {
    calculation: 'Count employees currently classified as either idle or offline from their latest heartbeat age.',
    interpretation: 'A larger value means fewer clients can be confirmed as live now; previously recorded time remains unchanged.',
  },
  offline: {
    calculation: 'Count employees whose latest client heartbeat is sixty minutes old or older.',
    interpretation: 'Offline means the server cannot confirm a current connection. It does not erase historical activity.',
  },
  paused: {
    calculation: 'Count recently connected employees whose monitoring-paused flag is enabled.',
    interpretation: 'The client is connected, but activity and evidence collection are suspended until monitoring resumes.',
  },
  'total work time': {
    calculation: 'Sum uploaded work seconds across employees for the selected reporting range after the client applies its activity and integrity rules.',
    interpretation: 'This is accumulated active time, not a measure of output quality. Compare it with idle time and application context.',
  },
  'work time': {
    calculation: 'Sum the employee’s uploaded work seconds across every activity interval in the selected date range.',
    interpretation: 'Work time means the client observed active time. It does not automatically mean the applications were categorized as productive.',
  },
  'idle time': {
    calculation: 'Sum uploaded idle seconds across the selected range, including periods classified as inactive by the client’s configured input threshold.',
    interpretation: 'Idle time can reflect breaks, meetings, reading, or time away. Treat it as context, not automatic underperformance.',
  },
  productivity: {
    calculation: 'Score = (productive seconds + 0.5 × neutral seconds) ÷ (productive + neutral + unproductive seconds) × 100, rounded to a whole percent.',
    interpretation: 'Productive time gets full credit, neutral time half credit, and unproductive time no credit. It describes application mix—not work quality or intent.',
  },
  'avg productivity': {
    calculation: 'Calculate each reporting employee’s productivity score, then take the arithmetic mean of those employee scores.',
    interpretation: 'Use this as a team-level application-mix signal. Averages can hide large differences between employees, so inspect the supporting rows.',
  },
  'active alerts': {
    calculation: 'Count unresolved alert records generated for the selected employee and reporting period.',
    interpretation: 'A higher value means more exceptions need review; it does not mean every alert is confirmed misconduct or a system failure.',
  },
  'open alerts': {
    calculation: 'Count all unresolved alerts inside the selected date and employee scope.',
    interpretation: 'Open alerts are a review queue. Validate the underlying activity before drawing conclusions.',
  },
  critical: {
    calculation: 'Count unresolved alerts whose server-assigned severity is critical.',
    interpretation: 'Critical alerts are prioritized for immediate review, but severity is still a rule-based signal rather than a final determination.',
  },
  warnings: {
    calculation: 'Count unresolved alerts whose server-assigned severity is warning.',
    interpretation: 'Warnings indicate a configured threshold was crossed and should be read with the employee and time context.',
  },
  'people affected': {
    calculation: 'Count distinct employee names represented by the currently displayed unresolved alerts.',
    interpretation: 'This removes duplicate alerts for the same person, showing breadth rather than total alert volume.',
  },
  'daily insights': {
    calculation: 'Count the rule-generated narrative observations returned for the selected reporting period.',
    interpretation: 'Insights summarize patterns worth noticing. They are prompts for investigation, not independent performance scores.',
  },
  'productive hours': {
    calculation: 'Sum uploaded work seconds for all employees across the selected timesheet period, then convert the result to hours.',
    interpretation: 'On Timesheets this means observed active work time. It is separate from the application-category productivity score.',
  },
  'tracked hours': {
    calculation: 'Sum each timesheet row’s productive/work, idle, and attended-day offline shift remainder for the selected period. Week offs receive no offline padding.',
    interpretation: 'Use this as a scheduled-time ledger total. Open the daily rows to distinguish observed activity, idle time, and offline remainder.',
  },
  'at-risk of burnout': {
    calculation: 'Count employees above the low-risk threshold after adding weighted signals for long average days, after-hours work, weekend work, and long no-break streaks; each risk score is capped at 100.',
    interpretation: 'This is a wellbeing prompt for supportive review, not a medical diagnosis or disciplinary score.',
  },
  'anomalies today': {
    calculation: 'Count today’s behavior signals that fall outside each employee’s recent personal baseline, including productivity changes, activity spikes/dips, or unusual working hours.',
    interpretation: 'An anomaly means unusual for that person—not inherently bad, fraudulent, or unproductive.',
  },
  'team median focus': {
    calculation: 'Sort reporting employees by qualifying focus minutes and take the middle value, rounded to the nearest minute.',
    interpretation: 'The median describes a typical team member and is less affected by extreme values than an average.',
  },
  'team size active': {
    calculation: 'Count employees with reporting data included in today’s team-pulse calculation.',
    interpretation: 'This is the sample size behind the team comparisons, not the entire registered workforce.',
  },
  'flow score': {
    calculation: 'For the latest selected day: clamp 0–100 after calculating (focus minutes × 0.6) − (context switches × 1.5) + (longest focus block minutes × 0.4).',
    interpretation: 'Higher values indicate longer and less fragmented deep-work patterns. The score does not assess the quality or business value of the work.',
  },
  'avg focus / day': {
    calculation: 'Add minutes from uninterrupted work blocks lasting at least 15 minutes, then divide by the number of active days. A gap longer than three minutes ends a block.',
    interpretation: 'This isolates sustained-focus time, so it is normally lower than total work time.',
  },
  'avg switches / day': {
    calculation: 'Count changes in the dominant foreground application for each active day, then take the arithmetic mean across active days.',
    interpretation: 'Fewer switches can suggest less fragmented work, but legitimate multi-application workflows naturally produce higher values.',
  },
  'best focus day': {
    calculation: 'Find the selected-range day with the greatest total duration of qualifying focus blocks of at least 15 minutes.',
    interpretation: 'Use this to identify the strongest sustained-focus day in the range, not necessarily the day with the most total work.',
  },
}

const genericExplanation: MetricExplanation = {
  calculation: 'Use the records shown in the supporting breakdown and aggregate them for the selected employee, date range, and access scope.',
  interpretation: 'Read this value together with its scope and supporting rows. It is a descriptive signal and should not be used as a standalone judgment.',
}

export function enrichStatInsightDetails(label: string, details?: StatInsightDetails): StatInsightDetails {
  const key = label.trim().toLowerCase()
  const defaults = explanations[key]
    ?? (key.includes('productivity') ? explanations.productivity : undefined)
    ?? genericExplanation

  return {
    ...details,
    calculation: details?.calculation ?? defaults.calculation,
    interpretation: details?.interpretation ?? defaults.interpretation,
  }
}
