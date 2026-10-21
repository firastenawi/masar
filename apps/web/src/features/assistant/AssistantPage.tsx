import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ConversationDetail } from "@masar/shared";
import { EmptyState, FormError, btnPrimary, btnSecondary, card, iconBtn, input } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { usePath, usePaths, useRoadmapMutation } from "../paths/api";
import { useNow } from "../sessions/timer";
import { assistantApi, useAiStatus, useConversation, useConversations } from "./api";
import { MessageText } from "./MessageText";
import { ProposalCard } from "./ProposalCard";

const QUICK_PROMPTS = ["planWeek", "nextStep", "explain", "exercise", "review"] as const;

export function AssistantPage() {
  const { conversationId } = useParams();
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-6xl gap-6 md:h-[calc(100vh-6rem)]">
      {/* على الهاتف: القائمة أو المحادثة؛ على الكمبيوتر: الاثنتان */}
      <aside className={`w-full shrink-0 md:block md:w-64 ${conversationId ? "hidden" : ""}`}>
        <ConversationList activeId={conversationId} />
      </aside>
      <section className={`min-w-0 flex-1 ${conversationId ? "" : "hidden md:block"}`}>
        {conversationId ? (
          <Chat key={conversationId} conversationId={conversationId} />
        ) : (
          <EmptyState title={t("assistant.pickOrStart")} hint={t("assistant.intro")} />
        )}
      </section>
    </div>
  );
}

function ConversationList({ activeId }: { activeId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversations = useConversations();
  const paths = usePaths();
  const status = useAiStatus();
  const [pathId, setPathId] = useState("");

  const create = useRoadmapMutation((pid: string | null) => assistantApi.createConversation(pid));

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-2xl font-bold">{t("nav.assistant")}</h1>
      <div className={`${card} space-y-2 p-3`}>
        <select className={input} value={pathId} onChange={(e) => setPathId(e.target.value)} aria-label={t("assistant.aboutPath")}>
          <option value="">{t("assistant.generalChat")}</option>
          {paths.data?.map((p) => <option key={p.id} value={p.id}>{t("assistant.aboutPathOption", { title: p.title })}</option>)}
        </select>
        <button
          className={`${btnPrimary} w-full`}
          disabled={create.isPending}
          onClick={() => create.mutate(pathId || null, { onSuccess: (res) => void navigate(`/assistant/${res!.id}`) })}
        >
          ＋ {t("assistant.newChat")}
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {conversations.data?.map((c) => (
          <li key={c.id}>
            <Link
              to={`/assistant/${c.id}`}
              className={`block rounded-lg px-3 py-2 text-sm ${
                c.id === activeId ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-100" : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span className="block truncate" dir="auto">{c.title}</span>
              <span className="block truncate text-xs text-slate-400" dir="auto">
                {c.pathTitle ?? t("assistant.general")} · {formatDateTime(c.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {status.data && (
        <p className="text-xs text-slate-400">
          {status.data.provider === "claude-code" ? "Claude Code" : status.data.provider}
          {status.data.model ? ` · ${status.data.model}` : ""} ·{" "}
          {t("assistant.usage", { used: status.data.requestsToday, limit: status.data.dailyLimit })}
        </p>
      )}
    </div>
  );
}

function Chat({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversation = useConversation(conversationId);
  const path = usePath(conversation.data?.pathId ?? "");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useRoadmapMutation((content: string) => assistantApi.send(conversationId, content));
  const archive = useRoadmapMutation(() => assistantApi.archiveConversation(conversationId));

  const messageCount = conversation.data?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, send.isPending]);

  if (conversation.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (conversation.isError) return <EmptyState title={t("common.loadError")} hint={conversation.error.message} />;

  const data: ConversationDetail = conversation.data;
  // سؤال المستخدم يظهر فوراً أثناء انتظار الرد (الخادم يحفظه قبل استدعاء المساعد)
  const pendingQuestion = send.isPending ? send.variables : null;
  const lastSaved = data.messages.at(-1);
  const showPending = pendingQuestion && !(lastSaved?.role === "user" && lastSaved.content === pendingQuestion);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate(content, { onSuccess: () => setDraft("") });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-3 flex items-center gap-2">
        <Link to="/assistant" className={`${iconBtn} md:hidden`} aria-label={t("common.back")}>→</Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold" dir="auto">{data.title}</h2>
          {data.pathId && (
            <Link to={`/paths/${data.pathId}`} className="text-xs text-brand-700 hover:underline dark:text-brand-100" dir="auto">
              {t("assistant.aboutPathOption", { title: data.pathTitle })}
            </Link>
          )}
        </div>
        <button
          className={iconBtn}
          aria-label={t("common.archive")}
          title={t("common.archive")}
          onClick={() => window.confirm(t("assistant.confirmArchive")) && archive.mutate(undefined, { onSuccess: () => void navigate("/assistant") })}
        >
          🗑
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {data.messages.length === 0 && !showPending && (
          <div className="space-y-3 py-6">
            <p className="text-slate-500">{t("assistant.intro")}</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((key) => (
                <button key={key} className={btnSecondary} onClick={() => setDraft(t(`assistant.quick.${key}`))}>
                  {t(`assistant.quick.${key}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {data.messages.map((message) =>
          message.role === "user" ? (
            <UserBubble key={message.id} text={message.content} />
          ) : (
            <div key={message.id} className={`${card} p-4`}>
              <MessageText text={message.content} />
              {message.proposal && <ProposalCard proposal={message.proposal} path={path.data} />}
            </div>
          ),
        )}

        {showPending && <UserBubble text={pendingQuestion} />}
        {send.isPending && <Thinking />}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <FormError message={send.error?.message} />
        <div className="flex items-end gap-2">
          <textarea
            className={`${input} max-h-48 min-h-[2.75rem] resize-y`}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("assistant.placeholder")}
            dir="auto"
            maxLength={8000}
          />
          <button type="submit" className={btnPrimary} disabled={send.isPending || !draft.trim()}>
            {t("assistant.send")}
          </button>
        </div>
        <p className="text-xs text-slate-400">{t("assistant.hint")}</p>
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-sm bg-brand-700 px-4 py-2.5 text-white" dir="auto">
        {text}
      </div>
    </div>
  );
}

function Thinking() {
  const { t } = useTranslation();
  const [started] = useState(() => Date.now());
  const now = useNow();
  return (
    <div className={`${card} flex items-center gap-3 p-4 text-sm text-slate-500`} role="status">
      <span className="inline-flex gap-1" aria-hidden>
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600" />
      </span>
      {t("assistant.thinking", { seconds: Math.floor((now - started) / 1000) })}
    </div>
  );
}
