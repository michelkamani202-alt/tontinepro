// Persistance locale (localStorage), avec repli en mémoire si le stockage est indisponible.
import { makeReceiptNo, removeMember as removeGroupMember } from './lib.js';

export const STORAGE_KEY = 'tontinepro:v1';

export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      data.set(k, String(v));
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const emptyState = () => ({
  version: 1,
  counter: 0,
  profile: { name: '', phone: '' },
  activeGroupId: null,
  groups: [],
});

function isValidGroup(g) {
  return (
    g &&
    typeof g === 'object' &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    Number.isInteger(g.amount) &&
    typeof g.frequency === 'string' &&
    typeof g.startDate === 'string' &&
    Array.isArray(g.members) &&
    Array.isArray(g.order) &&
    Array.isArray(g.payments) &&
    Array.isArray(g.payouts) &&
    g.order.length > 0 &&
    g.order.every((id) => g.members.some((m) => m.id === id))
  );
}

function isValidState(s) {
  return (
    s &&
    typeof s === 'object' &&
    Array.isArray(s.groups) &&
    Number.isInteger(s.counter) &&
    s.groups.every(isValidGroup)
  );
}

export function createStore(storage) {
  let backend = storage || memoryStorage();
  let state = emptyState();

  function load() {
    let rawValue = null;
    try {
      rawValue = backend.getItem(STORAGE_KEY);
    } catch {
      backend = memoryStorage();
      return state;
    }
    if (!rawValue) return state;
    try {
      const parsed = JSON.parse(rawValue);
      if (isValidState(parsed)) {
        state = { ...emptyState(), ...parsed, profile: { ...emptyState().profile, ...(parsed.profile || {}) } };
        return state;
      }
    } catch {
      // données illisibles : sauvegardées ci-dessous
    }
    try {
      backend.setItem(STORAGE_KEY + ':corrupt', rawValue);
    } catch {
      // ignoré
    }
    state = emptyState();
    return state;
  }

  function save() {
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  load();

  return {
    get: () => state,
    save,
    getGroup: (id) => state.groups.find((g) => g.id === id) || null,
    addGroup(group) {
      state.groups.push(group);
      state.activeGroupId = group.id;
      return save();
    },
    removeGroup(id) {
      const index = state.groups.findIndex((group) => group.id === id);
      if (index < 0) return false;
      const previousActiveGroupId = state.activeGroupId;
      const [removed] = state.groups.splice(index, 1);
      if (state.activeGroupId === id) state.activeGroupId = state.groups[0]?.id || null;
      if (save()) return true;
      state.groups.splice(index, 0, removed);
      state.activeGroupId = previousActiveGroupId;
      return false;
    },
    removeMember(groupId, memberId) {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) return { errors: [{ field: 'group', message: 'Ce groupe n’existe plus.' }] };
      const previousMembers = group.members.slice();
      const previousOrder = group.order;
      const result = removeGroupMember(group, memberId);
      if (result.errors) return result;
      if (save()) return result;
      group.members = previousMembers;
      group.order = previousOrder;
      return { errors: [{ field: 'storage', message: 'La suppression n’a pas pu être enregistrée.' }] };
    },
    setActive(id) {
      if (state.activeGroupId !== id) {
        state.activeGroupId = id;
        return save();
      }
      return true;
    },
    setProfile(name, phone) {
      state.profile = { name, phone };
      return save();
    },
    replaceState(nextState) {
      if (!isValidState(nextState)) return false;
      const previous = state;
      state = {
        ...emptyState(),
        ...nextState,
        profile: { ...emptyState().profile, ...(nextState.profile || {}) },
      };
      if (save()) return true;
      state = previous;
      return false;
    },
    nextReceiptNo(now = new Date()) {
      state.counter += 1;
      return makeReceiptNo(now.getFullYear(), state.counter);
    },
  };
}
