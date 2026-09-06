import React, { useState, useMemo, useEffect } from 'react';
import { Settings, LayoutDashboard, History, Check, X, Calculator, TrendingUp } from 'lucide-react';

// Utility function to format currency
const formatCurrency = (amount: number): string => {
  if (isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Custom hook for local storage with optional runtime sanitization.
function useLocalStorage<T>(
  key: string,
  initialValue: T,
  sanitize?: (value: unknown) => T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed: unknown = JSON.parse(item);
      return sanitize ? sanitize(parsed) : (parsed as T);
    } catch (error) {
      console.warn(`Could not read localStorage key "${key}"`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const valueToStore = sanitize ? sanitize(storedValue) : storedValue;
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn(`Could not write localStorage key "${key}"`, error);
    }
  }, [key, sanitize, storedValue]);

  return [storedValue, setStoredValue];
}

// Date-only helpers. Never parse YYYY-MM-DD with new Date(string), because
// that is interpreted as UTC and can display the previous day in some timezones.
const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const formatDateToYYYYMMDD = (date: Date): string => {
  if (isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addMonthsKeepingDay = (date: Date, months: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const isValidDateString = (value: unknown): value is string => typeof value === 'string' && parseDateOnly(value) !== null;

// Prevent number inputs from changing when the user scrolls over them.
const handleWheelBlur = (e: React.WheelEvent<HTMLInputElement>) => {
  e.currentTarget.blur();
};

interface PaySettings {
  userName: string;
  baseSalary: string | number;
  goalSalary: string | number;
  workingDays: string | number;
  hoursPerDay: string | number;
  otGoal: string | number;
  cycleStartDay: string | number;
  cycleEndDay: string | number;
}

interface OTRecord {
  date: string;
  hours: number;
}

interface SettingsValidation {
  isValid: boolean;
  errors: string[];
}

const getCycleLengthForStart = (startDay: number, endDay: number, year: number, month: number): number | null => {
  if (!Number.isInteger(startDay) || !Number.isInteger(endDay) || startDay < 1 || endDay < 1 || startDay > 28 || endDay > 31) return null;
  const startDate = new Date(year, month, startDay);
  if (startDate.getMonth() !== month) return null;

  if (endDay >= startDay) {
    const endDate = new Date(year, month, endDay);
    if (endDate.getMonth() !== month) return null;
    return endDay - startDay + 1;
  }

  const endDate = new Date(year, month + 1, endDay);
  const nextMonth = (month + 1) % 12;
  if (endDate.getMonth() !== nextMonth) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
};

const validatePaySettings = (settings: PaySettings): SettingsValidation => {
  const errors: string[] = [];
  const name = String(settings.userName ?? '').trim();
  const baseSalary = Number(settings.baseSalary);
  const goalSalary = Number(settings.goalSalary);
  const workingDays = Number(settings.workingDays);
  const hoursPerDay = Number(settings.hoursPerDay);
  const otGoal = Number(settings.otGoal);
  const cycleStartDay = Number(settings.cycleStartDay);
  const cycleEndDay = Number(settings.cycleEndDay);

  if (!name) errors.push('Name is required.');
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) errors.push('Basic monthly salary must be greater than ₹0.');
  if (!Number.isFinite(goalSalary) || goalSalary <= 0) errors.push('Goal salary must be greater than ₹0.');
  else if (Number.isFinite(baseSalary) && goalSalary <= baseSalary) errors.push('Goal salary must be higher than your basic salary.');
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 31) errors.push('Working days must be a whole number between 1 and 31.');
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) errors.push('Hours per day must be greater than 0 and no more than 24.');
  if (!Number.isFinite(otGoal) || otGoal < 0 || otGoal > 744) errors.push('OT goal must be between 0 and 744 hours.');
  if (!Number.isInteger(cycleStartDay) || cycleStartDay < 1 || cycleStartDay > 28) errors.push('Cycle start day must be a whole number between 1 and 28 so it exists every month.');
  if (!Number.isInteger(cycleEndDay) || cycleEndDay < 1 || cycleEndDay > 31) errors.push('Cycle end day must be a whole number between 1 and 31.');

  if (Number.isInteger(cycleStartDay) && Number.isInteger(cycleEndDay) && cycleStartDay >= 1 && cycleStartDay <= 28 && cycleEndDay >= 1 && cycleEndDay <= 31) {
    if (cycleStartDay <= cycleEndDay) {
      errors.push('Salary cycle must cross the month boundary (for example, 21st to 20th) so every calendar day belongs to a cycle.');
    }
    const lengths: number[] = [];
    for (let month = 0; month < 12; month++) {
      const length = getCycleLengthForStart(cycleStartDay, cycleEndDay, 2028, month);
      if (length === null) {
        errors.push('This salary cycle does not produce a valid date in every month.');
        break;
      }
      lengths.push(length);
    }
    if (lengths.length === 12 && lengths.some(length => length < 28 || length > 31)) {
      const uniqueLengths = [...new Set(lengths)].join(' or ');
      errors.push(`Salary cycle must be between 28 and 31 days. This combination creates ${uniqueLengths} days.`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

const DEFAULT_SETTINGS: PaySettings = {
  userName: '',
  baseSalary: '',
  goalSalary: '',
  workingDays: 22,
  hoursPerDay: 9,
  otGoal: 40,
  cycleStartDay: 21,
  cycleEndDay: 20
};

const normalizePaySettings = (value: unknown): PaySettings => {
  const raw = value && typeof value === 'object' ? value as Partial<Record<keyof PaySettings, unknown>> : {};
  const result: PaySettings = {
    userName: typeof raw.userName === 'string' ? raw.userName : DEFAULT_SETTINGS.userName,
    baseSalary: typeof raw.baseSalary === 'string' || typeof raw.baseSalary === 'number' ? raw.baseSalary : DEFAULT_SETTINGS.baseSalary,
    goalSalary: typeof raw.goalSalary === 'string' || typeof raw.goalSalary === 'number' ? raw.goalSalary : DEFAULT_SETTINGS.goalSalary,
    workingDays: typeof raw.workingDays === 'string' || typeof raw.workingDays === 'number' ? raw.workingDays : DEFAULT_SETTINGS.workingDays,
    hoursPerDay: typeof raw.hoursPerDay === 'string' || typeof raw.hoursPerDay === 'number' ? raw.hoursPerDay : DEFAULT_SETTINGS.hoursPerDay,
    otGoal: typeof raw.otGoal === 'string' || typeof raw.otGoal === 'number' ? raw.otGoal : DEFAULT_SETTINGS.otGoal,
    cycleStartDay: typeof raw.cycleStartDay === 'string' || typeof raw.cycleStartDay === 'number' ? raw.cycleStartDay : DEFAULT_SETTINGS.cycleStartDay,
    cycleEndDay: typeof raw.cycleEndDay === 'string' || typeof raw.cycleEndDay === 'number' ? raw.cycleEndDay : DEFAULT_SETTINGS.cycleEndDay,
  };
  return result;
};

const normalizeOTRecords = (value: unknown): OTRecord[] => {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, OTRecord>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { date?: unknown; hours?: unknown };
    if (!isValidDateString(raw.date)) continue;
    const hours = Number(raw.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    byDate.set(raw.date, { date: raw.date, hours });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export default function App() {
  // State Management
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSetupComplete, setIsSetupComplete] = useLocalStorage('ot_setupComplete', false);
  
  // Settings State
  const [paySettings, setPaySettings] = useLocalStorage<PaySettings>('ot_settings', DEFAULT_SETTINGS, normalizePaySettings);
const [isEditing, setIsEditing] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<PaySettings>(paySettings);
  const settingsValidation = validatePaySettings(settingsDraft);
  const paySettingsValidation = validatePaySettings(paySettings);

  // Records State: [{ date: '2023-10-25', hours: 4 }]
  const [otRecords, setOtRecords] = useLocalStorage<OTRecord[]>('ot_records', [], normalizeOTRecords);

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [otError, setOtError] = useState('');

  // Dashboard offset for viewing previous/next cycles
  const [cycleOffset, setCycleOffset] = useState(0);
  const [animatedDate, setAnimatedDate] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    if (!animatedDate) return;
    const timer = window.setTimeout(() => setAnimatedDate(null), 700);
    return () => window.clearTimeout(timer);
  }, [animatedDate, animationKey]);

  // Derived Rates
  const rates = useMemo(() => {
    const base = Number(paySettings.baseSalary) || 0;
    const days = Number(paySettings.workingDays) || 1;
    const hours = Number(paySettings.hoursPerDay) || 1;
    
    const hourlyRate = base / (days * hours);
    const otRate = hourlyRate * 2;
    
    return {
      hourlyRate,
      otRate,
      goalSalary: Number(paySettings.goalSalary) || 0,
      otGoal: Number(paySettings.otGoal) || 0
    };
  }, [paySettings]);

  // Salary-cycle engine. cycleOffset moves by complete salary cycles, not
  // by calendar months. Example: 21→20 gives 21 Aug–20 Sep, then
  // 21 Sep–20 Oct, etc.
  const getCycleStartForDate = (date: Date): Date => {
    const startDay = Number(paySettings.cycleStartDay);
    const endDay = Number(paySettings.cycleEndDay);
    if (!Number.isInteger(startDay) || !Number.isInteger(endDay) || startDay < 1 || startDay > 28 || endDay < 1 || endDay > 31) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    const candidate = new Date(date.getFullYear(), date.getMonth(), startDay);
    if (date >= candidate) return candidate;
    return new Date(date.getFullYear(), date.getMonth() - 1, startDay);
  };

  const getCycleDates = (offset: number = 0): { start: Date; end: Date } => {
    const today = new Date();
    const baseStart = getCycleStartForDate(today);
    const start = addMonthsKeepingDay(baseStart, offset);
    const end = Number(paySettings.cycleEndDay) >= Number(paySettings.cycleStartDay)
      ? new Date(start.getFullYear(), start.getMonth(), Number(paySettings.cycleEndDay))
      : new Date(start.getFullYear(), start.getMonth() + 1, Number(paySettings.cycleEndDay));
    return { start, end };
  };

  const { start: currentCycleStart, end: currentCycleEnd } = getCycleDates(cycleOffset);

  // Generate Array of dates for the current viewing cycle
  const cycleDays = useMemo(() => {
    const days = [];
    const current = new Date(currentCycleStart);
    // Safety check to prevent infinite loops if dates are messed up
    let loopCount = 0;
    while (current <= currentCycleEnd && loopCount < 32) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      loopCount++;
    }
    return days;
  }, [currentCycleStart, currentCycleEnd]);

  // Current Cycle Stats
  const currentCycleStats = useMemo(() => {
    const startStr = formatDateToYYYYMMDD(currentCycleStart);
    const endStr = formatDateToYYYYMMDD(currentCycleEnd);
    
    const cycleRecords = otRecords.filter(r => {
      return r.date >= startStr && r.date <= endStr;
    });

    const totalHours = cycleRecords.reduce((sum, r) => sum + r.hours, 0);
    const otEarnings = totalHours * rates.otRate;
    const baseSalary = Number(paySettings.baseSalary) || 0;
    const totalProjected = baseSalary + otEarnings;
    
    // Calculate required hours to hit goal
    const earningsNeeded = Math.max(0, rates.goalSalary - baseSalary);
    const hoursNeededForGoal = rates.otRate > 0 ? (earningsNeeded / rates.otRate) : 0;

    return { totalHours, otEarnings, totalProjected, hoursNeededForGoal };
  }, [otRecords, currentCycleStart, currentCycleEnd, rates, paySettings.baseSalary]);

  const handleDateClick = (dateStr: string): void => {
    setSelectedDate(dateStr);
    const existing = otRecords.find(r => r.date === dateStr);
    setCustomHours(existing ? existing.hours.toString() : '');
    setOtError('');
    setIsModalOpen(true);
  };

  const saveOtRecord = (hoursStr: string): void => {
    if (!selectedDate) {
      setOtError('Please select a date first.');
      return;
    }

    const hours = Number(hoursStr);

    if (!isNaN(hours) && (hours < 0 || hours > 24)) {
      setOtError('OT hours must be between 0 and 24 hours for one day.');
      return;
    }
    
    if (isNaN(hours) || hours <= 0) {
      // Remove record if 0 or cleared
      setOtRecords(prev => prev.filter(r => r.date !== selectedDate));
    } else {
      // Add or update and trigger a small celebration animation on that day.
      setOtRecords(prev => {
        const filtered = prev.filter(r => r.date !== selectedDate);
        return [...filtered, { date: selectedDate, hours }];
      });
      setAnimatedDate(selectedDate);
      setAnimationKey(prev => prev + 1);
    }
    setIsModalOpen(false);
    setCustomHours('');
    setOtError('');
  };

  if (!isSetupComplete) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Setup</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={paySettings.userName}
                onChange={(e) => setPaySettings(prev => ({ ...prev, userName: e.target.value }))}
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Basic Monthly Salary (₹)</label>
              <input
                type="number"
                onWheel={handleWheelBlur}
                value={paySettings.baseSalary}
                onChange={(e) => setPaySettings(prev => ({ ...prev, baseSalary: e.target.value }))}
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Goal Salary (₹)</label>
              <input
                type="number"
                onWheel={handleWheelBlur}
                value={paySettings.goalSalary}
                onChange={(e) => setPaySettings(prev => ({ ...prev, goalSalary: e.target.value }))}
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Cycle Start Day</label>
                <input
                  type="number"
                  onWheel={handleWheelBlur}
                  min="1" max="31"
                  value={paySettings.cycleStartDay}
                  onChange={(e) => setPaySettings(prev => ({ ...prev, cycleStartDay: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Cycle End Day</label>
                <input
                  type="number"
                  onWheel={handleWheelBlur}
                  min="1" max="31"
                  value={paySettings.cycleEndDay}
                  onChange={(e) => setPaySettings(prev => ({ ...prev, cycleEndDay: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400 transition-colors"
                />
              </div>
            </div>

            {!paySettingsValidation.isValid && (
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold mb-1">Please fix these settings:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {paySettingsValidation.errors.map(error => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <button
              onClick={() => { if (paySettingsValidation.isValid) { setPaySettings(normalizePaySettings(paySettings)); setCycleOffset(0); setIsSetupComplete(true); } }}
              disabled={!paySettingsValidation.isValid}
              className="w-full py-4 mt-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderDashboard = () => {
    // Generate empty days to pad the calendar grid so the 1st of the cycle starts on the correct weekday
    const firstDayOfWeek = currentCycleStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const blanksArray = Array.from({ length: firstDayOfWeek });
    
    // Calculate goal progress based on dynamic hours needed
    const goalHours = Math.ceil(currentCycleStats.hoursNeededForGoal);
    const progressPercent = goalHours > 0 ? Math.min((currentCycleStats.totalHours / goalHours) * 100, 100) : 100;

    const getMotivationMessage = (): string => {
      if (goalHours <= 0) return 'Set your goal and start stacking the hours.';
      if (progressPercent >= 100) return 'Goal crushed! Every extra hour is bonus. 🔥';
      if (progressPercent >= 75) return 'You’re in the final stretch. Finish strong! 💪';
      if (progressPercent >= 50) return 'Halfway there. Keep the momentum going! 🚀';
      if (progressPercent >= 25) return 'Great start. Keep stacking those hours! ⚡';
      if (progressPercent > 0) return 'Every hour counts. Keep pushing forward! 🌟';
      return 'Your first hour starts the climb. Let’s do this! 💪';
    };
    const motivationMessage = getMotivationMessage();
    
    const safeDate = (d: Date): Date => isNaN(d.getTime()) ? new Date() : d;
    const cycleHeader = `${safeDate(currentCycleStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${safeDate(currentCycleEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return (
      <div className="h-[calc(100svh-4.5rem)] overflow-hidden flex flex-col animate-in fade-in duration-300">
        {/* Header */}
        <header className="px-6 pt-3 pb-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Hello, {paySettings.userName || 'Hustler'}</h1>
          <p className="text-sm text-slate-500 mt-1">Let's crush those goals this cycle.</p>
        </header>

        {/* Calendar Section (Moved Up) */}
        <div className="px-4 mt-1 flex-1 min-h-0 flex flex-col">
          <div className="flex justify-between items-center mb-1 px-2">
            <h2 className="text-sm font-semibold text-slate-800">
              {cycleHeader}
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setCycleOffset(prev => prev - 1)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-600 transition-colors"
              >
                &larr;
              </button>
              <button 
                onClick={() => setCycleOffset(prev => prev + 1)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-600 transition-colors"
              >
                &rarr;
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-2.5 shadow-sm border border-slate-100 h-full flex flex-col">
            {/* Days Header */}
            <div className="grid grid-cols-7 mb-0">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day: string) => (
                <div key={day} className="text-center text-[10px] font-medium text-slate-400 py-0.5">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-0.5 flex-1 min-h-0 auto-rows-[1fr]">
              {blanksArray.map((_, i) => (
                <div key={`blank-${i}`} className="h-full w-full"></div>
              ))}
              
              {cycleDays.map(dateObj => {
                const dateString = formatDateToYYYYMMDD(dateObj);
                const day = dateObj.getDate();
                const today = new Date();
                const isToday = today.getFullYear() === dateObj.getFullYear() && today.getMonth() === dateObj.getMonth() && today.getDate() === dateObj.getDate();
                const record = otRecords.find(r => r.date === dateString);
                
                return (
                  <button
                    key={`${dateString}-${dateString === animatedDate ? animationKey : 0}`}
                    onClick={() => handleDateClick(dateString)}
                    className={`
                      relative flex flex-col items-center justify-center h-full min-h-0 w-full rounded-lg text-xs transition-all
                      ${isToday && !record ? 'bg-slate-100 font-bold text-slate-900' : ''}
                      ${record ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 text-slate-600'}
                      ${record && dateString === animatedDate ? 'animate-[pulse_0.6s_ease-in-out]' : ''}
                    `}
                  >
                    <span className={record ? 'font-semibold text-indigo-700 leading-none' : ''}>{day}</span>
                    {record && (
                      <span className="mt-1 text-[9px] leading-none font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        +{record.hours}h
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Card (Moved Down) */}
        <div className="px-4 mt-3 flex-none">
          <div className="bg-slate-900 text-white rounded-3xl p-3 shadow-xl shadow-slate-900/10">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Cycle OT Progress</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold">{currentCycleStats.totalHours}</span>
                  <span className="text-slate-400 text-sm">/ {goalHours} hrs needed</span>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">OT Earnings</p>
                 <span className="text-base font-semibold text-emerald-400">{formatCurrency(currentCycleStats.otEarnings)}</span>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-emerald-400 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="text-xs text-slate-300 font-medium text-center mb-2 transition-all duration-300">
              {motivationMessage}
            </p>

            <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-300">
                <TrendingUp size={16} className="text-emerald-400" />
                <span className="text-sm">Projected vs Goal</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold">{formatCurrency(currentCycleStats.totalProjected)}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Target: {formatCurrency(Number(paySettings.goalSalary))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

 const renderSettings = () => {
  const startEditing = () => {
    setSettingsDraft(paySettings);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setSettingsDraft(paySettings);
    setIsEditing(false);
  };

  const saveSettings = () => {
    if (!settingsValidation.isValid) return;
    setPaySettings(normalizePaySettings(settingsDraft));
    setCycleOffset(0);
    setIsEditing(false);
  };

  return (
    <div className="pb-24 pt-8 px-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your salary and work details
          </p>
        </div>

        {!isEditing ? (
          <button
            onClick={startEditing}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={cancelEditing}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={saveSettings}
              disabled={!settingsValidation.isValid}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {isEditing && !settingsValidation.isValid && (
        <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
          <p className="font-semibold mb-1">Please fix these settings before saving:</p>
          <ul className="list-disc pl-5 space-y-1">
            {settingsValidation.errors.map(error => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      {/* Salary Parameters */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Calculator size={18} className="text-indigo-500" />
          Salary Parameters
        </h3>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Your Name
          </label>

          <input
            type="text"
            value={settingsDraft.userName}
            disabled={!isEditing}
            onChange={(e) =>
              setSettingsDraft(prev => ({
                ...prev,
                userName: e.target.value
              }))
            }
            className={`w-full p-3 rounded-xl border text-slate-800 font-medium outline-none transition-colors ${
              isEditing
                ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                : 'bg-slate-50 border-transparent cursor-not-allowed'
            }`}
          />
        </div>

        {/* Base Salary */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Base Monthly Salary (₹)
          </label>

          <input
            type="number"
            onWheel={handleWheelBlur}
            value={settingsDraft.baseSalary}
            disabled={!isEditing}
            onChange={(e) =>
              setSettingsDraft(prev => ({
                ...prev,
                baseSalary: e.target.value
              }))
            }
            className={`w-full p-3 rounded-xl border text-slate-800 font-medium outline-none transition-colors ${
              isEditing
                ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                : 'bg-slate-50 border-transparent cursor-not-allowed'
            }`}
          />
        </div>

        {/* Goal Salary */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Total Goal Salary (₹)
          </label>

          <input
            type="number"
            onWheel={handleWheelBlur}
            value={settingsDraft.goalSalary}
            disabled={!isEditing}
            onChange={(e) =>
              setSettingsDraft(prev => ({
                ...prev,
                goalSalary: e.target.value
              }))
            }
            className={`w-full p-3 rounded-xl border text-slate-800 font-medium outline-none transition-colors ${
              isEditing
                ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                : 'bg-slate-50 border-transparent cursor-not-allowed'
            }`}
          />
        </div>

        {/* Salary Cycle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <label className="block text-xs font-bold text-slate-600 mb-3">
            Custom Salary Cycle
          </label>
          <p className="text-[11px] text-slate-500 mb-3">Choose the inclusive start and end day. The cycle must be exactly 30 or 31 days.</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Start Day */}
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                Start Day
              </label>

              <input
                type="number"
                min="1"
                max="31"
                onWheel={handleWheelBlur}
                value={settingsDraft.cycleStartDay}
                disabled={!isEditing}
                onChange={(e) =>
                  setSettingsDraft(prev => ({
                    ...prev,
                    cycleStartDay: e.target.value
                  }))
                }
                className={`w-full p-3 rounded-xl border text-sm font-medium outline-none transition-colors ${
                  isEditing
                    ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                    : 'bg-white border-transparent cursor-not-allowed'
                }`}
              />
            </div>

            {/* End Day */}
            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                End Day
              </label>

              <input
                type="number"
                min="1"
                max="31"
                onWheel={handleWheelBlur}
                value={settingsDraft.cycleEndDay}
                disabled={!isEditing}
                onChange={(e) =>
                  setSettingsDraft(prev => ({
                    ...prev,
                    cycleEndDay: e.target.value
                  }))
                }
                className={`w-full p-3 rounded-xl border text-sm font-medium outline-none transition-colors ${
                  isEditing
                    ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                    : 'bg-white border-transparent cursor-not-allowed'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Working Days + Hours */}
        <div className="grid grid-cols-2 gap-4">
          {/* Working Days */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Working Days
            </label>

            <input
              type="number"
              min="1"
              onWheel={handleWheelBlur}
              value={settingsDraft.workingDays}
              disabled={!isEditing}
              onChange={(e) =>
                setSettingsDraft(prev => ({
                  ...prev,
                  workingDays: e.target.value
                }))
              }
              className={`w-full p-3 rounded-xl border text-slate-800 font-medium outline-none transition-colors ${
                isEditing
                  ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                  : 'bg-slate-50 border-transparent cursor-not-allowed'
              }`}
            />
          </div>

          {/* Hours Per Day */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hours/Day
            </label>

            <input
              type="number"
              min="1"
              step="0.5"
              onWheel={handleWheelBlur}
              value={settingsDraft.hoursPerDay}
              disabled={!isEditing}
              onChange={(e) =>
                setSettingsDraft(prev => ({
                  ...prev,
                  hoursPerDay: e.target.value
                }))
              }
              className={`w-full p-3 rounded-xl border text-slate-800 font-medium outline-none transition-colors ${
                isEditing
                  ? 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                  : 'bg-slate-50 border-transparent cursor-not-allowed'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Calculated Rates */}
      <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100 mt-6">
        <h3 className="font-semibold text-indigo-900 mb-4 text-sm uppercase tracking-wider">
          Calculated Rates
        </h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-indigo-600 text-sm">
              Base Hourly Rate
            </span>

            <span className="font-bold text-indigo-900">
              {formatCurrency(rates.hourlyRate)}/hr
            </span>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-indigo-100/50">
            <span className="text-indigo-600 text-sm font-medium">
              Double OT Rate
            </span>

            <span className="font-bold text-indigo-900 text-lg">
              {formatCurrency(rates.otRate)}/hr
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

  const renderHistory = () => {
    type CycleSummary = { start: Date; end: Date; hours: number; earnings: number; count: number };

    const grouped = otRecords.reduce((acc: Record<string, CycleSummary>, record: OTRecord) => {
      const date = parseDateOnly(record.date);
      if (!date) return acc;
      const cycleStart = getCycleStartForDate(date);
      const cycleEnd = Number(paySettings.cycleEndDay) >= Number(paySettings.cycleStartDay)
        ? new Date(cycleStart.getFullYear(), cycleStart.getMonth(), Number(paySettings.cycleEndDay))
        : new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, Number(paySettings.cycleEndDay));
      const key = formatDateToYYYYMMDD(cycleStart);
      if (!acc[key]) acc[key] = { start: cycleStart, end: cycleEnd, hours: 0, earnings: 0, count: 0 };
      acc[key].hours += record.hours;
      acc[key].earnings += record.hours * rates.otRate;
      acc[key].count += 1;
      return acc;
    }, {});

    const sortedCycles = Object.values(grouped).sort((a, b) => b.start.getTime() - a.start.getTime());

    return (
      <div className="pb-24 pt-8 px-6 animate-in fade-in duration-300">
        <h1 className="text-xl font-bold text-slate-900 mb-6">History</h1>
        {sortedCycles.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <History size={48} className="mx-auto mb-4 opacity-20" />
            <p>No overtime logged yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedCycles.map(cycle => {
              const startLabel = cycle.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const endLabel = cycle.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={formatDateToYYYYMMDD(cycle.start)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3">{startLabel} – {endLabel}</h3>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total Hours ({cycle.count} days)</p>
                      <span className="text-2xl font-semibold text-slate-700">{cycle.hours}h</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-1">Earnings</p>
                      <span className="text-xl font-bold text-emerald-500">{formatCurrency(cycle.earnings)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Main Content Area */}
      <main className="max-w-md mx-auto w-full relative min-h-screen">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'history' && renderHistory()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 pb-safe pt-2 px-6 z-40">
        <div className="max-w-md mx-auto w-full flex justify-between items-center h-16">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutDashboard size={24} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <History size={24} strokeWidth={activeTab === 'history' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">History</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Settings</span>
          </button>
        </div>
      </nav>

      {/* Bottom Sheet Modal for Logging OT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Log Overtime</h3>
                <p className="text-sm text-slate-500">
                  {selectedDate ? (parseDateOnly(selectedDate)?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) ?? '') : ''}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Quick Chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Quick Select</label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 9, 11].map((h: number) => (
                    <button
                      key={h}
                      onClick={() => setCustomHours(h.toString())}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        customHours === h.toString() 
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {h} hrs
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Custom Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  onWheel={handleWheelBlur}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  placeholder="e.g. 3.5"
                  className="w-full p-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-lg font-semibold text-slate-900 text-center"
                />
                {otError && (
                  <p className="mt-2 text-sm text-rose-600 font-medium text-center">{otError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => saveOtRecord('0')}
                  className="flex-1 py-4 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => saveOtRecord(customHours)}
                  disabled={!customHours || isNaN(parseFloat(customHours))}
                  className="flex-2 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check size={20} /> Save Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}