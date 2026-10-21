import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authStatusSchema, setupSchema } from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, card, input } from "../../components/ui";
import { apiGet, apiSend, UNAUTHENTICATED_EVENT } from "../../lib/api";
import { useRoadmapMutation } from "../paths/api";

const AUTH_KEY = ["auth", "status"] as const;

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_KEY,
    queryFn: () => apiGet("/api/auth/status", authStatusSchema),
    staleTime: 60_000,
  });
}

/** لا يُعرض التطبيق إلا بعد تسجيل الدخول؛ وأول مرة يُطلب ضبط كلمة المرور */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStatus();

  // أي طلب يرجع 401 (انتهت الجلسة مثلاً) يعيد فحص الحالة فتظهر شاشة الدخول
  useEffect(() => {
    const onUnauthenticated = () => void queryClient.invalidateQueries({ queryKey: AUTH_KEY });
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, [queryClient]);

  if (status.isPending) return <Centered><p className="text-slate-500">{t("common.loading")}</p></Centered>;
  if (status.isError) {
    return (
      <Centered>
        <p>{t("health.error")}</p>
        <button className={`${btnSecondary} mt-3`} onClick={() => status.refetch()}>{t("common.retry")}</button>
      </Centered>
    );
  }
  if (status.data.authenticated) return <>{children}</>;
  if (!status.data.configured) return <SetupScreen allowed={status.data.setupAllowed} />;
  return <LoginScreen />;
}

function Centered({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className={`${card} w-full max-w-sm p-6`}>
        <div className="mb-5 text-center">
          <div className="text-3xl font-bold text-brand-700 dark:text-brand-100">{t("app.name")}</div>
          <div className="text-sm text-slate-500">{t("app.tagline")}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** بعد الدخول نحدّث كل البيانات (كانت ترجع 401 قبل ذلك) */
function useAfterAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

function LoginScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const afterAuth = useAfterAuth();
  const login = useRoadmapMutation((pw: string) => apiSend("POST", "/api/auth/login", { password: pw }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password) login.mutate(password, { onSuccess: afterAuth });
  }

  return (
    <Centered>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={login.error?.message} />
        <Field label={t("auth.password")}>
          <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" dir="ltr" />
        </Field>
        <button type="submit" className={`${btnPrimary} w-full`} disabled={login.isPending || !password}>
          {t("auth.login")}
        </button>
      </form>
    </Centered>
  );
}

function SetupScreen({ allowed }: { allowed: boolean }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const afterAuth = useAfterAuth();
  const setup = useRoadmapMutation((pw: string) => apiSend("POST", "/api/auth/setup", { password: pw }));

  if (!allowed) {
    return (
      <Centered>
        <p className="text-sm leading-relaxed">{t("auth.setupLocalOnly")}</p>
      </Centered>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = setupSchema.safeParse({ password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    if (password !== confirm) return setError(t("auth.mismatch"));
    setError(null);
    setup.mutate(password, { onSuccess: afterAuth });
  }

  return (
    <Centered>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("auth.setupIntro")}</p>
        <FormError message={error ?? setup.error?.message} />
        <Field label={t("auth.newPassword")}>
          <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" dir="ltr" />
        </Field>
        <Field label={t("auth.confirmPassword")}>
          <input type="password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" />
        </Field>
        <button type="submit" className={`${btnPrimary} w-full`} disabled={setup.isPending}>
          {t("auth.setupSubmit")}
        </button>
      </form>
    </Centered>
  );
}
