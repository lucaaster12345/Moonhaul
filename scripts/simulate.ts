import type { Player } from "../packages/shared/types.js";
import { defaultConfig, freshWorld } from "../packages/game-engine/config.js";
import { GameEngine } from "../packages/game-engine/engine.js";
import { SeededRandom } from "../packages/game-engine/random.js";
import { eventById } from "../packages/game-engine/events.js";

const value = (flag: string, fallback: number) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const hours = value("--hours", 1);
const playerCount = Math.max(1, Math.floor(value("--players", 25)));
const seed = Math.floor(value("--seed", 12345));
const commandLimit = Math.floor(value("--commands", Number.POSITIVE_INFINITY));
const untilCatastrophe = process.argv.includes("--until-catastrophe");
const rng = new SeededRandom(seed);
const started = new Date("2030-01-01T00:00:00.000Z");
const config = defaultConfig();
config["events.minimum_interval"] = 180;
config["events.maximum_interval"] = 600;
const engine = new GameEngine(freshWorld(started), config, seed);
engine.setCrewSize(playerCount);
const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
  id: `sim-${index + 1}`, displayName: `SimWorker_${index + 1}`, firstSeenAt: started.toISOString(), lastSeenAt: started.toISOString(), totalActions: 0, totalContribution: 0, xp: 0, level: 1,
  department: "winch", stamina: 100, staminaUpdatedAt: started.toISOString(), currency: 0, injuries: [], commendations: [], titles: ["Trainee"], activeTitle: "Trainee", inventory: {}, statistics: {}, moonDistance: 0,
  disastersSurvived: 0, shiftsParticipated: 0, lastActionAt: null, disabledUntil: null,
}));
const baseCommands = ["!haul", "!haul", "!brace", "!stoke", "!dampen", "!cool", "!vent", "!tune", "!listen", "!work"];
const steps = untilCatastrophe ? 365 * 24 * 3600 : Math.max(1, Math.floor(hours * 3600));
let actions = 0; let accepted = 0; let events = 0; let failures = 0; let catastrophes = 0; let heatTotal = 0; let integrityTotal = 0;
const initialResources = { ...engine.state.resources };

for (let second = 1; second <= steps; second += 1) {
  const now = new Date(started.getTime() + second * 1000);
  const activeEvent = engine.state.activeEvent ? eventById(engine.state.activeEvent.id) : null;
  const commands = activeEvent?.choices.map((choice) => `!${choice.command}`) ?? baseCommands;
  const attempts = actions < commandLimit && rng.next() < Math.min(0.9, playerCount / 55) ? Math.max(1, Math.floor(playerCount / 20)) : 0;
  for (let attempt = 0; attempt < attempts && actions < commandLimit; attempt += 1) {
    const player = rng.pick(players);
    const elapsed = (now.getTime() - new Date(player.staminaUpdatedAt).getTime()) / 1000;
    player.stamina = Math.min(100 + Math.min(25, player.level - 1), player.stamina + elapsed * Number(config["player.stamina_regen"]));
    player.staminaUpdatedAt = now.toISOString();
    const result = engine.handlePlayerAction({ player, message: rng.pick(commands), now });
    actions += 1;
    if (result.accepted && result.command && (result.contribution ?? 0) > 0) {
      accepted += 1; player.stamina -= result.staminaCost ?? 0; player.lastActionAt = now.toISOString(); player.totalContribution += result.contribution ?? 0; player.totalActions += 1; player.xp += (result.contribution ?? 0) * 0.7; player.level = Math.floor(Math.sqrt(player.xp / 45)) + 1;
    }
  }
  engine.tick(1000, now);
  const history = engine.drainHistory();
  events += history.filter((item) => item.outcome === "started").length;
  failures += history.filter((item) => item.outcome === "failed" || item.severity === "disaster").length;
  catastrophes += history.filter((item) => item.severity === "catastrophic" && item.outcome === "catastrophic recovery").length;
  engine.drainScars();
  heatTotal += engine.state.machine.heat; integrityTotal += engine.state.machine.integrity;
  if (untilCatastrophe && catastrophes > 0) break;
}

console.log(JSON.stringify({
  seed, requestedHours: hours, simulatedTicks: engine.state.tick, simulatedHours: Number((engine.state.tick / 3600).toFixed(2)), players: playerCount, actionsAttempted: actions, actionsAccepted: accepted,
  moon: { altitude: Number(engine.state.moon.altitude.toFixed(3)), distanceHauled: Number(engine.state.world.totalDistanceHauled.toFixed(3)), velocity: Number(engine.state.moon.velocity.toFixed(5)) },
  eventsTriggered: events, failures, catastrophes, averageHeat: Number((heatTotal / engine.state.tick).toFixed(2)), averageIntegrity: Number((integrityTotal / engine.state.tick).toFixed(2)),
  resourcesConsumed: Object.fromEntries(Object.entries(initialResources).map(([key, amount]) => [key, Number((amount - engine.state.resources[key as keyof typeof initialResources]).toFixed(2))])),
}, null, 2));
