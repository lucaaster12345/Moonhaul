import type { Player } from "../packages/shared/types.js";

export const player = (overrides: Partial<Player> = {}): Player => ({
  id: "p1", displayName: "RatKing", firstSeenAt: "2030-01-01T00:00:00.000Z", lastSeenAt: "2030-01-01T00:00:00.000Z", totalActions: 0, totalContribution: 0, xp: 0, level: 1, department: "winch",
  stamina: 100, staminaUpdatedAt: "2030-01-01T00:00:00.000Z", currency: 0, injuries: [], commendations: [], titles: ["Trainee"], activeTitle: "Trainee", inventory: {}, statistics: {},
  moonDistance: 0, disastersSurvived: 0, shiftsParticipated: 0, lastActionAt: null, disabledUntil: null, ...overrides,
});
