'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Send, ShieldCheck, CheckCircle, Bell, Zap, LayoutDashboard, Settings, HelpCircle, Menu, X, Sun, Moon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const BACKEND_URL = process.env.REVENUE_AI_API || 'http://localhost:8000';

interface AuditLog {
  log_id: string;
  timestamp: string;
  txn_id: string;
  root_cause_diagnosed: string;
  action_taken: string;
  message_sent: string;
  status: string;
  money_recovered: boolean;
}

interface WebhookPayload {
  user_name: string;
  user_email: string;
  user_phone: string;
  amount: number;
  status: string;
  error_code: string | null;
}

interface WebhookResponse {
  halted: boolean;
  halt_reason?: string;
  action_taken: string;
  root_cause: string;
  message_sent: string;
}

const COLORS = ['#4361ee', '#3f37c9', '#4895ef', '#4cc9f0', '#7209b7'];
const NEON_LIME = '#a3e635';

export default function Dashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalRecovered, setTotalRecovered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookResult, setWebhookResult] = useState<WebhookResponse | null>(null);
  const [autoGenerateLoading, setAutoGenerateLoading] = useState(false);
  const [autoGenerateResult, setAutoGenerateResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(false);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Webhook form state
  const [formData, setFormData] = useState<WebhookPayload>({
    user_name: 'Aarav Sharma',
    user_email: 'aarav.sharma@example.com',
    user_phone: '+919810012345',
    amount: 2499,
    status: 'failed',
    error_code: 'INSUFFICIENT_FUNDS',
  });

  // Fetch data from backend
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/audit-logs`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setLogs(data.logs || []);
      setTotalRecovered(data.total_recovered || 0);
    } catch (err) {
      setError('Failed to connect to backend. Make sure the FastAPI server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleWebhookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookLoading(true);
    setWebhookResult(null);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/webhook/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Webhook failed');

      const result = await response.json();
      setWebhookResult(result);
      fetchLogs(); // Refresh data
    } catch (err) {
      setError('Failed to trigger webhook. Check backend connection.');
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleMarkRecovered = async (logId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/audit-log/${logId}/mark-recovered`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark as recovered');
      fetchLogs();
    } catch (err) {
      setError('Failed to mark as recovered');
    }
  };

  const handleDeletePerformanceData = async () => {
    if (!confirm('Are you sure you want to delete all performance data? This cannot be undone.')) {
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/performance-data`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete performance data');
      fetchLogs(); // Refresh data
    } catch (err) {
      setError('Failed to delete performance data');
    }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerateLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/auto-generate?count=5`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to auto-generate transactions');
      const result = await response.json();
      fetchLogs(); // Refresh data
      setAutoGenerateResult(result);
    } catch (err) {
      setError('Failed to auto-generate transactions');
    } finally {
      setAutoGenerateLoading(false);
    }
  };

  // Calculate metrics
  const interventions = logs.filter(l => !l.action_taken.startsWith('HALT')).length;
  const halted = logs.filter(l => l.action_taken.startsWith('HALT')).length;
  const recoveredCount = logs.filter(l => l.money_recovered).length;

  // Chart data
  const actionData = logs.reduce((acc, log) => {
    const existing = acc.find(a => a.action_taken === log.action_taken);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ action_taken: log.action_taken, count: 1 });
    }
    return acc;
  }, [] as { action_taken: string; count: number }[]);

  const causeData = logs.reduce((acc, log) => {
    const existing = acc.find(c => c.root_cause === log.root_cause_diagnosed);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ root_cause: log.root_cause_diagnosed, count: 1 });
    }
    return acc;
  }, [] as { root_cause: string; count: number }[]);

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-[#0a0a0a]' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <div className={`animate-spin rounded-full h-10 w-10 border-b-2 mx-auto ${darkMode ? 'border-[#a3e635]' : 'border-blue-600'}`}></div>
          <p className={`mt-3 text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'settings':
        return (
          <div className="px-3 py-4 md:p-6">
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
            <div className={`space-y-4 ${darkMode ? 'bg-[#111111] border border-gray-800' : 'bg-white border border-gray-200'} rounded-md p-3 md:p-4`}>
              <div>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>General Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Dark Mode</span>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className={`w-12 h-6 rounded-full p-1 transition-colors ${darkMode ? 'bg-[#a3e635]' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full transition-transform ${darkMode ? 'translate-x-6 bg-white' : 'bg-white'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Email Notifications</span>
                    <button className={`w-12 h-6 rounded-full p-1 transition-colors ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>SMS Notifications</span>
                    <button className={`w-12 h-6 rounded-full p-1 transition-colors ${darkMode ? 'bg-[#a3e635]' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 rounded-full transition-transform bg-white ${darkMode ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="border-t pt-4" style={{ borderColor: darkMode ? '#333' : '#e5e7eb' }}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>API Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}>Backend URL</label>
                    <input
                      type="text"
                      defaultValue={BACKEND_URL}
                      className={`w-full px-3 py-2 rounded-md border ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>
                </div>
              </div>
              <div className="border-t pt-4" style={{ borderColor: darkMode ? '#333' : '#e5e7eb' }}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Data Management</h3>
                <div className="space-y-3">
                  <button
                    onClick={handleDeletePerformanceData}
                    className="w-full bg-red-600 text-white py-2 px-3 rounded-md font-semibold hover:bg-red-700 transition-colors text-sm"
                  >
                    Delete Performance Data
                  </button>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    This will delete all audit logs, transactions, and users. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'help':
        return (
          <div className="px-3 py-4 md:p-6">
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Help & Support</h2>
            <div className={`space-y-4 ${darkMode ? 'bg-[#111111] border border-gray-800' : 'bg-white border border-gray-200'} rounded-md p-3 md:p-4`}>
              <div>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Getting Started</h3>
                <ul className={`space-y-1.5 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• Set up your Supabase database using the provided SQL schema</li>
                  <li>• Configure environment variables in .env file</li>
                  <li>• Start the FastAPI backend server</li>
                  <li>• Use the Test Payment form to simulate failed transactions</li>
                </ul>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="px-2 py-2 md:p-6">
            {error && (
              <div className={`mb-4 rounded-md p-3 ${darkMode ? 'bg-red-900/50 border border-red-800' : 'bg-red-50 border border-red-200'}`}>
                <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{error}</p>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-[3%] mb-4">
              <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Money Recovered</p>
                    <p className={`text-lg md:text-xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>₹{totalRecovered.toLocaleString()}</p>
                  </div>
                  <div className={`p-1 rounded-md ${darkMode ? 'bg-[#a3e635]/10' : 'bg-purple-100'}`}>
                    <DollarSign className={`w-3.5 h-3.5 ${darkMode ? 'text-[#a3e635]' : 'text-purple-600'}`} />
                  </div>
                </div>
              </div>

              <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Interventions</p>
                    <p className={`text-lg md:text-xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{interventions}</p>
                  </div>
                  <div className={`p-1 rounded-md ${darkMode ? 'bg-blue-500/10' : 'bg-blue-100'}`}>
                    <Send className={`w-3.5 h-3.5 ${darkMode ? 'text-blue-500' : 'text-blue-600'}`} />
                  </div>
                </div>
              </div>

              <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Halted</p>
                    <p className={`text-lg md:text-xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{halted}</p>
                  </div>
                  <div className={`p-1 rounded-md ${darkMode ? 'bg-yellow-500/10' : 'bg-yellow-100'}`}>
                    <ShieldCheck className={`w-3.5 h-3.5 ${darkMode ? 'text-yellow-500' : 'text-yellow-600'}`} />
                  </div>
                </div>
              </div>

              <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Recovered</p>
                    <p className={`text-lg md:text-xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{recoveredCount}</p>
                  </div>
                  <div className={`p-1 rounded-md ${darkMode ? 'bg-green-500/10' : 'bg-green-100'}`}>
                    <CheckCircle className={`w-3.5 h-3.5 ${darkMode ? 'text-green-500' : 'text-green-600'}`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-3 md:space-y-4 lg:space-y-6">
                {/* Charts */}
                <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                  <h2 className={`text-base font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Analytics</h2>
                  
                  {actionData.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      <div>
                        <h3 className={`text-xs font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Actions Distribution</h3>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={actionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#333' : '#e5e7eb'} />
                            <XAxis dataKey="action_taken" stroke={darkMode ? '#666' : '#666'} tick={{fontSize: 10}} />
                            <YAxis stroke={darkMode ? '#666' : '#666'} tick={{fontSize: 10}} />
                            <Tooltip contentStyle={{ backgroundColor: darkMode ? '#111' : '#fff', border: '1px solid #333', borderRadius: '6px', fontSize: 12 }} />
                            <Bar dataKey="count" fill="#a3e635" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className={`text-xs font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Root Causes</h3>
                        <ResponsiveContainer width="100%" height={140}>
                          <PieChart>
                            <Pie
                              data={causeData}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={60}
                              paddingAngle={5}
                              dataKey="count"
                              stroke="none"
                            >
                              {causeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: darkMode ? '#111' : '#fff', border: '1px solid #333', borderRadius: '6px', fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-center py-6 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      <p className="text-sm">No data to display. Trigger a webhook to see analytics.</p>
                    </div>
                  )}
                </div>

                {/* Audit Trail */}
                <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4`}>
                  <h2 className={`text-base font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Audit Trail</h2>
                  
                  {logs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                            <th className={`text-left py-2 px-3 text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Timestamp</th>
                            <th className={`text-left py-2 px-3 text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Action</th>
                            <th className={`text-left py-2 px-3 text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Root Cause</th>
                            <th className={`text-left py-2 px-3 text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Status</th>
                            <th className={`text-left py-2 px-3 text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Recovered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log) => (
                            <tr key={log.log_id} className={`border-b ${darkMode ? 'border-gray-800 hover:bg-gray-900/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <td className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className={`py-2 px-3 text-xs ${darkMode ? 'text-white' : 'text-gray-900'}`}>{log.action_taken}</td>
                              <td className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{log.root_cause_diagnosed}</td>
                              <td className="py-2 px-3 text-xs">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  log.status === 'recovered' ? `${darkMode ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-green-100 text-green-800'}` :
                                  log.status === 'halted' ? `${darkMode ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-yellow-100 text-yellow-800'}` :
                                  `${darkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-blue-100 text-blue-800'}`
                                } ${darkMode ? 'border' : ''}`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-xs">
                                {!log.money_recovered && (
                                  <button
                                    onClick={() => handleMarkRecovered(log.log_id)}
                                    className="text-[#a3e635] hover:text-[#a3e635]/80 text-xs font-medium"
                                  >
                                    Mark Recovered
                                  </button>
                                )}
                                {log.money_recovered && (
                                  <span className="text-green-500 text-xs">✓</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`text-center py-6 border-2 border-dashed rounded-md ${darkMode ? 'text-gray-500 border-gray-800' : 'text-gray-500 border-gray-200'}`}>
                      <Bell className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                      <p className="text-sm">No audit logs yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar - Webhook Form */}
              <div className="lg:col-span-1">
                <div className={`${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border rounded-md p-3 md:p-4 sticky top-6`}>
                  <h2 className={`text-base font-semibold mb-2 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <Bell className="w-4 h-4 text-[#a3e635]" />
                    Test Payment
                  </h2>
                  <p className={`text-xs mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Simulate failed payment events</p>

                  <form onSubmit={handleWebhookSubmit} className="space-y-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}>Customer Details</label>
                      <input
                        type="text"
                        value={formData.user_name}
                        onChange={(e) => setFormData({ ...formData, user_name: e.target.value })}
                        className={`w-full px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        placeholder="Full Name"
                      />
                      <input
                        type="email"
                        value={formData.user_email}
                        onChange={(e) => setFormData({ ...formData, user_email: e.target.value })}
                        className={`w-full mt-2 px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        placeholder="Email Address"
                      />
                      <input
                        type="text"
                        value={formData.user_phone}
                        onChange={(e) => setFormData({ ...formData, user_phone: e.target.value })}
                        className={`w-full mt-2 px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        placeholder="Phone Number"
                      />
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}>Payment Details</label>
                      <input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        placeholder="Amount (₹)"
                      />
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className={`w-full mt-2 px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      >
                        <option value="failed" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Failed</option>
                        <option value="abandoned" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Abandoned</option>
                      </select>
                      <select
                        value={formData.error_code || ''}
                        onChange={(e) => setFormData({ ...formData, error_code: e.target.value })}
                        className={`w-full mt-2 px-3 py-2 rounded-md border focus:ring-1 focus:ring-[#a3e635] focus:border-[#a3e635] text-sm ${darkMode ? 'bg-[#0a0a0a] border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      >
                        <option value="INSUFFICIENT_FUNDS" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Insufficient Funds</option>
                        <option value="GATEWAY_TIMEOUT" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Gateway Timeout</option>
                        <option value="CARD_DECLINED" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Card Declined</option>
                        <option value="CARD_EXPIRED" className={darkMode ? 'bg-[#111]' : 'bg-white'}>Card Expired</option>
                        <option value="" className={darkMode ? 'bg-[#111]' : 'bg-white'}>None</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={webhookLoading}
                      className="w-full bg-[#a3e635] text-[#0a0a0a] py-2 px-3 text-xs rounded-md font-semibold hover:bg-[#a3e635]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 md:py-2 md:px-4 md:text-sm"
                    >
                      {webhookLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#0a0a0a]"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3" />
                          Trigger Recovery
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoGenerate}
                      disabled={autoGenerateLoading}
                      className="w-full mt-2 bg-[#a3e635] text-[#0a0a0a] py-2 px-3 text-xs rounded-md font-semibold hover:bg-[#a3e635]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 md:py-2 md:px-4 md:text-sm"
                    >
                      {autoGenerateLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#0a0a0a]"></div>
                          Auto-Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3" />
                          Auto-Generate 5 Transactions
                        </>
                      )}
                    </button>
                  </form>

                  {webhookResult && (
                    <div className={`mt-3 p-2 md:p-3 rounded-md border ${
                      webhookResult.halted ? `${darkMode ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'}` : `${darkMode ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200'}`
                    }`}>
                      {webhookResult.halted ? (
                        <>
                          <p className={`text-xs font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-800'}`}>Recovery Halted</p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>{webhookResult.halt_reason}</p>
                        </>
                      ) : (
                        <>
                          <p className={`text-xs font-medium ${darkMode ? 'text-green-400' : 'text-green-800'}`}>Recovery Action: {webhookResult.action_taken}</p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                            <strong>Root Cause:</strong> {webhookResult.root_cause}
                          </p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                            <strong>Message:</strong> {webhookResult.message_sent}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {autoGenerateResult && (
                    <div className={`mt-3 p-2 md:p-3 rounded-md border ${darkMode ? 'bg-[#a3e635]/10 border-[#a3e635]/30' : 'bg-[#a3e635]/10 border-[#a3e635]/30'}`}>
                      <p className={`text-xs font-medium ${darkMode ? 'text-[#a3e635]' : 'text-[#a3e635]'}`}>Auto-Generation Complete</p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <strong>Total Generated:</strong> {autoGenerateResult.total_generated}
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <strong>Processed by AI:</strong> {autoGenerateResult.processed}
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <strong>Halted:</strong> {autoGenerateResult.halted}
                      </p>
                    </div>
                  )}

                  <div className={`mt-4 pt-3 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Backend: <code className={`px-1.5 py-0.5 rounded ${darkMode ? 'bg-[#0a0a0a] text-[#a3e635]' : 'bg-gray-100 text-blue-600'}`}>{BACKEND_URL}</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* How This Platform Helps Razorpay */}
            <div className={`mt-12 rounded-md p-6 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
              <h2 className={`text-xl font-bold mb-4 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>How This Platform Helps Razorpay</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border ${darkMode ? 'bg-[#a3e635]/10 border-[#a3e635]/30' : 'bg-purple-100 border-purple-300'}`}>
                    <Zap className={`w-6 h-6 ${darkMode ? 'text-[#a3e635]' : 'text-purple-600'}`} />
                  </div>
                  <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Revenue Recovery</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Automatically recover failed payments using AI-powered diagnosis and personalized recovery messages.</p>
                </div>
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border ${darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-100 border-blue-300'}`}>
                    <ShieldCheck className={`w-6 h-6 ${darkMode ? 'text-blue-500' : 'text-blue-600'}`} />
                  </div>
                  <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Spam Protection</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Built-in safeguards prevent over-communication with customers, protecting brand reputation.</p>
                </div>
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border ${darkMode ? 'bg-green-500/10 border-green-500/30' : 'bg-green-100 border-green-300'}`}>
                    <CheckCircle className={`w-6 h-6 ${darkMode ? 'text-green-500' : 'text-green-600'}`} />
                  </div>
                  <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Real-time Analytics</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Track recovery metrics, intervention success rates, and revenue impact in real-time dashboard.</p>
                </div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-12">
              <h2 className={`text-xl font-bold mb-6 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>Frequently Asked Questions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>How does the AI diagnose payment failures?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>The AI analyzes error codes, transaction patterns, and customer history to identify root causes like insufficient funds, card issues, or gateway timeouts.</p>
                </div>
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>What recovery actions does it take?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Based on diagnosis, it sends personalized SMS, email, or WhatsApp messages with appropriate payment links, reminders, or alternative payment options.</p>
                </div>
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>How does spam protection work?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>The system tracks intervention attempts per customer and halts after reaching the configured limit. It also respects existing promise-to-pay commitments.</p>
                </div>
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Can I customize recovery messages?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Yes, the AI generates context-aware messages that can be customized based on your brand voice and specific recovery strategies.</p>
                </div>
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>What payment gateways are supported?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>The platform integrates with Razorpay and other major payment gateways via webhooks, supporting all standard error codes and failure reasons.</p>
                </div>
                <div className={`rounded-md p-4 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border`}>
                  <h3 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>How do I track recovery success?</h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>The dashboard provides real-time metrics including total money recovered, intervention success rates, and detailed audit trails for every recovery action.</p>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`h-screen flex font-sans ${darkMode ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
      {/* Mobile Header - Always visible on mobile */}
      <div className={`md:hidden fixed top-0 left-0 right-0 flex items-center justify-between p-3 border-b ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} z-30`}>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#a3e635]" />
          <span className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Revenue AI</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`p-1.5 rounded-md ${darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 transform transition-transform duration-300 z-50 w-56 ${darkMode ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-200'} border-r flex flex-col h-screen md:relative md:translate-x-0 md:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className={`p-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#a3e635]" />
            {sidebarOpen && <span className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Revenue AI</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => {
              setActiveSection('dashboard');
              if (isMobile) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              activeSection === 'dashboard' ? 'bg-[#a3e635]/10 text-[#a3e635]' : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            {sidebarOpen && <span className="text-sm font-medium">Dashboard</span>}
          </button>
          <button
            onClick={() => {
              setActiveSection('settings');
              if (isMobile) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              activeSection === 'settings' ? 'bg-[#a3e635]/10 text-[#a3e635]' : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            {sidebarOpen && <span className="text-sm font-medium">Settings</span>}
          </button>
          <button
            onClick={() => {
              setActiveSection('help');
              if (isMobile) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              activeSection === 'help' ? 'bg-[#a3e635]/10 text-[#a3e635]' : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            {sidebarOpen && <span className="text-sm font-medium">Help</span>}
          </button>
        </nav>

        {/* Toggle Sidebar */}
        <div className={`p-3 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-3 pt-16 md:p-4 md:pt-4 lg:p-6">
        {renderContent()}
      </main>
    </div>
  );
}
