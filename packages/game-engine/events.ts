export interface EventEffect {
  path?: string;
  delta?: number;
  set?: number | boolean;
  scar?: { name: string; description: string; modifiers: Record<string, number> };
  notice?: string;
}

export interface EventChoice {
  command: string;
  label: string;
  effects: EventEffect[];
}

export interface EventDefinition {
  id: string;
  name: string;
  description: string;
  rarity: "common" | "uncommon" | "rare" | "catastrophic";
  weight: number;
  prerequisites?: string[];
  minimumShift: number;
  minimumAnomaly: number;
  maximumAnomaly: number;
  durationSeconds: number;
  choices: EventChoice[];
  thresholdUnique: number;
  rewards: string;
  penalties: string;
  followUpEvent?: string;
  cooldownSeconds: number;
  streamMessage: string;
  chatMessage: string;
  pausesNormalWork: boolean;
}

const effect = (path: string, delta: number): EventEffect => ({ path, delta });
const scar = (name: string, description: string, modifiers: Record<string, number> = {}): EventEffect => ({ scar: { name, description, modifiers } });

export const EVENTS: EventDefinition[] = [
  {
    id: "cable-slip", name: "CABLE SLIP DETECTED", description: "Tension exceeds municipal guidance. Report to cable braces.", rarity: "common", weight: 18,
    minimumShift: 1, minimumAnomaly: 0, maximumAnomaly: 100, durationSeconds: 42, thresholdUnique: 3, rewards: "Cable stabilized; morale restored.", penalties: "Altitude and integrity loss.", cooldownSeconds: 300,
    streamMessage: "TYPE !BRACE — STABILIZE THE CABLE", chatMessage: "CABLE SLIP: !brace, !release, or !pray", pausesNormalWork: false,
    choices: [
      { command: "brace", label: "Stabilize the cable", effects: [effect("machine.cableTension", -24), effect("world.morale", 2)] },
      { command: "release", label: "Release cable and lose progress", effects: [effect("machine.cableTension", -36), effect("moon.altitude", -4)] },
      { command: "pray", label: "Submit an unauthorized request", effects: [effect("moon.anomalyLevel", 1), effect("machine.cableTension", -8)] },
    ],
  },
  {
    id: "boiler-pressure", name: "BOILER PRESSURE HEARING", description: "The boiler has exceeded both pressure limits and its speaking time.", rarity: "common", weight: 14,
    minimumShift: 1, minimumAnomaly: 0, maximumAnomaly: 100, durationSeconds: 38, thresholdUnique: 2, rewards: "Pressure controlled.", penalties: "Heat and integrity damage.", cooldownSeconds: 360,
    streamMessage: "BOILER PRESSURE HEARING", chatMessage: "Boiler hearing: !vent, !dampen, or !agree", pausesNormalWork: false,
    choices: [
      { command: "vent", label: "Vent the boiler", effects: [effect("machine.pressure", -30), effect("machine.power", -10)] },
      { command: "dampen", label: "Dampen the fire", effects: [effect("machine.heat", -18), effect("machine.power", -6)] },
      { command: "agree", label: "Accept the boiler's findings", effects: [effect("world.morale", 4), effect("world.anomalyLevel", 2)] },
    ],
  },
  {
    id: "coolant-leak", name: "COOLANT HAS LEFT THE PREMISES", description: "Cooling fluid is departing through a union-approved opening.", rarity: "common", weight: 12,
    minimumShift: 1, minimumAnomaly: 0, maximumAnomaly: 100, durationSeconds: 40, thresholdUnique: 3, rewards: "Leak contained.", penalties: "Coolant lost and heat increased.", cooldownSeconds: 420,
    streamMessage: "COOLANT LEAK — TYPE !PATCH", chatMessage: "Coolant emergency: !patch, !bucket, or !wave", pausesNormalWork: false,
    choices: [
      { command: "patch", label: "Apply scrap patch", effects: [effect("resources.scrap", -8), effect("machine.integrity", 4)] },
      { command: "bucket", label: "Recover departing coolant", effects: [effect("resources.coolant", 25), effect("world.morale", 2)] },
      { command: "wave", label: "Wish it well", effects: [effect("resources.coolant", -40), effect("world.anomalyLevel", 1)] },
    ],
  },
  {
    id: "cable-gremlin", name: "CABLE GREMLIN", description: "Something with a clipboard is eating the Moon cable.", rarity: "uncommon", weight: 10,
    minimumShift: 2, minimumAnomaly: 4, maximumAnomaly: 100, durationSeconds: 45, thresholdUnique: 3, rewards: "Gremlin removed or retained as staff.", penalties: "Cable damage.", cooldownSeconds: 700,
    streamMessage: "CABLE GREMLIN — CHOOSE ITS DISPOSITION", chatMessage: "Cable gremlin: !chase, !feed, or !befriend", pausesNormalWork: false,
    choices: [
      { command: "chase", label: "Chase it into Cooling", effects: [effect("machine.integrity", 3), effect("machine.cableTension", 5)] },
      { command: "feed", label: "Feed it approved scrap", effects: [effect("resources.scrap", -15), effect("machine.lubrication", 12)] },
      { command: "befriend", label: "Issue a temporary badge", effects: [effect("machine.efficiency", 4), effect("world.anomalyLevel", 3)] },
    ],
  },
  {
    id: "osha-inspection", name: "OSHA INSPECTION", description: "An inspector has arrived from a department that may not exist yet.", rarity: "uncommon", weight: 9,
    prerequisites: ["machine.integrity < 90"], minimumShift: 2, minimumAnomaly: 0, maximumAnomaly: 100, durationSeconds: 50, thresholdUnique: 4, rewards: "A certificate bearing the wrong city.", penalties: "Treasury fine.", cooldownSeconds: 900,
    streamMessage: "ACT NORMAL — THIS IS AN INSPECTION", chatMessage: "Inspection: !hide, !comply, or !distract", pausesNormalWork: false,
    choices: [
      { command: "hide", label: "Hide the unsafe half", effects: [effect("world.treasury", -80), effect("world.morale", 3)] },
      { command: "comply", label: "Comply with all known laws", effects: [effect("resources.scrap", -12), effect("machine.integrity", 7)] },
      { command: "distract", label: "Show them the Signal Room", effects: [effect("world.anomalyLevel", 4), effect("world.treasury", 40)] },
    ],
  },
  {
    id: "whispering-cable", name: "THE CABLE IS WHISPERING NAMES", description: "Several are current employees. One is the Moon.", rarity: "uncommon", weight: 8,
    minimumShift: 3, minimumAnomaly: 8, maximumAnomaly: 100, durationSeconds: 47, thresholdUnique: 3, rewards: "Signal data and moonlight.", penalties: "Administrative fatigue.", cooldownSeconds: 800,
    streamMessage: "THE CABLE KNOWS YOUR NAME", chatMessage: "The cable is whispering: !listen, !ignore, or !record", pausesNormalWork: false,
    choices: [
      { command: "listen", label: "Listen carefully", effects: [effect("resources.moonlight", 2), effect("world.anomalyLevel", 5)] },
      { command: "ignore", label: "Continue approved work", effects: [effect("world.morale", 1), effect("machine.efficiency", 2)] },
      { command: "record", label: "Complete Form 9-C", effects: [effect("world.treasury", 90), effect("machine.cableTension", 4)] },
    ],
  },
  {
    id: "boiler-wedding", name: "BOILER WEDDING", description: "The boiler is demanding a spouse and has booked the east furnace.", rarity: "rare", weight: 5,
    prerequisites: ["machine.heat > 50"], minimumShift: 4, minimumAnomaly: 12, maximumAnomaly: 100, durationSeconds: 55, thresholdUnique: 5, rewards: "Improved boiler morale.", penalties: "The boiler remembers.", cooldownSeconds: 1800,
    streamMessage: "THE BOILER REQUESTS YOUR BLESSING", chatMessage: "Boiler wedding: !accept, !refuse, or !object", pausesNormalWork: true,
    choices: [
      { command: "accept", label: "Attend the ceremony", effects: [effect("machine.power", 25), effect("world.morale", 8), scar("BOILER IS LEGALLY A PERSON", "All maintenance now requires consent.", { "boiler.heat_per_fuel": -0.01 })] },
      { command: "refuse", label: "Decline on operational grounds", effects: [effect("machine.heat", 30), effect("machine.integrity", -8)] },
      { command: "object", label: "Raise a procedural objection", effects: [effect("world.treasury", -120), effect("world.anomalyLevel", 4)] },
    ],
  },
  {
    id: "gravity-union", name: "GRAVITY UNIONIZATION VOTE", description: "Gravity has requested weekends and clearer downward-motion guidance.", rarity: "rare", weight: 4,
    minimumShift: 5, minimumAnomaly: 15, maximumAnomaly: 100, durationSeconds: 60, thresholdUnique: 6, rewards: "Collective bargaining agreement.", penalties: "Temporary double gravity.", cooldownSeconds: 2400,
    streamMessage: "GRAVITY IS ORGANIZING", chatMessage: "Gravity vote: !recognize, !negotiate, or !deny", pausesNormalWork: false,
    choices: [
      { command: "recognize", label: "Recognize the union", effects: [effect("moon.massModifier", -0.06), effect("world.morale", 10), scar("GRAVITY UNIONIZED", "Down is now subject to collective bargaining.", { "moon.base_fall_rate": -0.0001 })] },
      { command: "negotiate", label: "Offer alternating Tuesdays", effects: [effect("world.treasury", -180), effect("moon.massModifier", -0.03)] },
      { command: "deny", label: "Deny gravity's personhood", effects: [effect("moon.massModifier", 0.18), effect("world.morale", -6)] },
    ],
  },
  {
    id: "second-moon", name: "SECOND MOON DETECTED", description: "There are now two. Procurement insists only one was ordered.", rarity: "rare", weight: 4,
    minimumShift: 6, minimumAnomaly: 20, maximumAnomaly: 100, durationSeconds: 52, thresholdUnique: 5, rewards: "One Moon formally selected.", penalties: "Lunar mass dispute.", cooldownSeconds: 3000,
    streamMessage: "SECOND MOON DETECTED — SELECT ONE", chatMessage: "There are two Moons: !left, !right, or !both", pausesNormalWork: false,
    choices: [
      { command: "left", label: "Retain the left Moon", effects: [{ path: "moon.secondMoon", set: false }, effect("moon.anomalyLevel", 3)] },
      { command: "right", label: "Retain the right Moon", effects: [{ path: "moon.secondMoon", set: false }, effect("resources.moonlight", 5)] },
      { command: "both", label: "Expand lunar capacity", effects: [{ path: "moon.secondMoon", set: true }, effect("moon.massModifier", 0.25), scar("THERE IS ANOTHER MOON NOW", "It has seniority.", { "moon.base_fall_rate": 0.0002 })] },
    ],
  },
  {
    id: "night-audit", name: "NIGHT LENGTH AUDIT", description: "Night contains eleven minutes not present in the approved schedule.", rarity: "uncommon", weight: 7,
    minimumShift: 3, minimumAnomaly: 10, maximumAnomaly: 100, durationSeconds: 35, thresholdUnique: 3, rewards: "Time reconciled.", penalties: "Shift scheduling fault.", cooldownSeconds: 1200,
    streamMessage: "UNAUTHORIZED MINUTES FOUND", chatMessage: "Night audit: !return, !keep, or !invoice", pausesNormalWork: false,
    choices: [
      { command: "return", label: "Return the minutes", effects: [effect("world.morale", -2), effect("world.anomalyLevel", -2)] },
      { command: "keep", label: "Keep them for emergencies", effects: [effect("world.anomalyLevel", 3), scar("NIGHT IS 3% LONGER", "Payroll has not been informed.")] },
      { command: "invoice", label: "Invoice the night", effects: [effect("world.treasury", 140)] },
    ],
  },
  {
    id: "moon-oval", name: "LUNAR COMPRESSION", description: "Cable tension has altered the Moon's approved geometry.", rarity: "rare", weight: 4,
    prerequisites: ["machine.cableTension > 60"], minimumShift: 5, minimumAnomaly: 10, maximumAnomaly: 100, durationSeconds: 45, thresholdUnique: 4, rewards: "Geometry stabilized.", penalties: "Moon becomes operationally oval.", cooldownSeconds: 2000,
    streamMessage: "MOON OUT OF ROUND", chatMessage: "Lunar compression: !reshape, !accept, or !measure", pausesNormalWork: false,
    choices: [
      { command: "reshape", label: "Apply reverse tension", effects: [effect("machine.cableTension", 14), effect("moon.instability", -8)] },
      { command: "accept", label: "Amend the definition of round", effects: [scar("THE MOON IS SLIGHTLY OVAL NOW", "It remains within agricultural tolerances."), effect("world.morale", 5)] },
      { command: "measure", label: "Measure it repeatedly", effects: [effect("world.treasury", -40), effect("machine.efficiency", 3)] },
    ],
  },
  {
    id: "signal-caller", name: "SIGNAL ROOM INCOMING CALL", description: "The caller ID shows tomorrow's date and your own extension.", rarity: "rare", weight: 5,
    minimumShift: 4, minimumAnomaly: 18, maximumAnomaly: 100, durationSeconds: 50, thresholdUnique: 4, rewards: "Unscheduled intelligence.", penalties: "Anomaly increase.", followUpEvent: "unauthorized-sun", cooldownSeconds: 2100,
    streamMessage: "THE SIGNAL ROOM IS RINGING", chatMessage: "Incoming call: !answer, !hold, or !disconnect", pausesNormalWork: false,
    choices: [
      { command: "answer", label: "Answer professionally", effects: [effect("resources.moonlight", 4), effect("world.anomalyLevel", 8)] },
      { command: "hold", label: "Place tomorrow on hold", effects: [effect("machine.efficiency", 5), effect("world.morale", -2)] },
      { command: "disconnect", label: "Cut the line", effects: [effect("machine.power", -12), effect("world.anomalyLevel", -3)] },
    ],
  },
  {
    id: "moon-inside", name: "INTERNAL LUNAR KNOCKING", description: "Acoustics confirms a smaller Moon inside the Moon. It would like out.", rarity: "rare", weight: 3,
    minimumShift: 8, minimumAnomaly: 32, maximumAnomaly: 100, durationSeconds: 58, thresholdUnique: 6, rewards: "New moonlight reserves.", penalties: "Structural lunar ambiguity.", cooldownSeconds: 3600,
    streamMessage: "SOMETHING INSIDE THE MOON IS KNOCKING", chatMessage: "Internal Moon: !open, !knock, or !seal", pausesNormalWork: true,
    choices: [
      { command: "open", label: "Open the Moon", effects: [effect("resources.moonlight", 20), effect("moon.instability", 18), scar("THERE IS A SMALLER MOON INSIDE THE MOON", "It has requested a transfer.")] },
      { command: "knock", label: "Knock back", effects: [effect("world.anomalyLevel", 10), effect("world.morale", 6)] },
      { command: "seal", label: "Apply celestial sealant", effects: [effect("resources.spareParts", -20), effect("moon.instability", -10)] },
    ],
  },
  {
    id: "unauthorized-sun", name: "UNAUTHORIZED SUN", description: "Something extremely bright is approaching from underneath the city.", rarity: "catastrophic", weight: 1,
    minimumShift: 10, minimumAnomaly: 40, maximumAnomaly: 100, durationSeconds: 65, thresholdUnique: 8, rewards: "Dawn postponed.", penalties: "Severe heat, pressure, and morale damage.", cooldownSeconds: 7200,
    streamMessage: "UNAUTHORIZED SUN APPROACHING FROM BELOW", chatMessage: "Unauthorized Sun: !shade, !tow, or !welcome", pausesNormalWork: true,
    choices: [
      { command: "shade", label: "Deploy municipal shade", effects: [effect("resources.scrap", -60), effect("machine.heat", 18), effect("world.morale", 8)] },
      { command: "tow", label: "Attach the spare cable", effects: [effect("machine.integrity", -12), effect("world.treasury", 500), scar("CABLE #2 REMEMBERS BEING CUT", "It tightens whenever anyone says sunrise.")] },
      { command: "welcome", label: "Update the sky occupancy form", effects: [effect("machine.heat", 45), effect("world.anomalyLevel", 18), scar("DAWN NOW ARRIVES FROM BELOW", "Residents are asked not to stare at the pavement.")] },
    ],
  },
  {
    id: "lunar-ground-contact", name: "LUNAR GROUND CONTACT", description: "The Moon has reached street level. Reconstruction crews request immediate direction.", rarity: "catastrophic", weight: 0,
    minimumShift: 1, minimumAnomaly: 0, maximumAnomaly: 100, durationSeconds: 70, thresholdUnique: 1, rewards: "A stranger, more resilient world.", penalties: "The city is reconstructed around the Moon.", cooldownSeconds: 86400,
    streamMessage: "THE MOON HAS ARRIVED — RECONSTRUCTION ACTIVE", chatMessage: "Catastrophic recovery: !rebuild, !excavate, or !rename", pausesNormalWork: true,
    choices: [
      { command: "rebuild", label: "Rebuild the winch above it", effects: [effect("machine.integrity", 30), effect("resources.scrap", -80), scar("THE CITY IS NOW ABOVE THE MOON", "Maps remain technically correct.")] },
      { command: "excavate", label: "Excavate beneath the Moon", effects: [effect("moon.altitude", 12), effect("world.treasury", -400), scar("GROUND LEVEL IS PROVISIONAL", "Basements require flight clearance.")] },
      { command: "rename", label: "Rename the event a delivery", effects: [effect("world.morale", 18), effect("world.treasury", 220), scar("THE CATASTROPHE WAS A DELIVERY", "No refunds will be issued.")] },
    ],
  },
];

export const eventById = (id: string) => EVENTS.find((event) => event.id === id);
