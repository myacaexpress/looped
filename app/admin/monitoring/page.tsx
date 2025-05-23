import { Metadata } from 'next';
import MonitoringDashboard from '@/components/admin/MonitoringDashboard';

export const metadata: Metadata = {
  title: 'System Monitoring - Admin Dashboard',
  description: 'Monitor system health, performance metrics, and alerts',
};

export default function MonitoringPage() {
  return <MonitoringDashboard />;
}
