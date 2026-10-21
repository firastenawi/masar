import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push-client";

describe("urlBase64ToUint8Array", () => {
  it("يفك base64url بلا حشو", () => {
    // "hello" = aGVsbG8 (بلا =)
    expect([...urlBase64ToUint8Array("aGVsbG8")]).toEqual([104, 101, 108, 108, 111]);
    // الرموز - و _ بدل + و /
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([251, 255]);
  });
});
