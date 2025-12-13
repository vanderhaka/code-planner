"use client";

import { useState } from "react";
import Link from "next/link";
import type { Chat } from "@/lib/chats";

type Props = {
  chats: Chat[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
};

export function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: Props) {
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white/80 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight">Code Planner</div>
        <button className="btn" onClick={onNewChat} type="button">
          New chat
        </button>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-neutral-500">Chats</div>
        <div className="mt-2 space-y-1">
          {chats.map((chat) => {
            const active = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                className={
                  active
                    ? "flex items-center justify-between rounded-xl border border-neutral-900 bg-white px-3 py-2"
                    : "flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
                }
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="truncate text-sm font-medium">{chat.title}</div>
                  {chat.repo ? (
                    <div className="truncate text-xs text-neutral-500">{chat.repo}</div>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-danger ml-2 px-2 py-1 text-xs"
                  onClick={() => setChatToDelete(chat.id)}
                  aria-label="Delete chat"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <Link href="/settings" className="btn w-full">
          Settings
        </Link>
      </div>

      {chatToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-sm" role="dialog" aria-modal="true">
            <div className="p-5">
              <h3 className="text-lg font-semibold">Delete chat?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                This will permanently delete this chat and its history.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setChatToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onDeleteChat(chatToDelete);
                    setChatToDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}
