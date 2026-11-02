import { acquireLock, jsonGet, redis } from "../config/redis.js";

// A registration assistance task asks a BLO to contact a prospective elector and help them file
// Form 6. Finishing a task never enrols anyone; the Form 6 application still goes through field
// verification and the ERO/AERO decision.

const key = (id) => `regtask:${id}`;

export const getTask = (id) => jsonGet(key(id));
export const saveTask = (task, tx) => {
    tx.set(key(task._id), JSON.stringify(task));
    tx.sAdd("regtasks:all", task._id);
};
export const listTasks = async () =>
    (await Promise.all((await redis().sMembers("regtasks:all")).map(getTask))).filter(Boolean);
export const lockTask = (id) => acquireLock(`regtask:lock:${id}`);
