import { TASK_PRIORITIES, TEAM_CODES, validateTaskRepository } from "./validate-task.mjs";

const { registry, errors } = validateTaskRepository();
if (errors.length > 0) {
  console.error("Task list tidak dapat dipercaya karena governance invalid:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const priorityRank = new Map(TASK_PRIORITIES.map((priority, index) => [priority, index]));
const unresolvedDependencies = (task) => task.dependsOn.filter((id) => registry.byId.get(id)?.status !== "DONE");
const isClear = (task) => unresolvedDependencies(task).length === 0;
const ageHours = (task) => {
  const updated = Date.parse(`${task.updated}T00:00:00Z`);
  return Number.isNaN(updated) ? 0 : Math.max(0, (Date.now() - updated) / 3_600_000);
};

const formatTask = (task) => {
  const stale = ageHours(task) > 72 ? " | STALE>72H" : "";
  const dependencies = unresolvedDependencies(task);
  const waiting = dependencies.length ? ` | waits ${dependencies.join(",")}` : "";
  const guard = task.guarded === "YES" ? " | GUARDED" : "";
  return `${task.id} | ${task.priority} | ${task.status} | ${task.risk}${guard}${waiting}${stale}`;
};

const sortTasks = (tasks) => [...tasks].sort((a, b) =>
  priorityRank.get(a.priority) - priorityRank.get(b.priority)
  || a.updated.localeCompare(b.updated)
  || a.id.localeCompare(b.id));

console.log("SALDO BERSAMA TASK QUEUE");
console.log("========================");
for (const team of TEAM_CODES) {
  const tasks = sortTasks(registry.active.filter((task) => task.team === team));
  if (tasks.length === 0) continue;
  console.log(`\n${team}`);
  tasks.forEach((task) => console.log(`- ${formatTask(task)}`));
}

const inProgress = sortTasks(registry.active.filter((task) => task.status === "IN_PROGRESS"));
const approved = sortTasks(registry.active.filter((task) => task.status === "APPROVED" && isClear(task)));
const blocked = sortTasks(registry.active.filter((task) => task.status === "ON_HOLD" || !isClear(task)));

console.log("\nIN PROGRESS");
if (inProgress.length === 0) console.log("- none");
else inProgress.forEach((task) => console.log(`- ${formatTask(task)}`));

console.log("\nREADY TO START");
if (approved.length === 0) console.log("- none");
else approved.forEach((task) => console.log(`- ${formatTask(task)}`));

console.log("\nBLOCKED / HOLD");
if (blocked.length === 0) console.log("- none");
else blocked.forEach((task) => console.log(`- ${formatTask(task)}`));

console.log("\nCOORD RECOMMENDED NEXT");
if (inProgress.length > 0) {
  console.log(`- lanjutkan task aktif berisiko tertinggi: ${inProgress[0].id} (${inProgress[0].team}).`);
  if (inProgress.length > 1) console.log(`- ${inProgress.length} task sedang berjalan paralel; pastikan Write Scope tetap tidak overlap.`);
} else if (approved.length > 0) {
  console.log(`- mulai ${approved[0].id} (${approved[0].team}) karena dependency clear dan priority tertinggi.`);
} else if (blocked.length > 0) {
  console.log(`- selesaikan blocker untuk ${blocked[0].id}.`);
} else {
  console.log("- tidak ada task aktif; COORD dapat membuat task berikutnya.");
}
