import { refs } from "./firebase.js";
import { startOfWeek } from "./lib/time.js";

const listeners = [];
const boardRef = refs.progress.child("board");
const linksRef = refs.progress.child("links");
let board = null;
let links = null;
let connected = false;
let denied = false;

function notify() { listeners.forEach((fn) => fn()); }
export function onChange(fn) { listeners.push(fn); }
export function state() {
  return { board, links, connected, denied, ready: Boolean(board && links && !denied) };
}

export function init() {
  function refuse() {
    denied = true;
    board = links = null;
    notify();
  }
  boardRef.on("value", (snapshot) => {
    if (denied) return;
    const data = snapshot.val();
    board = { columns: data?.columns || {}, tasks: data?.tasks || {} };
    notify();
  }, refuse);
  linksRef.on("value", (snapshot) => {
    if (denied) return;
    links = snapshot.val() || {};
    notify();
  }, refuse);
  refs.connected.on("value", (snapshot) => {
    connected = snapshot.val() === true;
    notify();
  });
}

export function ordered(records, include = () => true) {
  return Object.entries(records).map(([id, item]) => ({ ...item, id }))
    .filter(include).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export const activeColumn = (column) => column && column.status === "active";
export const activeTask = (task) => task && !task.deletedAt && !task.completedAt;

export function tasksIn(data, columnId, include = activeTask) {
  return ordered(data.tasks, (task) => task.columnId === columnId && include(task));
}

export function nextPosition(items) {
  return (items.at(-1)?.position ?? -1) + 1;
}

function requireOnline() {
  if (!state().ready || !connected) throw new Error("Connect to save changes to Progress.");
}

// A move can touch two columns and several positions. Firebase retries this
// transaction against the current board, so a concurrent edit survives it.
export async function change(mutate) {
  requireOnline();
  let error;
  const result = await boardRef.transaction((current) => {
    try {
      error = null;
      const data = { ...current, columns: current?.columns || {}, tasks: current?.tasks || {} };
      mutate(data);
      return data;
    } catch (failure) {
      error = failure;
      return;
    }
  }, undefined, false);
  if (!result.committed) throw error || new Error("The board changed. Try again.");
}

export function requireItem(records, id, revision) {
  const item = records[id];
  if (!item) throw new Error("This item is no longer available.");
  if (revision !== undefined && (item.revision || 0) !== revision) {
    throw new Error("This item changed on another device. Reopen it to see the latest version.");
  }
  return item;
}

export function moveTask(data, id, columnId, beforeId) {
  const task = requireItem(data.tasks, id);
  if (!activeColumn(data.columns[columnId]) || task.deletedAt ||
      (beforeId && !activeTask(task))) throw new Error("This task can no longer be moved here.");
  const items = tasksIn(data, columnId).filter((item) => item.id !== id);
  const index = beforeId ? items.findIndex((item) => item.id === beforeId) : items.length;
  if (index < 0) throw new Error("The destination changed. Try moving the task again.");
  if (!task.completedAt) {
    items.splice(index, 0, { id });
    items.forEach((item, position) => { data.tasks[item.id].position = position; });
  } else {
    task.position = nextPosition(items);
  }
  if (task.columnId !== columnId) {
    task.columnId = columnId;
    task.revision = (task.revision || 0) + 1;
  }
}

export function shiftColumn(data, id, offset) {
  const columns = ordered(data.columns, activeColumn);
  const index = columns.findIndex((column) => column.id === id);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= columns.length) return;
  const [column] = columns.splice(index, 1);
  columns.splice(destination, 0, column);
  columns.forEach((item, position) => { data.columns[item.id].position = position; });
}

export async function saveNote(id, expected, note) {
  requireOnline();
  const result = await linksRef.child(id).transaction((link) => {
    if ((link?.note || "") !== expected) return;
    return { ...link, note: note || null };
  }, undefined, false);
  if (!result.committed) throw new Error("This session note changed. Reopen it before saving.");
}

// The session edit points to a private attribution. Stage it first so that
// saving or undoing the session changes its time and attribution together.
function attributionFor(target) {
  return target ? { columnId: target.columnId, ...(target.taskId && { taskId: target.taskId }) }
    : { unassigned: true };
}

export async function stageSessionTarget(id, target) {
  requireOnline();
  const revision = crypto.randomUUID();
  await linksRef.child(id + "/targets/" + revision).set(attributionFor(target));
  return revision;
}

export async function stageSessionTargets(entries) {
  requireOnline();
  const revisions = new Map();
  const updates = {};
  for (const { id, target } of entries) {
    const revision = crypto.randomUUID();
    revisions.set(id, revision);
    updates[id + "/targets/" + revision] = attributionFor(target);
  }
  await linksRef.update(updates);
  return revisions;
}

export function sessionLink(entry, associations = links) {
  const link = associations?.[entry.id];
  if (!entry.progressRevision || !link) return link;
  return { ...link.targets?.[entry.progressRevision], note: link.note };
}

export function summarize(entries, associations, now) {
  const columns = new Map();
  const tasks = new Map();
  const newestFirst = (a, b) => b.endedAt - a.endedAt || a.id.localeCompare(b.id);
  const monday = startOfWeek(now);
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  for (const entry of entries) {
    if (entry.removed) continue;
    const link = sessionLink(entry, associations);
    if (!link?.columnId) continue;
    const session = { ...entry, columnId: link.columnId, taskId: link.taskId, note: link.note };
    const column = columns.get(link.columnId) || { total: 0, week: 0, sessions: [] };
    column.total += entry.elapsedSeconds;
    if (entry.endedAt >= monday && entry.endedAt < nextMonday.getTime()) column.week += entry.elapsedSeconds;
    if (!link.taskId) column.sessions.push(session);
    columns.set(link.columnId, column);
    if (link.taskId) {
      const task = tasks.get(link.taskId) || { total: 0, sessions: [] };
      task.total += entry.elapsedSeconds;
      task.sessions.push(session);
      tasks.set(link.taskId, task);
    }
  }
  for (const item of [...columns.values(), ...tasks.values()]) item.sessions.sort(newestFirst);
  return { columns, tasks };
}
