import { exec, execOutput, execString } from "./exec.ts";

export class SshServer {
  constructor(
    public name: string,
    public hostname: string,
    public user: string
  ) {}

  getUserServer() {
    return this.user ? `${this.user}@${this.hostname}` : this.hostname;
  }

  execOutput(command: string) {
    return execOutput("ssh", [this.getUserServer(), command]);
  }

  execString(command: string) {
    return execString("ssh", [this.getUserServer(), command]);
  }

  exec(command: string) {
    return exec("ssh", [this.getUserServer(), command]);
  }
}
