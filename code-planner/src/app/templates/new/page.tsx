"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings";
import { saveTemplate } from "@/lib/prompt-templates";
import type { ProviderId } from "@/lib/model-catalog";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function NewTemplatePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const loadedSettings = getSettings();
    setSettings(loadedSettings);
    
    // Set default provider to first enabled one
    if (loadedSettings.models.length > 0) {
      const firstProvider = loadedSettings.models[0];
      setSelectedProvider(firstProvider);
      setSelectedModelId(loadedSettings.selectedModels[firstProvider]);
    }
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Send initial greeting when provider is selected
    if (mounted && selectedProvider && messages.length === 0) {
      const initialMessage: ChatMessage = {
        role: "assistant",
        content: "Hello! I'm here to help you create an effective prompt template. What kind of template would you like to create? Tell me about its purpose and what you want it to accomplish.",
      };
      setMessages([initialMessage]);
    }
  }, [mounted, selectedProvider, messages.length]);

  const handleSend = async () => {
    if (!input.trim() || !selectedProvider || loading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Debug logging
      console.log("[Template New] Sending request:", {
        provider: selectedProvider,
        modelId: selectedModelId,
        settings: settings?.selectedModels,
      });
      
      const res = await fetch("/api/templates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          provider: selectedProvider,
          modelId: selectedModelId,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to get response");
      }

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.content,
      };
      setMessages([...newMessages, assistantMessage]);

      // Try to extract system prompt if the AI says it's ready
      // Look for patterns like "Here's the system prompt:" or markdown code blocks
      const content = data.content;
      const codeBlockMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        const extracted = codeBlockMatch[1].trim();
        if (extracted.length > 50) {
          // Likely a system prompt
          setGeneratedSystemPrompt(extracted);
        }
      } else if (content.toLowerCase().includes("system prompt") && content.length > 100) {
        // If AI mentions system prompt but no code block, use the whole response
        // User can refine it
        setGeneratedSystemPrompt(content);
      }
    } catch (e) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Error: ${(e as Error).message}. Please try again.`,
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!name.trim() || !generatedSystemPrompt) return;

    const created = saveTemplate({
      name: name.trim(),
      description: description.trim(),
      systemPrompt: generatedSystemPrompt,
    });

    router.push(`/?template=${created.id}`);
    router.refresh();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!mounted || !settings) {
    return null;
  }

  const availableProviders = settings.models;
  const canSave = Boolean(name.trim() && generatedSystemPrompt);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="btn">
                ← Back
              </Link>
              <h1 className="text-xl font-semibold">New Template</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-6 py-6">
          {/* Template Metadata */}
          <div className="mb-6 space-y-4">
            <div>
              <label htmlFor="template-name" className="mb-1 block text-sm font-medium text-neutral-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="template-name"
                className="input"
                placeholder="e.g. Code Review"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="template-description" className="mb-1 block text-sm font-medium text-neutral-700">
                Description
              </label>
              <input
                id="template-description"
                className="input"
                placeholder="Optional short description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="model-select" className="mb-1 block text-sm font-medium text-neutral-700">
                AI Model
              </label>
              <select
                id="model-select"
                className="input"
                value={selectedProvider ? `${selectedProvider}:${selectedModelId || ""}` : ""}
                onChange={(e) => {
                  const [provider, modelId] = e.target.value.split(":");
                  setSelectedProvider(provider as ProviderId);
                  setSelectedModelId(modelId || null);
                }}
              >
                <option value="">Select a model</option>
                {availableProviders.map((provider) => {
                  const modelId = settings.selectedModels[provider];
                  return (
                    <option key={provider} value={`${provider}:${modelId || ""}`}>
                      {provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "Google"} {modelId ? `(${modelId})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="card flex flex-1 flex-col overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Conversation</h2>
              <p className="card-subtitle">Chat with AI to refine your template's system prompt</p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-neutral-100 rounded-xl px-4 py-2">
                    <div className="text-sm text-neutral-600">Thinking...</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-neutral-200 p-4">
              <div className="flex gap-2">
                <textarea
                  className="input min-h-20 flex-1 resize-none"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!selectedProvider || loading}
                />
                <button
                  className="btn btn-primary self-end"
                  onClick={handleSend}
                  disabled={!input.trim() || !selectedProvider || loading}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Generated System Prompt Preview */}
          {generatedSystemPrompt && (
            <div className="mt-6 card">
              <div className="card-header">
                <h3 className="card-title">Generated System Prompt</h3>
                <p className="card-subtitle">Review and edit if needed</p>
              </div>
              <div className="p-5">
                <textarea
                  className="input min-h-48 font-mono text-sm"
                  value={generatedSystemPrompt}
                  onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
                  placeholder="System prompt will appear here..."
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-6 flex justify-end">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!canSave}
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

