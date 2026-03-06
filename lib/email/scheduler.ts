export type SchedulerInbox = {
  id: string;
  dailyLimit: number;
  dailySent: number;
};

export type SchedulerInput = {
  leadCount: number;
  inboxes: SchedulerInbox[];
  windowStartHour: number;
  windowEndHour: number;
  timezone: string;
  windowDays: string[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  randomizeInterval: boolean;
  skipWeekends?: boolean;
};

export type ScheduledItem = {
  index: number;
  inboxId: string;
  scheduledAt: string;
};

const WEEKDAY_MAP: Record<string, string> = {
  sun: "sun",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
};

function getDayAndHour(date: Date, timezone: string): { day: string; hour: number; dateKey: string } {
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });

  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    day: WEEKDAY_MAP[dayFormatter.format(date).toLowerCase()] ?? "mon",
    hour: Number(hourFormatter.format(date)),
    dateKey: dateFormatter.format(date),
  };
}

function randomIntervalSeconds(
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
  randomizeInterval: boolean
): number {
  if (!randomizeInterval || maxIntervalSeconds <= minIntervalSeconds) {
    return minIntervalSeconds;
  }

  const delta = maxIntervalSeconds - minIntervalSeconds;
  return minIntervalSeconds + Math.floor(Math.random() * (delta + 1));
}

function isWithinWindow(
  date: Date,
  timezone: string,
  windowStartHour: number,
  windowEndHour: number,
  windowDays: Set<string>,
  skipWeekends: boolean
): boolean {
  const { day, hour } = getDayAndHour(date, timezone);

  if (skipWeekends && (day === "sat" || day === "sun")) {
    return false;
  }

  if (!windowDays.has(day)) {
    return false;
  }

  return hour >= windowStartHour && hour < windowEndHour;
}

function moveToNextWindow(
  current: Date,
  timezone: string,
  windowStartHour: number,
  windowEndHour: number,
  windowDays: Set<string>,
  skipWeekends: boolean
): Date {
  let candidate = new Date(current);

  for (let i = 0; i < 24 * 14; i += 1) {
    if (
      isWithinWindow(
        candidate,
        timezone,
        windowStartHour,
        windowEndHour,
        windowDays,
        skipWeekends
      )
    ) {
      return candidate;
    }

    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  }

  return candidate;
}

export function buildSchedule(input: SchedulerInput): ScheduledItem[] {
  const {
    leadCount,
    inboxes,
    windowStartHour,
    windowEndHour,
    timezone,
    windowDays,
    minIntervalSeconds,
    maxIntervalSeconds,
    randomizeInterval,
    skipWeekends = false,
  } = input;

  if (leadCount <= 0 || inboxes.length === 0) {
    return [];
  }

  const validInboxes = inboxes
    .filter((inbox) => inbox.dailyLimit > 0)
    .map((inbox) => ({
      ...inbox,
      dailySent: Math.max(0, inbox.dailySent),
    }));

  if (validInboxes.length === 0) {
    return [];
  }

  const daySet = new Set(
    (windowDays.length ? windowDays : ["mon", "tue", "wed", "thu", "fri"]).map(
      (day) => day.toLowerCase().slice(0, 3)
    )
  );

  const perInboxDayCount = new Map<string, number>();
  const schedule: ScheduledItem[] = [];

  let cursor = moveToNextWindow(
    new Date(),
    timezone,
    windowStartHour,
    windowEndHour,
    daySet,
    skipWeekends
  );

  let roundRobin = 0;

  for (let i = 0; i < leadCount; i += 1) {
    cursor = moveToNextWindow(
      cursor,
      timezone,
      windowStartHour,
      windowEndHour,
      daySet,
      skipWeekends
    );

    const { dateKey } = getDayAndHour(cursor, timezone);

    let attempts = 0;
    let selected: SchedulerInbox | null = null;

    while (attempts < validInboxes.length) {
      const inbox = validInboxes[(roundRobin + attempts) % validInboxes.length];
      const mapKey = `${dateKey}:${inbox.id}`;
      const sentForDay = perInboxDayCount.get(mapKey) ?? inbox.dailySent;

      if (sentForDay < inbox.dailyLimit) {
        selected = inbox;
        perInboxDayCount.set(mapKey, sentForDay + 1);
        roundRobin = (roundRobin + attempts + 1) % validInboxes.length;
        break;
      }

      attempts += 1;
    }

    if (!selected) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      i -= 1;
      continue;
    }

    schedule.push({
      index: i,
      inboxId: selected.id,
      scheduledAt: cursor.toISOString(),
    });

    const jitter = randomIntervalSeconds(
      minIntervalSeconds,
      maxIntervalSeconds,
      randomizeInterval
    );
    cursor = new Date(cursor.getTime() + jitter * 1000);
  }

  return schedule;
}
