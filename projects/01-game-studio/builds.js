/* Original local game. These immutable configurations preserve the development rounds. */
(() => {
  "use strict";
  const builds = {
    v1: {
      name: "First footsteps",
      energyPlanning: false,
      pathfinding: false,
      courtesy: false,
      description: "Greedy walking and a fixed three-cell low-battery threshold.",
    },
    v2: {
      name: "Enough to get home",
      energyPlanning: true,
      pathfinding: false,
      courtesy: false,
      description: "Recharge fully and budget the outward journey, harvest, return, and two spare cells.",
    },
    v3: {
      name: "Around, not through",
      energyPlanning: true,
      pathfinding: true,
      courtesy: false,
      description: "Breadth-first paths route around rocks; energy budgets use the actual path length.",
    },
    v4: {
      name: "Room for everyone",
      energyPlanning: true,
      pathfinding: true,
      courtesy: true,
      description: "Reserve different patches, rotate move priority, and exchange places politely at a narrow crossing.",
    },
  };
  for (const build of Object.values(builds)) Object.freeze(build);
  globalThis.LittleSignalsBuilds = Object.freeze(builds);
})();
