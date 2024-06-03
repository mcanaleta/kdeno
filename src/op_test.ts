import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { opReadString } from "./op.ts"; // replace with the actual path to your module

Deno.test("opRead should return data for valid URL", async () => {
  // Mocking Deno.Command to simulate the `op` command output

  // Replace the Deno.Command with the mock
  const originalCommand = Deno.Command;
  // @ts-ignore - Deno.Command is a read-only property
  Deno.Command = function () {
    return {
      output: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          stdout: new TextEncoder().encode("test data\n"),
          stderr: new Uint8Array(),
        };
      },
    };
  };

  try {
    const result = await opReadString("op://vault/item/field");
    assert(result === "test data");
  } finally {
    // @ts-ignore - Deno.Command is a read-only property
    Deno.Command = originalCommand;
  }
});
