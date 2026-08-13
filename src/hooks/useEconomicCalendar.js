import { useEffect, useState } from 'react';

export default function useEconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      try {
        const response = await fetch('/api/economic-calendar');
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload) {
          setEvents([]);
          setStatus('error');
          return;
        }
        setEvents(Array.isArray(payload.events) ? payload.events : []);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setEvents([]);
        setStatus('error');
      }
    };

    load();
    const interval = setInterval(load, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { events, status };
}
