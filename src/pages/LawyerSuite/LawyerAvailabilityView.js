import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const DAYS_MAP = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday'
};

const LawyerAvailabilityView = () => {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAvailability = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('availability_rules')
        .select('*')
        .eq('lawyer_id', user.id);

      if (error) throw error;

      // Default empty state
      const initialSchedule = {
        Monday: { active: false, start: '09:00', end: '17:00', day_of_week: 1 },
        Tuesday: { active: false, start: '09:00', end: '17:00', day_of_week: 2 },
        Wednesday: { active: false, start: '09:00', end: '17:00', day_of_week: 3 },
        Thursday: { active: false, start: '09:00', end: '17:00', day_of_week: 4 },
        Friday: { active: false, start: '09:00', end: '15:00', day_of_week: 5 },
        Saturday: { active: false, start: '10:00', end: '14:00', day_of_week: 6 },
        Sunday: { active: false, start: '10:00', end: '14:00', day_of_week: 0 }
      };

      if (data && data.length > 0) {
        data.forEach(rule => {
          const dayName = DAYS_MAP[rule.day_of_week];
          if (initialSchedule[dayName]) {
            initialSchedule[dayName] = {
              id: rule.id,
              active: rule.is_available,
              start: rule.start_time.substring(0, 5),
              end: rule.end_time.substring(0, 5),
              day_of_week: rule.day_of_week
            };
          }
        });
      }

      setSchedule(initialSchedule);
    } catch (err) {
      console.error('Error fetching availability:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleDay = (day) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], active: !prev[day].active }
    }));
  };

  const handleTimeChange = (day, field, value) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  const saveAvailability = async () => {
    setIsSaving(true);
    try {
      const rulesToUpsert = Object.values(schedule).map(rule => ({
        ...(rule.id ? { id: rule.id } : {}),
        lawyer_id: user.auth_id || user.id,
        day_of_week: rule.day_of_week,
        start_time: rule.start,
        end_time: rule.end,
        is_available: rule.active
      }));

      const { error } = await supabase.from('availability_rules').upsert(rulesToUpsert);
      if (error) throw error;
      toast.success('Availability saved successfully!');
    } catch (err) {
      console.error('Error saving availability:', err);
      toast.error('Failed to save availability.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading availability...</div>;

  const activeDaysCount = Object.values(schedule).filter(d => d.active).length;
  
  const totalHours = Object.values(schedule).reduce((acc, curr) => {
    if (!curr.active) return acc;
    const [startH, startM] = curr.start.split(':').map(Number);
    const [endH, endM] = curr.end.split(':').map(Number);
    let duration = (endH + endM / 60) - (startH + startM / 60);
    if (duration < 0) duration += 24; // Handle overnight shifts
    return acc + duration;
  }, 0);

  const loadPercentage = Math.min((totalHours / 40) * 100, 100);

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto animate-fadeIn space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display-lg text-display-lg text-primary font-bold">Availability & Scheduling</h3>
          <p className="text-on-surface-variant font-body-md mt-1">Set your working hours and consultation rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Weekly Grid & Forms */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Weekly Grid */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6">Standard Weekly Hours</h4>
            
            <div className="space-y-3">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                <div key={day} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border transition-all ${schedule[day].active ? 'border-outline-variant bg-surface-container-lowest' : 'border-outline-variant/30 bg-surface-container-low/50 opacity-70'}`}>
                  
                  {/* Day Toggle */}
                  <div className="flex items-center gap-4 mb-4 sm:mb-0 w-32">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={schedule[day].active} onChange={() => toggleDay(day)} />
                      <div className="w-10 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                    <span className={`font-bold text-body-sm ${schedule[day].active ? 'text-primary' : 'text-on-surface-variant'}`}>{day}</span>
                  </div>

                  {/* Time Inputs */}
                  {schedule[day].active ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-md px-3 py-1.5 focus-within:ring-2 ring-secondary transition-all">
                        <span className="material-symbols-outlined text-[16px] text-outline mr-2">schedule</span>
                        <input type="time" value={schedule[day].start} onChange={(e) => handleTimeChange(day, 'start', e.target.value)} className="bg-transparent border-none outline-none text-body-sm font-bold text-primary w-24" />
                      </div>
                      <span className="text-outline-variant font-bold">-</span>
                      <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-md px-3 py-1.5 focus-within:ring-2 ring-secondary transition-all">
                        <span className="material-symbols-outlined text-[16px] text-outline mr-2">schedule</span>
                        <input type="time" value={schedule[day].end} onChange={(e) => handleTimeChange(day, 'end', e.target.value)} className="bg-transparent border-none outline-none text-body-sm font-bold text-primary w-24" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full sm:w-auto sm:pr-12">
                      <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant bg-outline-variant/20 px-3 py-1 rounded">Unavailable</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Booking Rules */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6">Booking Rules</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Consultation Duration</label>
                <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface">
                  <option>30 Minutes</option>
                  <option>45 Minutes</option>
                  <option value="60">60 Minutes</option>
                  <option>90 Minutes</option>
                </select>
              </div>
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Buffer Time (Between appts)</label>
                <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface">
                  <option>No buffer</option>
                  <option value="15">15 Minutes</option>
                  <option>30 Minutes</option>
                </select>
              </div>
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Max Appointments / Day</label>
                <input type="number" defaultValue="6" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface" />
              </div>
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Lunch Break</label>
                <div className="flex gap-2">
                  <input type="time" defaultValue="13:00" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface" />
                  <span className="self-center font-bold text-outline-variant">-</span>
                  <input type="time" defaultValue="14:00" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface" />
                </div>
              </div>
            </div>
          </div>

          {/* Policies */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6">Client Policies</h4>
            <div className="space-y-6">
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block flex items-center justify-between">
                  Cancellation Policy
                  <span className="text-[10px] uppercase font-normal text-outline-variant">Visible to clients</span>
                </label>
                <textarea rows="3" defaultValue="Cancellations must be made at least 24 hours in advance to receive a full refund. Late cancellations will incur a 50% fee." className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface resize-none"></textarea>
              </div>
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block flex items-center justify-between">
                  Rescheduling Policy
                  <span className="text-[10px] uppercase font-normal text-outline-variant">Visible to clients</span>
                </label>
                <textarea rows="3" defaultValue="You may reschedule your appointment up to 12 hours before the scheduled time without penalty." className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-0 text-on-surface resize-none"></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sticky Action Panel */}
        <div className="lg:col-span-4 sticky top-24 space-y-6">
          <div className="bg-primary p-6 md:p-8 rounded-xl shadow-lg relative overflow-hidden text-white">
            <div className="relative z-10 flex flex-col">
              <h4 className="font-headline-sm text-headline-sm mb-6 text-secondary-fixed border-b border-primary-container pb-3">Review & Save</h4>
              
              <div className="mb-8">
                <div className="flex justify-between text-body-sm font-bold text-on-primary-container mb-2">
                  <span>Estimated Weekly Load</span>
                  <span className={loadPercentage > 80 ? 'text-error' : 'text-success-green'}>
                    {loadPercentage > 80 ? 'High' : 'Optimal'}
                  </span>
                </div>
                <div className="w-full bg-primary-container rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${loadPercentage > 80 ? 'bg-error' : 'bg-success-green'}`} style={{ width: `${loadPercentage}%` }}></div>
                </div>
                <p className="text-[11px] text-on-primary-container mt-3 italic">Based on {activeDaysCount} active days and {Math.round(totalHours)} scheduled hours per week.</p>
              </div>

              <button 
                onClick={saveAvailability}
                disabled={isSaving}
                className="w-full py-3 bg-secondary-container text-primary font-bold rounded-lg hover:bg-white transition-colors active:scale-95 shadow-lg mb-3">
                {isSaving ? 'Saving...' : 'Save Availability'}
              </button>
              <button
                onClick={fetchAvailability}
                className="w-full py-2.5 border border-primary-container text-on-primary-container font-bold rounded-lg hover:bg-primary-container transition-colors active:scale-95">
                Revert Changes
              </button>
            </div>
            
            <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
              <span className="material-symbols-outlined text-[180px] filled-icon translate-x-4 translate-y-4">calendar_month</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/50 flex gap-4">
            <span className="material-symbols-outlined text-secondary">info</span>
            <p className="text-xs text-on-surface-variant">Changes to your availability will only affect new bookings. Existing appointments will remain as scheduled.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LawyerAvailabilityView;
