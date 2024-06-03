/**
 * Reads data from a given 1Password item using the 1Password CLI (op).
 * @param url - The URL to read data from using the op command.
 * @returns - A promise that resolves to the read data as a string.
 */
export async function opReadString(url: string): Promise<string> {
  const cmd = new Deno.Command("op", {
    args: ["read", url],
  });
  const output = await cmd.output();
  const txt = new TextDecoder().decode(output.stdout).trimEnd();
  return txt;
}
