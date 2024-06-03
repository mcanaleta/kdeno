import { exec, execOutput, execString } from "./exec.ts";

export class SshServer {
  constructor(
    public name: string,
    public hostname: string,
    public user: string
  ) {}

  getUserServer(): string {
    return this.user ? `${this.user}@${this.hostname}` : this.hostname;
  }

  execOutput(command: string): Promise<Uint8Array> {
    return execOutput("ssh", [this.getUserServer(), command]);
  }

  execString(command: string): Promise<string> {
    return execString("ssh", [this.getUserServer(), command]);
  }

  exec(command: string): Promise<void> {
    return exec("ssh", [this.getUserServer(), command]);
  }
}
