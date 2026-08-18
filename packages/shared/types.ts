export type Department = "winch" | "boiler" | "cooling" | "signal";

export interface NormalizedChatMessage {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: Date;
  badges: string[];
}

export interface Player {
  id: string;
  displayName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  totalActions: number;
  totalContribution: number;
  xp: number;
  level: number;
  department: Department;
  stamina: number;
  staminaUpdatedAt: string;
  currency: number;
  injuries: string[];
  commendations: string[];
  titles: string[];
  activeTitle: string;
  inventory: Record<string, number>;
  statistics: Record<string, number>;
  moonDistance: number;
  disastersSurvived: number;
  shiftsParticipated: number;
  lastActionAt: string | null;
  disabledUntil: string | null;
}

export interface ActiveEvent {
  id: string;
  startedAt: string;
  endsAt: string;
  votes: Record<string, { count: number; power: number; users: string[] }>;
}

export interface WorldState {
  moon: {
    altitude: number;
    targetAltitude: number;
    velocity: number;
    haulProgress: number;
    instability: number;
    massModifier: number;
    anomalyLevel: number;
    temporaryScale: number;
    secondMoon: boolean;
  };
  machine: {
    integrity: number;
    heat: number;
    pressure: number;
    power: number;
    cableTension: number;
    lubrication: number;
    efficiency: number;
  };
  resources: {
    fuel: number;
    coolant: number;
    scrap: number;
    spareParts: number;
    electricity: number;
    moonlight: number;
  };
  world: {
    currentShift: number;
    shiftStartedAt: string;
    totalShiftsSurvived: number;
    totalDistanceHauled: number;
    disastersSurvived: number;
    workersLost: number;
    anomalyLevel: number;
    morale: number;
    treasury: number;
    catastropheCount: number;
    daysSinceIncident: number;
  };
  tick: number;
  paused: boolean;
  pausedAt: string | null;
  lastTickAt: string;
  nextEventAt: string;
  activeEvent: ActiveEvent | null;
  currentHaulForce: number;
  recentActions: Array<{ at: string; kind: string; text: string; userId?: string }>;
  currentAlert: string | null;
  milestone: string | null;
}

export interface WorldScar {
  id: string;
  name: string;
  description: string;
  modifiers: Record<string, number>;
  acquiredAt: string;
  sourceEvent: string;
}

export interface ConfigDefinition {
  key: string;
  category: string;
  description: string;
  type: "number" | "boolean" | "string";
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
}

export interface ActionResult {
  accepted: boolean;
  response: string;
  command?: string;
  contribution?: number;
  staminaCost?: number;
  department?: Department;
}
