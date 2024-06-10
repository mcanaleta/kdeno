export async function execOutput(
  name: string,
  args: string[]
): Promise<Uint8Array> {
  const cmd = new Deno.Command(name, {
    args: args,
  });
  const output = await cmd.output();
  return output.stdout;
}

export async function execString(
  name: string,
  args: string[]
): Promise<string> {
  const output = await execOutput(name, args);
  return new TextDecoder().decode(output);
}

export async function exec(name: string, args: string[]) {
  const cmd = new Deno.Command(name, {
    args: args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const out = await cmd.output();
  if (!out.success) {
    throw new Error(`Exit status: ${out.code}`);
  }
}

export async function execCaptureString(
  cmd: Deno.Command,
  check: boolean = true
): Promise<string> {
  const output = await cmd.output();
  if (check && !output.success) {
    throw new Error(`Exit status: ${output.code}`);
  }
  return new TextDecoder().decode(output.stdout);
}

export async function execCheck(cmd: Deno.Command) {
  const output = await cmd.output();
  if (!output.success) {
    throw new Error(`Exit status: ${output.code}`);
  }
}
