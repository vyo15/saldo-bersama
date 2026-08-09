import { TASK_PRIORITIES, TEAM_CODES, validateTaskRepository } from "./validate-task.mjs";

const { registry, errors } = validateTaskRepository();
if (errors.length > 0) {
  console.error("Task list tidak dapat dipercaya karena governance invalid:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const priorityRank = new Map(TASK_PRIORITIES.map((priority, index) => [priority, index]));
const reverseDependencies = new Map();
for (const task of registry.all) {
  for (const dependency of task.dependsOn) {
    const children = reverseDependencies.get(dependency) || new Set();
    children.add(task.id);
    reverseDependencies.set(dependency, children);
  }
}

const descendants = (id, seen = new Set()) => {
  for (const child of reverseDependencies.get(id) || []) {
    if (seen.has(child)) continue;
    seen.add(child);
    descendants(child, seen);
  }
  return seen;
};

const unresolvedDependencies = (task) => task.dependsOn.filter((id) => registry.byId.get(id)?.status !== "DONE");
const isClear = (task) => unresolvedDependencies(task).length === 0;
const ageHours = (task) => {
  const updated = Date.parse(`${task.updated}T00:00:00Z`);
  return Number.isNaN(updated) ? 0 : Math.max(0, (Date.now() - updated) / 3_600_000);
};

const rootBlockers = (task) => {
  const roots = new Set();
  const visit = (id, trail = new Set()) => {
    if (trail.has(id)) return;
    const dependency = registry.byId.get(id);
    if (!dependency || dependency.status === "DONE") return;
    const unresolved = unresolvedDependencies(dependency);
    if (unresolved.length === 0) {
      roots.add(id);
      return;
    }
    const nextTrail = new Set(trail).add(id);
    unresolved.forEach((next) => visit(next, nextTrail));
  };
  unresolvedDependencies(task).forEach((id) => visit(id));
  return [...roots].sort();
};

const formatTask = (task) => {
  const blocks = descendants(task.id).size;
  const stale = ageHours(task) > 72 ? " | STALE>72H" : "";
  const dependencies = unresolvedDependencies(task);
  const waiting = dependencies.length ? ` | waits ${dependencies.join(",")}` : "";
  return `${task.id} | ${task.priority} | ${task.status} | ${task.workPackage} | blocks ${blocks}${waiting}${stale}`;
};

console.log("SALDO BERSAMA TASK QUEUE");
console.log("========================");
for (const team of TEAM_CODES) {
  const tasks = registry.active.filter((task) => task.team === team);
  if (tasks.length === 0) continue;
  console.log(`\n${team}`);
  for (const task of tasks.sort((a, b) => priorityRank.get(a.priority) - priorityRank.get(b.priority) || a.id.localeCompare(b.id))) {
    console.log(`- ${formatTask(task)}`);
    if (task.status === "ON_HOLD") {
      const roots = rootBlockers(task);
      console.log(`  root blocker: ${roots.length ? roots.join(", ") : "dependency clear; review untuk resume"}`);
    }
  }
}

const available = registry.active
  .filter((task) => task.status === "APPROVED" && isClear(task))
  .sort((a, b) => {
    const priority = priorityRank.get(a.priority) - priorityRank.get(b.priority);
    if (priority !== 0) return priority;
    const blocks = descendants(b.id).size - descendants(a.id).size;
    if (blocks !== 0) return blocks;
    return a.updated.localeCompare(b.updated) || a.id.localeCompare(b.id);
  });

const resumeAvailable = registry.active
  .filter((task) => task.status === "ON_HOLD" && isClear(task))
  .sort((a, b) => priorityRank.get(a.priority) - priorityRank.get(b.priority) || a.updated.localeCompare(b.updated));

const readyForQa = registry.active.filter((task) => task.status === "READY_FOR_QA");
const readyForMerge = registry.active.filter((task) => task.status === "READY_FOR_MERGE");

console.log("\nAVAILABLE NOW");
if (available.length === 0) console.log("- none");
else available.forEach((task) => console.log(`- ${formatTask(task)}`));

console.log("\nRESUME REVIEW");
if (resumeAvailable.length === 0) console.log("- none");
else resumeAvailable.forEach((task) => console.log(`- ${formatTask(task)} | dependency sudah clear`));

console.log("\nREADY FOR QA");
if (readyForQa.length === 0) console.log("- none");
else readyForQa.forEach((task) => console.log(`- ${formatTask(task)}`));

console.log("\nREADY FOR MERGE");
if (readyForMerge.length === 0) console.log("- none");
else readyForMerge.forEach((task) => console.log(`- ${formatTask(task)}`));

const inProgress = registry.active
  .filter((task) => task.status === "IN_PROGRESS")
  .sort((a, b) => priorityRank.get(a.priority) - priorityRank.get(b.priority)
    || descendants(b.id).size - descendants(a.id).size
    || a.updated.localeCompare(b.updated));
const recommended = available[0];
console.log("\nRECOMMENDED NEXT");
if (inProgress[0]) {
  console.log(`- lanjutkan ${inProgress[0].id} | ${inProgress[0].team} | ${inProgress[0].priority} | ${inProgress[0].workPackage}`);
  console.log(`  task sedang IN_PROGRESS; selesaikan/checkpoint sebelum team mengambil task lain.`);
} else if (recommended) {
  console.log(`- ${recommended.id} | ${recommended.team} | ${recommended.priority} | ${recommended.workPackage}`);
  console.log(`  membuka ${descendants(recommended.id).size} task downstream.`);
} else if (resumeAvailable[0]) {
  console.log(`- review resume ${resumeAvailable[0].id} | ${resumeAvailable[0].team} | dependency sudah clear.`);
} else if (readyForQa[0]) {
  console.log(`- QA ${readyForQa[0].id} agar pipeline dapat bergerak ke merge.`);
} else if (readyForMerge[0]) {
  console.log(`- integrate ${readyForMerge[0].id} melalui COORD.`);
} else {
  console.log("- tidak ada task actionable; periksa ON_HOLD atau buat task baru melalui COORD.");
}
