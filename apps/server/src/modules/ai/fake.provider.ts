import type { AiProvider, AiRequest, AiResult } from "./provider";

/** مزوّد وهمي للاختبارات وللتجربة بلا اتصال: يرجع ردوداً محددة مسبقاً ويحفظ الطلبات */
export class FakeProvider implements AiProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly requests: AiRequest[] = [];
  private queue: Array<unknown | Error> = [];

  /** الرد التالي: كائن منظّم {reply, proposal} أو نص أو خطأ */
  enqueue(...responses: Array<unknown | Error>) {
    this.queue.push(...responses);
  }

  async complete(request: AiRequest): Promise<AiResult> {
    this.requests.push(request);
    const next = this.queue.shift() ?? { reply: "رد تجريبي" };
    if (next instanceof Error) throw next;
    return {
      text: typeof next === "string" ? next : JSON.stringify(next),
      structured: typeof next === "string" ? null : next,
      model: this.model,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0,
      durationMs: 5,
    };
  }
}
