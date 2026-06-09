// Analytics types

export interface FunnelData {
  contacted: { count: number; percent: number };
  opened: { count: number; percent: number };
  interaction: { count: number; percent: number };
  answered: { count: number; percent: number };
  interested: { count: number; percent: number };
  interrupted: { count: number; percent: number };
}

export interface SummaryData {
  totalLeads: number;
  launchedLeads: number;
  reachedLeads: number;
  deliveredPercent: number;
  messagesSent: number;
  messagesFailed: number;
}

export interface StepAnalytics {
  stepId: string;
  stepOrder: number;
  sent: number;
  opened: { count: number; percent: number };
  clicked: { count: number; percent: number };
  replied: { count: number; percent: number };
  booked: { count: number; percent: number };
}

export interface NegativeSignal {
  stepId: string;
  stepOrder: number;
  notSent: number;
  bounced: number;
  unsubscribed: number;
  notInterested: number;
}
