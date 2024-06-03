export async function execOutput(name: string, args: string[]) {
  const cmd = new Deno.Command(name, {
    args: args,
  });
  const output = await cmd.output();
  return output.stdout;
}

export async function execString(name: string, args: string[]) {
  const output = await execOutput(name, args);
  return new TextDecoder().decode(output);
}

export async function exec(name: string, args: string[]) {
  const cmd = new Deno.Command(name, {
    args: args,
    stdin: "inherit",
    stdout: "inherit",
  });
  await cmd.output();
}
