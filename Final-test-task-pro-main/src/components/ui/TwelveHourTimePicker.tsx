import React from 'react';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const BASE_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

const normalizeTimeValue = (value: string): string | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getRoundedFiveMinuteTime = (): string => {
  const roundedMs = Math.round(Date.now() / (5 * 60 * 1000)) * 5 * 60 * 1000;
  const roundedDate = new Date(roundedMs);
  return `${String(roundedDate.getHours()).padStart(2, '0')}:${String(roundedDate.getMinutes()).padStart(2, '0')}`;
};

const splitTimeForDisplay = (value: string) => {
  const normalizedValue = normalizeTimeValue(value) ?? getRoundedFiveMinuteTime();
  const [hoursText, minutesText] = normalizedValue.split(':');
  const hours24 = Number(hoursText);
  const minutes = minutesText;
  const isPm = hours24 >= 12;
  const hour12 = hours24 % 12 || 12;
  return {
    hour: String(hour12),
    minute: minutes,
    period: isPm ? 'PM' : 'AM' as 'AM' | 'PM',
  };
};

const toTwentyFourHourValue = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isInteger(parsedHour) || parsedHour < 1 || parsedHour > 12) return getRoundedFiveMinuteTime();
  if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) return getRoundedFiveMinuteTime();

  let hours24 = parsedHour % 12;
  if (period === 'PM') {
    hours24 += 12;
  }

  return `${String(hours24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

interface TwelveHourTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const TwelveHourTimePicker: React.FC<TwelveHourTimePickerProps> = ({ value, onChange, className = '' }) => {
  const displayValue = splitTimeForDisplay(value);
  const minuteOptions = BASE_MINUTE_OPTIONS.includes(displayValue.minute)
    ? BASE_MINUTE_OPTIONS
    : [...BASE_MINUTE_OPTIONS, displayValue.minute].sort((a, b) => Number(a) - Number(b));

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <select
        value={displayValue.hour}
        onChange={(event) => onChange(toTwentyFourHourValue(event.target.value, displayValue.minute, displayValue.period))}
        className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        aria-label="Hour"
      >
        {HOUR_OPTIONS.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>

      <select
        value={displayValue.minute}
        onChange={(event) => onChange(toTwentyFourHourValue(displayValue.hour, event.target.value, displayValue.period))}
        className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        aria-label="Minute"
      >
        {minuteOptions.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>

      <div className="inline-flex min-h-[48px] rounded-xl border border-slate-200 bg-white p-1">
        {(['AM', 'PM'] as const).map((period) => {
          const active = displayValue.period === period;
          return (
            <button
              key={period}
              type="button"
              onClick={() => onChange(toTwentyFourHourValue(displayValue.hour, displayValue.minute, period))}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-[var(--accent)] text-white' : 'text-slate-600'
              }`}
              aria-pressed={active}
            >
              {period}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export { getRoundedFiveMinuteTime };
export default TwelveHourTimePicker;
