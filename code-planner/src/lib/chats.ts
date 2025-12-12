export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  repo: string | null;
};

const CHATS_KEY = "code-planner-chats";
const ACTIVE_CHAT_KEY = "code-planner-active-chat";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listChats(): Chat[] {
  return readJson<Chat[]>(CHATS_KEY, []);
}

export function getActiveChatId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CHAT_KEY);
}

export function setActiveChatId(id: string) {
  localStorage.setItem(ACTIVE_CHAT_KEY, id);
}

export function createChat(title?: string, repo?: string): Chat {
  const chats = listChats();
  const newChat: Chat = {
    id: crypto.randomUUID(),
    title: title ?? `Chat ${chats.length + 1}`,
    createdAt: Date.now(),
    repo: repo ?? null,
  };
  const updated = [newChat, ...chats];
  writeJson(CHATS_KEY, updated);
  setActiveChatId(newChat.id);
  return newChat;
}

export function deleteChat(id: string) {
  const chats = listChats();
  const updated = chats.filter((c) => c.id !== id);
  writeJson(CHATS_KEY, updated);

  const active = getActiveChatId();
  if (active === id) {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}
