import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { v02Api } from '@/lib/api/v02';
import { localDate } from '@/lib/date';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
export function IdeaCalendar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(
    selected.slice(0, 7) || localDate().slice(0, 7),
  );
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['idea', 'calendar', month],
    queryFn: () => v02Api.calendar(month),
    enabled: open && /^\d{4}-\d{2}$/.test(month),
  });
  const [year = 0, m = 0] = month.split('-').map(Number);
  const count = new Date(year, m, 0).getDate();
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const counts = new Map(query.data?.map((i) => [i.date, i.count]));
  return (
    <details
      className="idea-calendar"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{t('v02.calendar')}</summary>
      <Input
        aria-label={t('v02.month')}
        type="month"
        value={month}
        onChange={(e) => {
          if (e.target.value) setMonth(e.target.value);
        }}
      />
      {query.error && <p role="alert">{query.error.message}</p>}
      <div className="calendar-grid">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`empty-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          return (
            <button
              type="button"
              key={date}
              aria-label={t('v02.dayCount', {
                date,
                count: counts.get(date) ?? 0,
              })}
              aria-pressed={selected === date}
              onClick={() => onSelect(date)}
            >
              <span>{i + 1}</span>
              <small>{counts.get(date) || '·'}</small>
            </button>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" onClick={() => onSelect('')}>
        {t('v02.allDates')}
      </Button>
      {selected && (
        <p className="muted">{t('v02.selectedDate', { date: selected })}</p>
      )}
    </details>
  );
}
