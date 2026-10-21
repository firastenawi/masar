/**
 * عرض بسيط لنص المساعد: كتل الكود ```...``` تُعرض من اليسار لليمين بخط ثابت،
 * وباقي النص يحافظ على الأسطر والقوائم كما هي. (بلا مكتبة Markdown في هذه المرحلة.)
 */
export function MessageText({ text }: { text: string }) {
  const parts = text.split(/```[\w-]*\n?([\s\S]*?)```/g);

  return (
    <div className="space-y-2 leading-relaxed">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            dir="ltr"
            className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-start font-mono text-sm text-slate-100"
          >
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          part.trim() && (
            <p key={i} className="whitespace-pre-wrap" dir="auto">
              {renderInlineCode(part.trim())}
            </p>
          )
        ),
      )}
    </div>
  );
}

/** `كود` داخل السطر */
function renderInlineCode(text: string) {
  return text.split(/`([^`\n]+)`/g).map((chunk, i) =>
    i % 2 === 1 ? (
      <code key={i} dir="ltr" className="rounded bg-slate-100 px-1 font-mono text-[0.9em] dark:bg-slate-800">
        {chunk}
      </code>
    ) : (
      chunk
    ),
  );
}
